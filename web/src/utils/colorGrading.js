import { simulateGradePixels } from "./previewRenderer.js";
import {
  DEFAULT_PARAMS,
  TONE_COEFFS,
  computeWBGains,
  clamp,
  sanitizeParams,
} from "./gradeEngine.js";
import { checkAllowedHost } from "./hostGuard.js";

export { simulateGradePixels, DEFAULT_PARAMS };

function round2(val) {
  return Math.round(val * 100) / 100;
}

// ---------------------------------------------------------------------------
// Color Match Engine v2 (Hybrid Reference-Signature + Target-Delta)
// ---------------------------------------------------------------------------

const Y_BINS = 1024;
const C_BINS = 600;
const C_MAX = 0.3;

const GAMMA_MAX = 26 / 255; // +-26 RGB around #808080
const WHEEL_MAX = 34 / 255; // +-34 RGB for Lift / Gain

const SRGB_TO_LINEAR = (() => {
  const t = new Float32Array(256);
  for (let i = 0; i < 256; i++) {
    const c = i / 255;
    t[i] = c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
  }
  return t;
})();

function oklabAB(lr, lg, lb, out) {
  const l = Math.cbrt(0.4122214708 * lr + 0.5363325363 * lg + 0.0514459929 * lb);
  const m = Math.cbrt(0.2119034982 * lr + 0.6806995451 * lg + 0.1073969566 * lb);
  const s = Math.cbrt(0.0883024619 * lr + 0.2817188376 * lg + 0.6299787005 * lb);
  out[0] = 1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s;
  out[1] = 0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s;
}

function histPercentile(hist, lo, hi, pct, binsDivisor) {
  let total = 0;
  for (let i = lo; i <= hi; i++) total += hist[i];
  if (total <= 0) return null;
  const target = (pct / 100) * total;
  let acc = 0;
  for (let i = lo; i <= hi; i++) {
    acc += hist[i];
    if (acc >= target) return (i + 0.5) / binsDivisor;
  }
  return hi / binsDivisor;
}

export function computeLookStats(rgba, numPixels) {
  const yHist = new Uint32Array(Y_BINS);
  const cHist = new Uint32Array(C_BINS);

  const zone = {
    s: { r: 0, g: 0, b: 0, y: 0, n: 0 },
    m: { r: 0, g: 0, b: 0, y: 0, n: 0 },
    h: { r: 0, g: 0, b: 0, y: 0, n: 0 },
  };

  let midA = 0;
  let midB = 0;
  let midN = 0;
  let cSum = 0;
  let cN = 0;
  const ab = [0, 0];
  const stride = numPixels > 800000 ? 2 : 1;

  for (let p = 0; p < numPixels; p += 1) {
    const i = p * 4;
    const r8 = rgba[i];
    const g8 = rgba[i + 1];
    const b8 = rgba[i + 2];
    const r = r8 / 255;
    const g = g8 / 255;
    const b = b8 / 255;
    const y = 0.2126 * r + 0.7152 * g + 0.0722 * b;

    yHist[Math.min(Y_BINS - 1, Math.floor(y * Y_BINS))]++;

    if (y < 0.02 || y > 0.98) continue;

    // 3-way zone means: Shadows (< 0.30), Midtones (0.30..0.70), Highlights (> 0.70).
    const z = y < 0.3 ? zone.s : y > 0.7 ? zone.h : zone.m;
    z.r += r;
    z.g += g;
    z.b += b;
    z.y += y;
    z.n++;

    if (stride === 2 && (p & 1) === 1) continue;

    oklabAB(SRGB_TO_LINEAR[r8], SRGB_TO_LINEAR[g8], SRGB_TO_LINEAR[b8], ab);
    const chroma = Math.sqrt(ab[0] * ab[0] + ab[1] * ab[1]);
    cHist[Math.min(C_BINS - 1, Math.floor((chroma / C_MAX) * C_BINS))]++;
    cSum += chroma;
    cN++;

    if (y >= 0.22 && y <= 0.78) {
      midA += ab[0];
      midB += ab[1];
      midN++;
    }
  }

  const loBin = Math.floor(0.02 * Y_BINS);
  const hiBin = Math.floor(0.98 * Y_BINS);
  let inlier = 0;
  for (let i = loBin; i <= hiBin; i++) inlier += yHist[i];
  const useFull = inlier < numPixels * 0.08;
  const lo = useFull ? 0 : loBin;
  const hi = useFull ? Y_BINS - 1 : hiBin;

  const pc = (pct, fb) => histPercentile(yHist, lo, hi, pct, Y_BINS) ?? fb;
  const cp = (pct, fb) => {
    const v = histPercentile(cHist, 0, C_BINS - 1, pct, C_BINS);
    return v === null ? fb : v * C_MAX;
  };

  const zoneChroma = (z) =>
    z.n > 48
      ? [z.r / z.n - z.y / z.n, z.g / z.n - z.y / z.n, z.b / z.n - z.y / z.n]
      : [0, 0, 0];

  return {
    p10: pc(10, 0.07),
    p25: pc(25, 0.2),
    p50: pc(50, 0.44),
    p75: pc(75, 0.66),
    p85: pc(85, 0.78),
    p90: pc(90, 0.84),
    midA: midN > 64 ? midA / midN : 0,
    midB: midN > 64 ? midB / midN : 0,
    cMean: cN > 0 ? cSum / cN : 0.07,
    c50: cp(50, 0.05),
    c90: cp(90, 0.15),
    zoneS: zoneChroma(zone.s),
    zoneM: zoneChroma(zone.m),
    zoneH: zoneChroma(zone.h),
    hasTarget: true,
  };
}

