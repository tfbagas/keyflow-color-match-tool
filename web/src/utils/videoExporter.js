import { Muxer, ArrayBufferTarget } from "mp4-muxer";
import { scaleParamsByStrength, sanitizeParams } from "./gradeEngine";
import { getEngineCodename } from "./engineRegistry";
import { createWebGLFrameGrader } from "./imageExporter";

const H264_CODEC_CANDIDATES = [
  "avc1.640028", // High Profile Level 4.0 (up to 1080p)
  "avc1.4d002a", // Main Profile Level 4.2 (up to 1080p60)
  "avc1.420028", // Baseline Profile Level 4.0 (up to 1080p)
  "avc1.640033", // High Profile Level 5.1
  "avc1.42001f", // Baseline Profile Level 3.1
];

function triggerBlobDownload(blob, fileName) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = fileName;
  a.style.display = "none";
  document.body.appendChild(a);
  a.click();
  setTimeout(() => {
    try {
      document.body.removeChild(a);
    } catch {
      // ignore
    }
    URL.revokeObjectURL(url);
  }, 1500);
}

async function negotiateH264Config(width, height, bitrateBps, fps = 30) {
  if (typeof VideoEncoder === "undefined" || typeof VideoFrame === "undefined") {
    return null;
  }
  for (const codec of H264_CODEC_CANDIDATES) {
    for (const hw of ["prefer-hardware", "no-preference"]) {
      const cfg = {
        codec,
        width,
        height,
        bitrate: bitrateBps,
        framerate: fps,
        hardwareAcceleration: hw,
      };
      try {
        const res = await VideoEncoder.isConfigSupported(cfg);
        if (res && res.supported) {
          return res.config || cfg;
        }
      } catch {
        // try next candidate
      }
    }
  }
  return null;
}

async function decodeSourceAudio(resolvedSrc, targetFile) {
  if (typeof AudioEncoder === "undefined" || typeof AudioData === "undefined") {
    return null;
  }
  const AudioCtx = window.AudioContext || window.webkitAudioContext;
  if (!AudioCtx) return null;

  let tempCtx = null;
  try {
    let rawBuffer;
    if (targetFile instanceof Blob) {
      rawBuffer = await targetFile.arrayBuffer();
    } else {
      const resp = await fetch(resolvedSrc);
      if (!resp.ok) return null;
      rawBuffer = await resp.arrayBuffer();
    }
    if (!rawBuffer || rawBuffer.byteLength === 0) return null;

    tempCtx = new AudioCtx();
    const audioBuffer = await tempCtx.decodeAudioData(rawBuffer.slice(0));
    const numberOfChannels = Math.min(2, Math.max(1, audioBuffer.numberOfChannels));
    const sampleRate = audioBuffer.sampleRate;

    const aacCfg = {
      codec: "mp4a.40.2",
      sampleRate,
      numberOfChannels,
      bitrate: 128_000,
    };
    const sup = await AudioEncoder.isConfigSupported(aacCfg);
    if (!sup || !sup.supported) return null;

    return {
      audioBuffer,
      config: sup.config || aacCfg,
      sampleRate,
      numberOfChannels,
    };
  } catch {
    return null;
  } finally {
    if (tempCtx) {
      tempCtx.close().catch(() => {});
    }
  }
}

function waitWithAbort(ms, abortSignal) {
  return new Promise((resolve, reject) => {
    if (abortSignal?.aborted) {
      reject(new DOMException("Export cancelled", "AbortError"));
      return;
    }
    const onAbort = () => {
      clearTimeout(timer);
      reject(new DOMException("Export cancelled", "AbortError"));
    };
    const timer = setTimeout(() => {
      abortSignal?.removeEventListener("abort", onAbort);
      resolve();
    }, ms);
    abortSignal?.addEventListener("abort", onAbort, { once: true });
  });
}

