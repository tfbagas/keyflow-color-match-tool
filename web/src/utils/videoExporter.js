import { Muxer, ArrayBufferTarget } from "mp4-muxer";
import {
  createFile as createMp4BoxFile,
  DataStream as MP4BoxDataStream,
  Endianness as MP4BoxEndianness,
} from "mp4box";
import { scaleParamsByStrength, sanitizeParams } from "./gradeEngine";
import { DEFAULT_ENGINE_ID, getEngineCodename } from "./engineMetadata";
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

async function encodeAudioToMuxer(muxer, decodedAudio, abortSignal) {
  if (!decodedAudio) return;
  let audioEncoder = null;
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
  }
}

function drawSplitLine(ctx, width, height, splitPosition) {
  const splitX = Math.round((Math.max(0, Math.min(100, splitPosition)) / 100) * width);
  const lineW = Math.max(2, Math.round(width / 640));
  ctx.fillStyle = "rgba(226, 228, 233, 0.92)";
  ctx.fillRect(Math.max(0, splitX - Math.floor(lineW / 2)), 0, lineW, height);
}

function drawOutputToCanvas(ctx, sourceCanvas, width, height, rotation, layout, splitPosition) {
  if (rotation === 0) {
    ctx.drawImage(sourceCanvas, 0, 0, width, height);
  } else {
    ctx.save();
    ctx.translate(width / 2, height / 2);
    ctx.rotate((rotation * Math.PI) / 180);
    if (rotation === 90 || rotation === 270) {
      ctx.drawImage(sourceCanvas, -height / 2, -width / 2, height, width);
    } else {
      ctx.drawImage(sourceCanvas, -width / 2, -height / 2, width, height);
    }
    ctx.restore();
  }
  if (layout === "split") {
    drawSplitLine(ctx, width, height, splitPosition);
  }
}