// Jacobian of the engine's multiplicative temp/tint controls in OKLab (a, b),
// measured across a neutral ramp so the matcher matches the shader's exact response.
const WB_J = (() => {
  const lin = (c) => (c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4));
  const ab = [0, 0];
  const avgAB = (temp, tint) => {
    let sa = 0;
    let sb = 0;
    const levels = [0.35, 0.45, 0.55, 0.65];
    const [wbR, wbG, wbB] = computeWBGains(temp, tint);
    for (const y of levels) {
      oklabAB(
        lin(clamp(y * wbR, 0, 1)),
        lin(clamp(y * wbG, 0, 1)),
        lin(clamp(y * wbB, 0, 1)),
        ab
      );
      sa += ab[0];
      sb += ab[1];
    }
    return [sa / levels.length, sb / levels.length];
  };
  const base = avgAB(0, 0);
  const t = avgAB(0.5, 0);
  const i = avgAB(0, 0.5);
  const ta = (t[0] - base[0]) / 0.5;
  const tb = (t[1] - base[1]) / 0.5;
  const ia = (i[0] - base[0]) / 0.5;
  const ib = (i[1] - base[1]) / 0.5;
  return { ta, tb, ia, ib, det: ta * ib - ia * tb || 1e-6 };
})();

// Representative neutral photo when only a Reference is loaded.
const NOMINAL_TARGET = {
  p10: 0.07,
  p25: 0.2,
  p50: 0.44,
  p75: 0.66,
  p85: 0.78,
  p90: 0.84,
  midA: 0,
  midB: 0,
  cMean: 0.07,
  c50: 0.05,
  c90: 0.15,
  zoneS: [0, 0, 0],
  zoneM: [0, 0, 0],
  zoneH: [0, 0, 0],
  hasTarget: false,
};