function waitForVideoFrameCallback(video, abortSignal, timeoutMs = 120) {
  if (typeof video.requestVideoFrameCallback !== "function") {
    return Promise.resolve();
  }
  return new Promise((resolve, reject) => {
    if (abortSignal?.aborted) {
      reject(new DOMException("Export cancelled", "AbortError"));
      return;
    }
    let settled = false;
    let rvfcId = 0;
    const cleanup = () => {
      clearTimeout(timer);
      if (rvfcId && typeof video.cancelVideoFrameCallback === "function") {
        try {
          video.cancelVideoFrameCallback(rvfcId);
        } catch {
          // ignore
        }
      }
      abortSignal?.removeEventListener("abort", onAbort);
    };
    const finish = () => {
      if (settled) return;
      settled = true;
      cleanup();
      resolve();
    };
    const onAbort = () => {
      if (settled) return;
      settled = true;
      cleanup();
      reject(new DOMException("Export cancelled", "AbortError"));
    };
    const timer = setTimeout(finish, timeoutMs);
    abortSignal?.addEventListener("abort", onAbort, { once: true });
    try {
      rvfcId = video.requestVideoFrameCallback(() => {
        rvfcId = 0;
        finish();
      });
    } catch {
      finish();
    }
  });
}

async function seekVideoFrame(video, targetTimeSec, abortSignal) {
  if (abortSignal?.aborted) {
    throw new DOMException("Export cancelled", "AbortError");
  }
  if (Math.abs(video.currentTime - targetTimeSec) < 1e-4 && video.readyState >= 2) {
    return;
  }

  await new Promise((resolve, reject) => {
    if (abortSignal?.aborted) {
      reject(new DOMException("Export cancelled", "AbortError"));
      return;
    }
    let settled = false;
    const finish = () => {
      if (settled) return;
      settled = true;
      cleanup();
      resolve();
    };
    const onAbort = () => {
      if (settled) return;
      settled = true;
      cleanup();
      reject(new DOMException("Export cancelled", "AbortError"));
    };
    const timer = setTimeout(finish, 600);
    const cleanup = () => {
      clearTimeout(timer);
      video.removeEventListener("seeked", finish);
      abortSignal?.removeEventListener("abort", onAbort);
    };
    video.addEventListener("seeked", finish, { once: true });
    abortSignal?.addEventListener("abort", onAbort, { once: true });
    try {
      video.currentTime = targetTimeSec;
    } catch {
      finish();
    }
  });

  await waitForVideoFrameCallback(video, abortSignal);
}

async function runMediaRecorderFallback({
  video,
  exportCanvas,
  drawCompositeFrame,
  bitrateBps,
  duration,
  fps = 30,
  onProgress,
  abortSignal,
}) {
  if (typeof MediaRecorder === "undefined") {
    throw new Error("Neither WebCodecs nor MediaRecorder is supported in this browser.");
  }
  video.pause();

  const stream = exportCanvas.captureStream(0);
  const [videoTrack] = stream.getVideoTracks();
  const candidates = [
    { mimeType: "video/webm;codecs=vp9", videoBitsPerSecond: bitrateBps },
    { mimeType: "video/webm;codecs=vp8", videoBitsPerSecond: bitrateBps },
    { mimeType: "video/webm", videoBitsPerSecond: bitrateBps },
    { mimeType: "video/mp4", videoBitsPerSecond: bitrateBps },
    {},
  ];

  let recorder = null;
  const chunks = [];
  let chosenMime = "video/webm";

  for (const opts of candidates) {
    if (opts.mimeType && !MediaRecorder.isTypeSupported(opts.mimeType)) continue;
    try {
      recorder =
        Object.keys(opts).length > 0
          ? new MediaRecorder(stream, opts)
          : new MediaRecorder(stream);
      recorder.ondataavailable = (e) => {
        if (e.data && e.data.size > 0) chunks.push(e.data);
      };
      recorder.start(250);
      chosenMime = recorder.mimeType || opts.mimeType || "video/webm";
      break;
    } catch {
      recorder = null;
      chunks.length = 0;
    }
  }

  if (!recorder) {
    stream.getTracks().forEach((t) => t.stop());
    throw new Error("No supported video encoder found.");
  }

  try {
    const recorderStopped = new Promise((resolve, reject) => {
      recorder.onstop = () => {
        if (abortSignal?.aborted) {
          reject(new DOMException("Export cancelled", "AbortError"));
          return;
        }
        resolve(new Blob(chunks, { type: chosenMime }));
      };
      recorder.onerror = (ev) =>
        reject(ev?.error || new Error("MediaRecorder encoding failed."));
    });

    const totalFrames = Math.max(1, Math.floor(duration * fps));
    const frameIntervalMs = 1000 / fps;
    onProgress?.(0);

    for (let frameIndex = 0; frameIndex < totalFrames; frameIndex++) {
      if (abortSignal?.aborted) {
        throw new DOMException("Export cancelled", "AbortError");
      }
      const targetTime = Math.min(Math.max(0, duration - 0.001), frameIndex / fps);
      await seekVideoFrame(video, targetTime, abortSignal);
      drawCompositeFrame();

      if (videoTrack && typeof videoTrack.requestFrame === "function") {
        videoTrack.requestFrame();
      }

      onProgress?.(Math.round(((frameIndex + 1) / totalFrames) * 100));
      await waitWithAbort(frameIntervalMs, abortSignal);
    }

    if (recorder.state !== "inactive") {
      recorder.stop();
    }

    const blob = await recorderStopped;
    const ext = chosenMime.toLowerCase().includes("mp4") ? "mp4" : "webm";
    return { blob, ext };
  } finally {
    try {
      if (recorder.state !== "inactive") {
        recorder.stop();
      }
    } catch {
      // ignore
    }
    stream.getTracks().forEach((t) => t.stop());
  }
}