function isIsoBmffCandidate(targetFile, resolvedSrc) {
  if (
    typeof VideoDecoder === "undefined" ||
    typeof VideoEncoder === "undefined" ||
    typeof EncodedVideoChunk === "undefined" ||
    typeof VideoFrame === "undefined"
  ) {
    return false;
  }
  if (targetFile instanceof Blob) {
    const type = (targetFile.type || "").toLowerCase();
    const name = typeof targetFile.name === "string" ? targetFile.name.toLowerCase() : "";
    if (
      type.includes("webm") ||
      type.includes("ogg") ||
      type.includes("matroska") ||
      /\.(webm|mkv|ogv|ogg|avi)$/i.test(name)
    ) {
      return false;
    }
    if (
      type.includes("mp4") ||
      type.includes("quicktime") ||
      type.includes("m4v") ||
      /\.(mp4|mov|m4v)$/i.test(name)
    ) {
      return true;
    }
    // Unknown mime/name on Blob: allow ftyp header check to decide
    return true;
  }
  return /\.(mp4|mov|m4v)(\?|#|$)/i.test(resolvedSrc) || resolvedSrc.startsWith("blob:");
}

async function hasFtypHeader(blob) {
  if (!(blob instanceof Blob) || blob.size < 12) return false;
  const headerBuf = await blob.slice(0, 12).arrayBuffer();
  const bytes = new Uint8Array(headerBuf);
  // ISO-BMFF ftyp box signature at offset 4..7
  return (
    bytes[4] === 0x66 &&
    bytes[5] === 0x74 &&
    bytes[6] === 0x79 &&
    bytes[7] === 0x70
  );
}

function extractDecoderDescription(mp4boxfile, trackId) {
  const trak = mp4boxfile.getTrackById(trackId);
  const entries = trak?.mdia?.minf?.stbl?.stsd?.entries;
  if (!Array.isArray(entries)) return undefined;
  for (const entry of entries) {
    const box = entry.avcC || entry.hvcC || entry.vpcC || entry.av1C;
    if (box) {
      const stream = new MP4BoxDataStream(
        undefined,
        0,
        MP4BoxEndianness.BIG_ENDIAN
      );
      box.write(stream);
      if (stream.byteLength > 8) {
        return new Uint8Array(stream.buffer, 8, stream.byteLength - 8).slice();
      }
    }
  }
  return undefined;
}

function getTrackRotation(mp4boxfile, trackId) {
  const trak = mp4boxfile.getTrackById(trackId);
  const m = trak?.tkhd?.matrix;
  if (!m || m.length < 5) return 0;
  const [a, b, , c, d] = m;
  if (a === 0 && d === 0) {
    if (b > 0 && c < 0) return 90;
    if (b < 0 && c > 0) return 270;
  }
  if (a < 0 && d < 0 && b === 0 && c === 0) return 180;
  return 0;
}

/**
 * Pure WebCodecs Demux -> Decode -> WebGL Grade -> Encode pipeline for ISO-BMFF (.mp4/.mov/.m4v).
 * Eliminates HTML5 <video> seeking so Android hardware decoders never deliver stale/duplicate frames.
 * Returns null if the container/codec is unsupported so caller can seamlessly fall back.
 */
async function tryWebCodecsDemuxDecodeExport({
  targetFile,
  resolvedSrc,
  width,
  height,
  safeParams,
  activeLut,
  lutMix,
  layout,
  splitPosition,
  logProfile,
  bitrateBps,
  includeAudio,
  onProgress,
  abortSignal,
}) {
  if (!isIsoBmffCandidate(targetFile, resolvedSrc)) {
    return null;
  }

  let sourceBlob = targetFile instanceof Blob ? targetFile : null;
  if (!sourceBlob) {
    try {
      const resp = await fetch(resolvedSrc);
      if (!resp.ok) return null;
      sourceBlob = await resp.blob();
    } catch {
      return null;
    }
  }

  if (!(await hasFtypHeader(sourceBlob))) {
    return null;
  }

  const mp4boxfile = createMp4BoxFile();
  let readyInfo = null;
  let mp4Error = null;
  const pendingSamples = [];

  mp4boxfile.onError = (err) => {
    mp4Error = err instanceof Error ? err : new Error(String(err));
  };
  mp4boxfile.onReady = (info) => {
    readyInfo = info;
  };
  mp4boxfile.onSamples = (_trackId, _user, samples) => {
    if (Array.isArray(samples)) {
      for (const s of samples) {
        pendingSamples.push(s);
      }
    }
  };

  const CHUNK_SIZE = 2 * 1024 * 1024;
  let offset = 0;

  while (!readyInfo && !mp4Error && offset < sourceBlob.size) {
    if (abortSignal?.aborted) {
      throw new DOMException("Export cancelled", "AbortError");
    }
    const end = Math.min(sourceBlob.size, offset + CHUNK_SIZE);
    const buf = await sourceBlob.slice(offset, end).arrayBuffer();
    buf.fileStart = offset;
    mp4boxfile.appendBuffer(buf);
    offset = end;
  }

  if (!readyInfo && !mp4Error) {
    mp4boxfile.flush();
  }

  if (mp4Error || !readyInfo) {
    return null;
  }

  const videoTrack =
    readyInfo.videoTracks?.find((t) => t.nb_samples > 0) ||
    readyInfo.videoTracks?.[0];
  if (!videoTrack || !videoTrack.codec) {
    return null;
  }

  const rotation = getTrackRotation(mp4boxfile, videoTrack.id);
  const graderWidth = rotation === 90 || rotation === 270 ? height : width;
  const graderHeight = rotation === 90 || rotation === 270 ? width : height;
  const description = extractDecoderDescription(mp4boxfile, videoTrack.id);

  const decoderConfig = {
    codec: videoTrack.codec,
    codedWidth: videoTrack.video?.width || graderWidth,
    codedHeight: videoTrack.video?.height || graderHeight,
    ...(description ? { description } : {}),
  };

  let decSupport = null;
  try {
    decSupport = await VideoDecoder.isConfigSupported(decoderConfig);
  } catch {
    return null;
  }
  if (!decSupport || !decSupport.supported) {
    return null;
  }

  const trackDurationSec =
    videoTrack.timescale > 0 && videoTrack.duration > 0
      ? videoTrack.duration / videoTrack.timescale
      : 0;
  const rawFps =
    trackDurationSec > 0 && videoTrack.nb_samples > 0
      ? videoTrack.nb_samples / trackDurationSec
      : 30;
  const fps = Math.max(15, Math.min(60, Math.round(rawFps) || 30));

  const h264Config = await negotiateH264Config(width, height, bitrateBps, fps);
  if (!h264Config) {
    return null;
  }

  let grader = null;
  let exportCanvas = null;
  let exportCtx = null;
  let videoDecoder = null;
  let videoEncoder = null;
  let decodedCount = 0;

  try {
    grader = createWebGLFrameGrader({
      width: graderWidth,
      height: graderHeight,
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

    if (layout === "split" || rotation !== 0) {
      exportCanvas = document.createElement("canvas");
      exportCanvas.width = width;
      exportCanvas.height = height;
      exportCtx = exportCanvas.getContext("2d", { alpha: false });
    }

    const decodedAudio = includeAudio
      ? await decodeSourceAudio(resolvedSrc, sourceBlob)
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
        encoderError = err instanceof Error ? err : new Error(String(err));
      },
    });
    videoEncoder.configure(h264Config);

    await encodeAudioToMuxer(muxer, decodedAudio, abortSignal);

    let decoderError = null;
    let renderedFrameCount = 0;
    const totalSamples = Math.max(1, videoTrack.nb_samples || 1);
    const keyFrameInterval = Math.max(1, Math.round(fps));
    const frameDurationUs = Math.round(1_000_000 / fps);

    videoDecoder = new VideoDecoder({
      output: (decodedFrame) => {
        try {
          if (abortSignal?.aborted || encoderError || decoderError) {
            return;
          }
          // 1. Draw decoded VideoFrame directly into WebGL (zero-copy texImage2D)
          grader.render(decodedFrame);

          let sourceForEncoder = grader.canvas;
          if (exportCanvas && exportCtx) {
            drawOutputToCanvas(
              exportCtx,
              grader.canvas,
              width,
              height,
              rotation,
              layout,
              splitPosition
            );
            sourceForEncoder = exportCanvas;
          }

          // 2. Encode graded frame with strictly monotonic CFR timestamps and 1s GOP
          const ts = Math.round(renderedFrameCount * (1_000_000 / fps));
          const dur = frameDurationUs;
          const outFrame = new VideoFrame(sourceForEncoder, {
            timestamp: ts,
            duration: dur,
          });
          try {
            videoEncoder.encode(outFrame, {
              keyFrame: renderedFrameCount % keyFrameInterval === 0,
            });
          } finally {
            outFrame.close();
          }

          renderedFrameCount += 1;
          decodedCount = renderedFrameCount;
          onProgress?.(
            Math.min(99, Math.round((renderedFrameCount / totalSamples) * 100))
          );
        } catch (err) {
          decoderError = err instanceof Error ? err : new Error(String(err));
        } finally {
          try {
            decodedFrame.close();
          } catch {
            // already closed
          }
        }
      },
      error: (err) => {
        decoderError = err instanceof Error ? err : new Error(String(err));
      },
    });
    videoDecoder.configure(decSupport.config || decoderConfig);

    mp4boxfile.setExtractionOptions(videoTrack.id, null, { nbSamples: 256 });
    mp4boxfile.start();
    onProgress?.(0);

    const drainPendingSamples = async () => {
      while (pendingSamples.length > 0) {
        if (abortSignal?.aborted) {
          throw new DOMException("Export cancelled", "AbortError");
        }
        if (decoderError) throw decoderError;
        if (encoderError) throw encoderError;

        while (
          videoDecoder.decodeQueueSize > 2 ||
          videoEncoder.encodeQueueSize > 2
        ) {
          if (abortSignal?.aborted) {
            throw new DOMException("Export cancelled", "AbortError");
          }
          if (decoderError) throw decoderError;
          if (encoderError) throw encoderError;
          await waitWithAbort(0, abortSignal);
        }

        const sample = pendingSamples.shift();
        const timescale = sample.timescale || videoTrack.timescale || 1000;
        const timestampUs = Math.round((sample.cts * 1_000_000) / timescale);
        const durationUs = Math.max(
          1,
          Math.round(((sample.duration || 0) * 1_000_000) / timescale)
        );

        const chunk = new EncodedVideoChunk({
          type: sample.is_sync ? "key" : "delta",
          timestamp: timestampUs,
          duration: durationUs,
          data: sample.data,
        });
        try {
          mp4boxfile.releaseUsedSamples(videoTrack.id, sample.number);
        } catch {
          // ignore sample release errors
        }
        videoDecoder.decode(chunk);
      }
    };

    await drainPendingSamples();

    while (offset < sourceBlob.size) {
      if (abortSignal?.aborted) {
        throw new DOMException("Export cancelled", "AbortError");
      }
      if (mp4Error) throw mp4Error;
      if (decoderError) throw decoderError;
      if (encoderError) throw encoderError;

      const end = Math.min(sourceBlob.size, offset + CHUNK_SIZE);
      const buf = await sourceBlob.slice(offset, end).arrayBuffer();
      buf.fileStart = offset;
      mp4boxfile.appendBuffer(buf);
      offset = end;

      await drainPendingSamples();
    }

    mp4boxfile.flush();
    await drainPendingSamples();

    await videoDecoder.flush();
    if (decoderError) throw decoderError;
    if (encoderError) throw encoderError;

    await videoEncoder.flush();
    if (encoderError) throw encoderError;

    videoDecoder.close();
    videoDecoder = null;
    videoEncoder.close();
    videoEncoder = null;

    onProgress?.(100);
    muxer.finalize();
    return {
      blob: new Blob([muxerTarget.buffer], { type: "video/mp4" }),
      ext: "mp4",
    };
  } catch (err) {
    if (err?.name === "AbortError") {
      throw err;
    }
    // If hardware decoder failed before outputting any frames, fall back to <video> pipeline
    if (decodedCount === 0) {
      return null;
    }
    throw err;
  } finally {
    try {
      if (videoDecoder && videoDecoder.state !== "closed") {
        videoDecoder.close();
      }
    } catch {
      // ignore
    }
    try {
      if (videoEncoder && videoEncoder.state !== "closed") {
        videoEncoder.close();
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
  engine = DEFAULT_ENGINE_ID,
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

    let outBlob;
    let outExt = "mp4";

    const webCodecsResult = await tryWebCodecsDemuxDecodeExport({
      targetFile,
      resolvedSrc,
      width,
      height,
      safeParams,
      activeLut,
      lutMix,
      layout,
      splitPosition,
      logProfile,
      bitrateBps,
      includeAudio,
      onProgress,
      abortSignal,
    });

    if (webCodecsResult) {
      outBlob = webCodecsResult.blob;
      outExt = webCodecsResult.ext;
    } else {
      // Initialize persistent WebGL grading context ONCE for fallback <video> seek path
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
          drawSplitLine(exportCtx, width, height, splitPosition);
        }
      };

      const h264Config = await negotiateH264Config(width, height, bitrateBps, fps);

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
        await encodeAudioToMuxer(muxer, decodedAudio, abortSignal);

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
    }

    const codename = getEngineCodename(engine) || "altair";
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