export function matchLooks(ref, tgt, mediaType = "image") {
  const isImage = mediaType !== "video";
  const spreadRef = Math.max(ref.p90 - ref.p10, 0.05);
  const spreadTgt = Math.max(tgt.p90 - tgt.p10, 0.05);
  const ratio = clamp(spreadRef / spreadTgt, 0.3, 2.5);

  // Flat/Log profiles (e.g. Sully) have lifted blacks (P10 > 0.11) or compressed dynamic range.
  const isFlat = ref.p10 > 0.11 || spreadRef < 0.56 || ratio < 0.85;
  const filmBias = !isFlat && ratio > 1.0 ? 0.04 : 0.0;
  const contrast = isImage
    ? isFlat
      ? clamp(ratio, 0.85, 0.96)
      : clamp(ratio + 0.08, 1.14, 1.40)
    : isFlat
    ? clamp(ratio, 0.85, 0.96)
    : clamp(ratio + filmBias, 0.95, 1.28);

  const pivot = isImage
    ? clamp(0.54 + (ref.p50 - 0.44) * 0.12, 0.52, 0.56)
    : clamp(ref.p50, 0.2, 0.8);

  // Image mode uses shadow-midtone P25+P50 anchor so bright lamps/reflections don't over-brighten moody grades.
  let exposure;
  if (isImage) {
    const lAnchorRef = Math.max(0.14, 0.45 * ref.p25 + 0.55 * ref.p50);
    const lAnchorTgt = Math.max(0.14, 0.45 * tgt.p25 + 0.55 * tgt.p50);
    const evBias = ref.p50 < 0.45 ? -0.10 : 0.0;
    const evRaw = 0.55 * Math.log2(lAnchorRef / lAnchorTgt) + evBias;
    exposure = clamp(evRaw, -0.65, 0.20);
  } else {
    const lAnchorRef = Math.max(0.24, 0.4 * ref.p50 + 0.6 * ref.p75);
    const lAnchorTgt = Math.max(0.24, 0.4 * tgt.p50 + 0.6 * tgt.p75);
    const evRaw = 0.42 * Math.log2(lAnchorRef / lAnchorTgt);
    const maxEv = (tgt.p85 ?? 0.78) >= 0.7 ? 0.15 : 0.35;
    exposure = clamp(evRaw, -0.35, maxEv);
  }
  const m = Math.pow(2, exposure);

  const post = (x) => (x * m - pivot) * contrast + pivot;

  // Black floor (P10) via Shadows and highlight ceiling (P90) via Highlights.
  const isDarkTarget = tgt.hasTarget && tgt.p50 < 0.25;
  const d10 = ref.p10 - post(tgt.p10);
  const w10 = clamp(1 - tgt.p10 * m * TONE_COEFFS.shadowSlope, 0.25, 1);
  const shadowsRaw = d10 / (TONE_COEFFS.strength * w10 * contrast);
  let shadows;
  if (isImage) {
    const deepRef = ref.p25 < tgt.p25 || ref.p10 < 0.12;
    shadows = deepRef
      ? clamp(shadowsRaw, -0.24, 0.02)
      : clamp(shadowsRaw, -0.24, 0.04);
  } else {
    const shadowsCap = 0.04;
    shadows = isFlat
      ? clamp(shadowsRaw, isDarkTarget ? 0.0 : 0.02, shadowsCap)
      : clamp(shadowsRaw, -0.3, shadowsCap);
  }

  const d90 = ref.p90 - post(tgt.p90);
  const w90 = clamp(
    (tgt.p90 * m - TONE_COEFFS.highlightOffset) * TONE_COEFFS.highlightSlope,
    0.25,
    1
  );
  const highlightsRaw = d90 / (TONE_COEFFS.strength * w90 * contrast);
  const highlights = isFlat
    ? clamp(highlightsRaw, -0.42, -0.22)
    : clamp(highlightsRaw, -0.45, 0.2);

  // Hybrid Chromatic Transfer: 70% Reference Signature (vs D65) + 30% Target-to-Reference Delta.
  // Prevents dominant colored objects on the Target from cancelling or reversing the look.
  const hybAB = (rVal, tVal) =>
    tgt.hasTarget ? 0.7 * rVal + 0.3 * (rVal - tVal) : rVal;

  const hybA = hybAB(ref.midA, tgt.midA);
  const hybB = hybAB(ref.midB, tgt.midB);
  const cComp = Math.pow(contrast, 0.6);
  const dA = hybA / cComp;
  const dB = hybB / cComp;

  // Scale ~1.06 (~25% boost) to WB so Reference mood carries strongly at 100% Match Strength.
  const temp = clamp(((dA * WB_J.ib - WB_J.ia * dB) / WB_J.det) * 1.06, -1, 1);
  const tint = clamp(((WB_J.ta * dB - WB_J.tb * dA) / WB_J.det) * 1.06, -1, 1);

  const hybZone = (rz, tz) =>
    [0, 1, 2].map((k) =>
      tgt.hasTarget ? 0.7 * rz[k] + 0.3 * (rz[k] - tz[k]) : rz[k]
    );
  const hS = hybZone(ref.zoneS, tgt.zoneS);
  const hM = hybZone(ref.zoneM, tgt.zoneM);
  const hH = hybZone(ref.zoneH, tgt.zoneH);

  // Midtones (Gamma): ~25% stronger response around neutral #808080.
  const gamma = hM.map((v) =>
    clamp(0.5 + v * 1.81, 0.5 - GAMMA_MAX, 0.5 + GAMMA_MAX)
  );

  // Shadows (Lift) & Highlights (Gain): residual split-toning relative to midtone.
  const diff = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
  const resS = diff(hS, hM);
  const resH = diff(hH, hM).map((v, k) => v * 0.8 + hH[k] * 0.25);

  const wheel = (res, lim, mult = 2.0) =>
    res.map((v) => clamp(0.5 + v * mult, 0.5 - lim, 0.5 + lim));
  const liftLim = isDarkTarget ? Math.min(WHEEL_MAX, 12 / 255) : WHEEL_MAX;
  const lift = wheel(resS, liftLim, 2.0);
  const gain = wheel(resH, WHEEL_MAX, 2.5);

  // Saturation & Vibrance: hybrid chroma transfer so pastel/vivid looks carry cleanly.
  const refTargetChroma = tgt.hasTarget
    ? 0.7 * (ref.cMean / 0.065) + 0.3 * (ref.cMean / Math.max(tgt.cMean, 0.01))
    : ref.cMean / Math.max(tgt.cMean, 0.01);
  const satFloor = isImage ? 0.90 : isFlat ? 0.85 : 0.88;
  const satMax = isImage ? 1.28 : 1.26;
  const sat = clamp(
    refTargetChroma / Math.pow(contrast, isImage ? 0.35 : 0.45),
    satFloor,
    satMax
  );

  const r50 = ref.c50 / Math.max(tgt.c50, 0.015) / cComp;
  const r90 = ref.c90 / Math.max(tgt.c90, 0.02) / cComp;
  const pastelBias = ref.p50 > 0.52 ? 0.14 : 0;
  const vib = clamp(
    (r50 - r90) * 0.85 + pastelBias,
    isImage ? 0.05 : -0.25,
    0.42
  );

  return {
    gradeMix: 1.0,
    exposure,
    contrast,
    pivot,
    shadows,
    highlights,
    temp,
    tint,
    sat,
    vib,
    liftR: lift[0],
    liftG: lift[1],
    liftB: lift[2],
    gammaR: gamma[0],
    gammaG: gamma[1],
    gammaB: gamma[2],
    gainR: gain[0],
    gainG: gain[1],
    gainB: gain[2],
  };
}