export async function exportGradedVideo({
  videoSrc,
  targetFile = null,
  params,
  activeLut = null,
  lutMix = 1.0,
  engine = "v3",
  matchStrength = 100,
  logProfile = "rec709",
  layout = "graded",
  splitPosition = 50,
  bitrateMbps = 16,
  includeAudio = true,
  presetName = "Target",
  onProgress,
  abortSignal,
}) {
  let createdObjectUrl = "";
  let resolvedSrc = typeof videoSrc === "string" ? videoSrc.trim() : "";

  if (!resolvedSrc && targetFile instanceof Blob) {
    createdObjectUrl = URL.createObjectURL(targetFile);
    resolvedSrc = createdObjectUrl;
  }

  if (!resolvedSrc) {
    throw new Error("No target video source found for export");
  }
  if (abortSignal?.aborted) {
    if (createdObjectUrl) URL.revokeObjectURL(createdObjectUrl);
    throw new DOMException("Export cancelled", "AbortError");
  }

  const video = document.createElement("video");
  video.style.cssText =
    "position:fixed;left:-9999px;top:-9999px;width:2px;height:2px;opacity:0.001;pointer-events:none;";
  const isBlobOrData =
    resolvedSrc.startsWith("blob:") || resolvedSrc.startsWith("data:");
  if (!isBlobOrData) {
    video.crossOrigin = "anonymous";
  }
  video.playsInline = true;
  video.preload = "auto";
  video.muted = true;
  video.src = resolvedSrc;
  document.body.appendChild(video);

  let grader = null;
  let videoEncoder = null;
  let audioEncoder = null;
  let exportCanvas = null;

  const cleanupAll = () => {
    try {
      if (videoEncoder && videoEncoder.state !== "closed") {
        videoEncoder.close();
      }
    } catch {
      // ignore
    }
    try {
      if (audioEncoder && audioEncoder.state !== "closed") {
        audioEncoder.close();
      }
    } catch {
      // ignore
    }
    try {
      video.pause();
      video.removeAttribute("src");
      video.load();
    } catch {
      // ignore
    }
    try {
      if (video.parentNode) {
        video.parentNode.removeChild(video);
      }
    } catch {
      // ignore
    }
    if (exportCanvas) {
      exportCanvas.width = 0;
      exportCanvas.height = 0;
      exportCanvas = null;
    }
    if (grader) {
      grader.cleanup();
      grader = null;
    }
    if (createdObjectUrl) {
      URL.revokeObjectURL(createdObjectUrl);
      createdObjectUrl = "";
    }
  };

  try {
    // Wait for loadeddata
    await new Promise((resolve, reject) => {
      if (video.readyState >= 2) {
        resolve();
        return;
      }
      const timeoutId = setTimeout(() => {
        cleanupListeners();
        reject(new Error("Timed out waiting for video frame data to load."));
      }, 15000);

      const onLoadedData = () => {
        cleanupListeners();
        resolve();
      };
      const onError = () => {
        cleanupListeners();
        const code = video.error?.code;
        const msg = video.error?.message;
        reject(
          new Error(
            msg ||
              (code
                ? `Failed to load video (MediaError code ${code}).`
                : "Failed to load video for export.")
          )
        );
      };
      const onAbort = () => {
        cleanupListeners();
        reject(new DOMException("Export cancelled", "AbortError"));
      };
      const cleanupListeners = () => {
        clearTimeout(timeoutId);
        video.removeEventListener("loadeddata", onLoadedData);
        video.removeEventListener("error", onError);
        abortSignal?.removeEventListener("abort", onAbort);
      };

      video.addEventListener("loadeddata", onLoadedData);
      video.addEventListener("error", onError);
      abortSignal?.addEventListener("abort", onAbort);
    });

    if (abortSignal?.aborted) {
      throw new DOMException("Export cancelled", "AbortError");
    }

    const vw = video.videoWidth || 1280;
    const vh = video.videoHeight || 720;
    const maxEdge = Math.max(vw, vh);
    const scale = maxEdge > 1920 ? 1920 / maxEdge : 1;
    // Strictly round down to even integers for H.264 compatibility
    const width = Math.max(2, Math.floor((vw * scale) / 2) * 2);
    const height = Math.max(2, Math.floor((vh * scale) / 2) * 2);
    const duration =
      Number.isFinite(video.duration) && video.duration > 0 ? video.duration : 1;
    const fps = 30;
    const bitrateBps = (bitrateMbps === 8 ? 8 : 16) * 1_000_000;

    const effective =
      matchStrength !== undefined
        ? scaleParamsByStrength(params, matchStrength)
        : params;
    const safeParams = sanitizeParams(effective);

    video.pause();

    // Initialize persistent WebGL grading context ONCE
    grader = createWebGLFrameGrader({
      width,
      height,
      params: safeParams,
      activeLut,
      lutMix,
      layout,
      splitPos: splitPosition,
      simulateLogInput: logProfile,
      alpha: false,
    });
    if (!grader) {
      throw new Error("WebGL is unavailable for video export.");
    }

    exportCanvas = document.createElement("canvas");
    exportCanvas.width = width;
    exportCanvas.height = height;
    const exportCtx = exportCanvas.getContext("2d", { alpha: false });

    const drawCompositeFrame = () => {
      grader.render(video);
      exportCtx.drawImage(grader.canvas, 0, 0, width, height);
      if (layout === "split") {
        const splitX = Math.round((Math.max(0, Math.min(100, splitPosition)) / 100) * width);
        const lineW = Math.max(2, Math.round(width / 640));
        exportCtx.fillStyle = "rgba(226, 228, 233, 0.92)";
        exportCtx.fillRect(Math.max(0, splitX - Math.floor(lineW / 2)), 0, lineW, height);
      }
    };

    const h264Config = await negotiateH264Config(width, height, bitrateBps, fps);
    let outBlob;
    let outExt = "mp4";

    if (h264Config) {
      const decodedAudio = includeAudio
        ? await decodeSourceAudio(resolvedSrc, targetFile)
        : null;

      const muxerTarget = new ArrayBufferTarget();
      const muxer = new Muxer({
        target: muxerTarget,
        video: {
          codec: "avc",
          width,
          height,
        },
        audio: decodedAudio
          ? {
              codec: "aac",
              sampleRate: decodedAudio.sampleRate,
              numberOfChannels: decodedAudio.numberOfChannels,
            }
          : undefined,
        fastStart: "in-memory",
      });

      let encoderError = null;
      videoEncoder = new VideoEncoder({
        output: (chunk, meta) => {
          muxer.addVideoChunk(chunk, meta);
        },
        error: (err) => {
          encoderError = err;
        },
      });
      videoEncoder.configure(h264Config);

      // Encode offline audio if present
      if (decodedAudio) {
        try {
          audioEncoder = new AudioEncoder({
            output: (chunk, meta) => {
              muxer.addAudioChunk(chunk, meta);
            },
            error: () => {
              // ignore non-fatal audio encoder error
            },
          });
          audioEncoder.configure(decodedAudio.config);

          const { audioBuffer, sampleRate, numberOfChannels } = decodedAudio;
          const totalSamples = audioBuffer.length;
          const chunkFrames = 4096;
          const channels = [];
          for (let c = 0; c < numberOfChannels; c++) {
            channels.push(audioBuffer.getChannelData(c));
          }

          for (let offset = 0; offset < totalSamples; offset += chunkFrames) {
            if (abortSignal?.aborted) {
              throw new DOMException("Export cancelled", "AbortError");
            }
            const frameCount = Math.min(chunkFrames, totalSamples - offset);
            const planar = new Float32Array(frameCount * numberOfChannels);
            for (let c = 0; c < numberOfChannels; c++) {
              planar.set(channels[c].subarray(offset, offset + frameCount), c * frameCount);
            }
            const audioData = new AudioData({
              format: "f32-planar",
              sampleRate,
              numberOfFrames: frameCount,
              numberOfChannels,
              timestamp: Math.round((offset / sampleRate) * 1_000_000),
              data: planar,
            });
            audioEncoder.encode(audioData);
            audioData.close();
          }
          await audioEncoder.flush();
          audioEncoder.close();
          audioEncoder = null;
        } catch (err) {
          if (err?.name === "AbortError") throw err;
          if (audioEncoder && audioEncoder.state !== "closed") {
            try {
              audioEncoder.close();
            } catch {
              // ignore
            }
          }
          audioEncoder = null;
        }
      }

      const totalFrames = Math.max(1, Math.floor(duration * fps));
      const frameDurationUs = Math.round((1 / fps) * 1_000_000);
      onProgress?.(0);

      for (let i = 0; i < totalFrames; i++) {
        if (abortSignal?.aborted) {
          throw new DOMException("Export cancelled", "AbortError");
        }
        if (encoderError) {
          throw encoderError;
        }

        const targetTime = Math.min(Math.max(0, duration - 0.001), i / fps);
        await seekVideoFrame(video, targetTime, abortSignal);
        drawCompositeFrame();

        const timestampUs = Math.round((i * 1_000_000) / fps);
        const frame = new VideoFrame(exportCanvas, {
          timestamp: timestampUs,
          duration: frameDurationUs,
        });
        try {
          videoEncoder.encode(frame, {
            keyFrame: i % Math.round(fps * 2) === 0,
          });
        } finally {
          frame.close();
        }

        while (videoEncoder.encodeQueueSize > 4) {
          if (abortSignal?.aborted) {
            throw new DOMException("Export cancelled", "AbortError");
          }
          if (encoderError) {
            throw encoderError;
          }
          await new Promise((r) => setTimeout(r, 5));
        }

        onProgress?.(Math.round(((i + 1) / totalFrames) * 100));
      }

      await videoEncoder.flush();
      if (encoderError) {
        throw encoderError;
      }
      videoEncoder.close();
      videoEncoder = null;

      muxer.finalize();
      outBlob = new Blob([muxerTarget.buffer], { type: "video/mp4" });
      outExt = "mp4";
    } else {
      const fallbackRes = await runMediaRecorderFallback({
        video,
        exportCanvas,
        drawCompositeFrame,
        bitrateBps,
        duration,
        fps,
        onProgress,
        abortSignal,
      });
      outBlob = fallbackRes.blob;
      outExt = fallbackRes.ext;
    }

    const codename = getEngineCodename(engine) || "polaris";
    const cleanBase =
      String(presetName || "Target")
        .trim()
        .replace(/[^a-zA-Z0-9._-]+/g, "_")
        .replace(/^_+|_+$/g, "") || "Target";
    const fileName = `${cleanBase}_${codename}_graded.${outExt}`;
    triggerBlobDownload(outBlob, fileName);
    return { blob: outBlob, fileName, ext: outExt };
  } finally {
    cleanupAll();
  }
}
