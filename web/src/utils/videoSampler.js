// Smart Multi-Frame Video Reference Sampler
// Seeks across 8 evenly spaced timestamps (8% to 92% of duration) offscreen,
// discards black fade/cut frames (L < 0.08) and white flash frames (L > 0.92),
// and aggregates a median-filtered representative pixel sample.

import { filterLetterboxPixels } from "./colorGrading.js";

export const SMART_SAMPLE_COUNT = 8;
export const SMART_SAMPLE_START = 0.08;
export const SMART_SAMPLE_END = 0.92;
export const MIN_VALID_FRAME_LUMA = 0.08;
export const MAX_VALID_FRAME_LUMA = 0.92;

export function getSmartSampleFractions(count = SMART_SAMPLE_COUNT) {
  const n = Math.max(1, count);
  if (n === 1) return [0.5];
  const fractions = [];
  const span = SMART_SAMPLE_END - SMART_SAMPLE_START;
  for (let i = 0; i < n; i++) {
    const frac = SMART_SAMPLE_START + (span * i) / (n - 1);
    fractions.push(Math.round(frac * 10000) / 10000);
  }
  return fractions;
}

export function getSmartSampleTimestamps(duration, count = SMART_SAMPLE_COUNT) {
  if (!Number.isFinite(duration) || duration <= 0.05) {
    return [0];
  }
  return getSmartSampleFractions(count).map((frac) =>
    Math.min(Math.max(0.01, duration * frac), Math.max(0.01, duration - 0.01))
  );
}

// Computes mean Rec.709 luminance L in [0..1] for a sampled RGBA frame.
export function computeSampleFrameLuminance(rgba) {
  if (!rgba || rgba.length < 4) return 0;
  let sum = 0;
  let count = 0;
  for (let i = 0; i < rgba.length; i += 16) {
    const r = rgba[i];
    const g = rgba[i + 1];
    const b = rgba[i + 2];
    sum += (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255.0;
    count++;
  }
  return count > 0 ? sum / count : 0;
}

export function isValidReferenceFrameLuma(L) {
  return L >= MIN_VALID_FRAME_LUMA && L <= MAX_VALID_FRAME_LUMA;
}

// Aggregates a median-filtered representative pixel sample across K valid frames.
// Fast-cut AMVs or trailers with transient flashes/overlays produce a clean reference grade.
export function aggregateMedianFilteredSample(frameBuffers, framePixelCount) {
  if (!frameBuffers || frameBuffers.length === 0) return null;
  if (frameBuffers.length === 1) {
    return filterLetterboxPixels(frameBuffers[0]);
  }

  const K = frameBuffers.length;
  const numPixels =
    framePixelCount || Math.floor(frameBuffers[0].length / 4);
  const out = new Uint8ClampedArray(numPixels * 4);
  const lumaOrder = new Float32Array(K);
  const idxOrder = new Uint8Array(K);
  const midRank = K >> 1;

  for (let p = 0; p < numPixels; p++) {
    const off = p * 4;
    for (let k = 0; k < K; k++) {
      const f = frameBuffers[k];
      lumaOrder[k] = 0.2126 * f[off] + 0.7152 * f[off + 1] + 0.0722 * f[off + 2];
      idxOrder[k] = k;
    }
    // Insertion sort on K <= 8 indices by pixel luminance
    for (let i = 1; i < K; i++) {
      const curIdx = idxOrder[i];
      const curLum = lumaOrder[curIdx];
      let j = i - 1;
      while (j >= 0 && lumaOrder[idxOrder[j]] > curLum) {
        idxOrder[j + 1] = idxOrder[j];
        j--;
      }
      idxOrder[j + 1] = curIdx;
    }

    if ((K & 1) === 1) {
      const medFrame = frameBuffers[idxOrder[midRank]];
      out[off] = medFrame[off];
      out[off + 1] = medFrame[off + 1];
      out[off + 2] = medFrame[off + 2];
      out[off + 3] = 255;
    } else {
      const fA = frameBuffers[idxOrder[midRank - 1]];
      const fB = frameBuffers[idxOrder[midRank]];
      out[off] = (fA[off] + fB[off]) >> 1;
      out[off + 1] = (fA[off + 1] + fB[off + 1]) >> 1;
      out[off + 2] = (fA[off + 2] + fB[off + 2]) >> 1;
      out[off + 3] = 255;
    }
  }

  return filterLetterboxPixels(out);
}

function seekOffscreenVideo(videoEl, targetTime, timeoutMs = 1400) {
  return new Promise((resolve) => {
    let settled = false;
    const finish = () => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      videoEl.removeEventListener("seeked", onSeeked);
      resolve();
    };
    const onSeeked = () => finish();
    const timer = setTimeout(finish, timeoutMs);
    videoEl.addEventListener("seeked", onSeeked);
    try {
      videoEl.currentTime = targetTime;
    } catch {
      finish();
    }
  });
}