export function analyzeImagePixels(
  rgbaArray,
  numPixels,
  onStage,
  targetRgba = null,
  targetNumPixels = 0,
  mediaType = "image"
) {
  if (!checkAllowedHost()) {
    throw new Error("Unauthorized host environment.");
  }

  if (onStage) onStage("Analyzing reference luminance & chroma...");
  const ref = computeLookStats(rgbaArray, numPixels);

  let tgt = NOMINAL_TARGET;
  if (targetRgba && targetNumPixels > 0) {
    if (onStage) onStage("Analyzing target for dynamic range spread...");
    tgt = computeLookStats(targetRgba, targetNumPixels);
  }

  if (onStage) onStage("Matching tone, white balance & 3-way wheels...");
  const matched = matchLooks(ref, tgt, mediaType);

  const rounded = {};
  for (const key of Object.keys(matched)) {
    rounded[key] = round2(matched[key]);
  }
  return sanitizeParams(rounded);
}

// Computes Rec. 709 mean luma (0..1) on a 4-pixel stride for fast frame screening.
export function computeFrameMeanLuma(rgba) {
  if (!rgba || rgba.length < 4) return 0;
  let sum = 0;
  let count = 0;
  for (let i = 0; i < rgba.length; i += 16) {
    sum += (0.2126 * rgba[i] + 0.7152 * rgba[i + 1] + 0.0722 * rgba[i + 2]) / 255;
    count++;
  }
  return count > 0 ? sum / count : 0;
}

// Removes pure-black letterbox / pillarbox bars (R, G, B <= 8) when active area >= 15%.
export function filterLetterboxPixels(rgba) {
  const total = Math.floor(rgba.length / 4);
  let kept = 0;
  for (let i = 0; i < rgba.length; i += 4) {
    if (rgba[i] > 8 || rgba[i + 1] > 8 || rgba[i + 2] > 8) kept++;
  }
  if (kept < total * 0.15 || kept === total) {
    return { data: rgba, numPixels: total };
  }
  const filtered = new Uint8ClampedArray(kept * 4);
  let ptr = 0;
  for (let i = 0; i < rgba.length; i += 4) {
    if (rgba[i] > 8 || rgba[i + 1] > 8 || rgba[i + 2] > 8) {
      filtered[ptr++] = rgba[i];
      filtered[ptr++] = rgba[i + 1];
      filtered[ptr++] = rgba[i + 2];
      filtered[ptr++] = rgba[i + 3];
    }
  }
  return { data: filtered, numPixels: kept };
}

// Combines multiple valid video frame samples into one bounded RGBA buffer.
export function mergeFramePixelSamples(frames, maxTotalPixels = 360000) {
  if (!frames || frames.length === 0) return null;
  if (frames.length === 1) return frames[0];

  let totalPixels = 0;
  for (const f of frames) {
    totalPixels += f.numPixels;
  }
  if (totalPixels <= 0) return null;

  if (totalPixels <= maxTotalPixels) {
    const merged = new Uint8ClampedArray(totalPixels * 4);
    let offset = 0;
    for (const f of frames) {
      merged.set(f.data.subarray(0, f.numPixels * 4), offset);
      offset += f.numPixels * 4;
    }
    return { data: merged, numPixels: totalPixels };
  }

  const stride = Math.ceil(totalPixels / maxTotalPixels);
  let outCount = 0;
  for (const f of frames) {
    outCount += Math.ceil(f.numPixels / stride);
  }
  const merged = new Uint8ClampedArray(outCount * 4);
  let ptr = 0;
  for (const f of frames) {
    const src = f.data;
    const limit = f.numPixels * 4;
    for (let i = 0; i < limit; i += stride * 4) {
      merged[ptr++] = src[i];
      merged[ptr++] = src[i + 1];
      merged[ptr++] = src[i + 2];
      merged[ptr++] = src[i + 3];
    }
  }
  return { data: merged, numPixels: Math.floor(ptr / 4) };
}