function loadImageFromBlob(blob) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(blob);
    const img = new Image();
    img.onload = () => resolve({ img, url });
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("Failed to decode sampled video frame image."));
    };
    img.src = url;
  });
}

// Runs the 8-timestamp offscreen Smart Multi-Frame Reference Sampler on a video File.
export async function sampleReferenceVideoFile(file, options = {}) {
  const { maxDim = 640, onProgress } = options;
  const videoUrl = URL.createObjectURL(file);
  const video = document.createElement("video");
  video.muted = true;
  video.playsInline = true;
  video.preload = "auto";

  const cleanupVideo = () => {
    try {
      video.pause();
      video.removeAttribute("src");
      video.load();
    } catch {
      // ignore teardown errors
    }
    try {
      URL.revokeObjectURL(videoUrl);
    } catch {
      // ignore
    }
  };

  try {
    await new Promise((resolve, reject) => {
      let done = false;
      const timer = setTimeout(() => {
        if (done) return;
        done = true;
        reject(new Error("Timed out loading reference video for smart sampling."));
      }, 20000);

      video.onerror = () => {
        if (done) return;
        done = true;
        clearTimeout(timer);
        reject(
          new Error(
            "This video uses a codec or container this browser cannot decode. Try MP4 (H.264) or WEBM."
          )
        );
      };

      video.onloadeddata = () => {
        if (done) return;
        done = true;
        clearTimeout(timer);
        resolve();
      };

      video.src = videoUrl;
      video.load();
    });

    const vw = video.videoWidth || 0;
    const vh = video.videoHeight || 0;
    if (vw < 1 || vh < 1) {
      throw new Error("This video has no decodable video track.");
    }

    const scale = Math.min(1, maxDim / Math.max(vw, vh));
    const sw = Math.max(1, Math.round(vw * scale));
    const sh = Math.max(1, Math.round(vh * scale));
    const numPixels = sw * sh;

    const canvas = document.createElement("canvas");
    canvas.width = sw;
    canvas.height = sh;
    const ctx = canvas.getContext("2d", { willReadFrequently: true });

    const duration = Number.isFinite(video.duration) && video.duration > 0 ? video.duration : 1.0;
    const timestamps = getSmartSampleTimestamps(duration, SMART_SAMPLE_COUNT);
    const totalFrames = timestamps.length;

    const validBuffers = [];
    const validLumas = [];
    let bestFallbackBuffer = null;
    let bestFallbackDist = Infinity;

    for (let i = 0; i < totalFrames; i++) {
      if (typeof onProgress === "function") {
        onProgress(`Smart Sampling frame ${i + 1}/${totalFrames}...`);
      }
      await seekOffscreenVideo(video, timestamps[i]);
      ctx.drawImage(video, 0, 0, sw, sh);
      const frameData = new Uint8ClampedArray(ctx.getImageData(0, 0, sw, sh).data);
      const L = computeSampleFrameLuminance(frameData);

      const dist = Math.abs(L - 0.45);
      if (dist < bestFallbackDist) {
        bestFallbackDist = dist;
        bestFallbackBuffer = frameData;
      }

      if (isValidReferenceFrameLuma(L)) {
        validBuffers.push(frameData);
        validLumas.push(L);
      }
    }

    const validCount = validBuffers.length;
    const framesToAggregate =
      validCount > 0 ? validBuffers : bestFallbackBuffer ? [bestFallbackBuffer] : [];

    if (framesToAggregate.length === 0) {
      throw new Error("Could not extract any decodable frames from reference video.");
    }

    const sampledPixels = aggregateMedianFilteredSample(framesToAggregate, numPixels);

    // Choose the valid frame closest to the median luminance for the card thumbnail/poster image
    let posterFrame = framesToAggregate[0];
    if (validCount > 1) {
      const sortedLumas = validLumas.slice().sort((a, b) => a - b);
      const medLuma = sortedLumas[Math.floor(sortedLumas.length / 2)];
      let bestMedDist = Infinity;
      for (let i = 0; i < validCount; i++) {
        const d = Math.abs(validLumas[i] - medLuma);
        if (d < bestMedDist) {
          bestMedDist = d;
          posterFrame = validBuffers[i];
        }
      }
    }

    ctx.putImageData(new ImageData(posterFrame, sw, sh), 0, 0);
    const posterBlob = await new Promise((res) =>
      canvas.toBlob(res, "image/jpeg", 0.90)
    );
    canvas.width = 0;
    canvas.height = 0;

    if (!posterBlob) {
      throw new Error("Failed to encode representative reference video frame.");
    }

    const { img, url: posterUrl } = await loadImageFromBlob(posterBlob);
    const badgeText = `Smart Sampled: ${validCount}/${totalFrames} valid frames`;

    return {
      width: vw,
      height: vh,
      imgElement: img,
      objectUrl: posterUrl,
      dataUrl: posterUrl,
      thumbUrl: posterUrl,
      sampledPixels,
      validFrames: validCount,
      totalFrames,
      smartSampleBadge: badgeText,
    };
  } finally {
    cleanupVideo();
  }
}
