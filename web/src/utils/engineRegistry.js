import { analyzeImagePixels } from "./colorGrading.js";
import {
  DEFAULT_PARAMS,
  IDENTITY_POLY_R,
  IDENTITY_POLY_G,
  IDENTITY_POLY_B,
  IDENTITY_HUE6,
  clamp,
  sanitizeParams,
  prepareGrade,
  gradeRGB,
} from "./gradeEngine.js";
import { checkAllowedHost } from "./hostGuard.js";
import {
  compressOklabChroma,
  autoNormalizeTargetPixels,
  applyTargetAutoNormalizeOffsets,
} from "./colorMatcher.js";
import { applyLogProfileToRgba, isLogProfileActive } from "./logProfiles.js";

export const DEFAULT_ENGINE_ID = "v3";

export const ENGINE_CODENAME_MAP = {
  v1: "altair",
  v2: "vega",
  v3: "polaris",
};

export function getEngineCodename(engineId = DEFAULT_ENGINE_ID) {
  return ENGINE_CODENAME_MAP[engineId] || ENGINE_CODENAME_MAP[DEFAULT_ENGINE_ID];
}

const SRGB_TO_LINEAR = (() => {
  const t = new Float32Array(256);
  for (let i = 0; i < 256; i++) {
    const c = i / 255;
    t[i] = c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
  }
  return t;
})();

function linearToSrgb(x) {
  const c = clamp(x, 0.0, 1.0);
  return c <= 0.0031308 ? c * 12.92 : 1.055 * Math.pow(c, 1 / 2.4) - 0.055;
}

function rgbLinearToOklab(lr, lg, lb, out) {
  const l = Math.cbrt(Math.max(0, 0.4122214708 * lr + 0.5363325363 * lg + 0.0514459929 * lb));
  const m = Math.cbrt(Math.max(0, 0.2119034982 * lr + 0.6806995451 * lg + 0.1073969566 * lb));
  const s = Math.cbrt(Math.max(0, 0.0883024619 * lr + 0.2817188376 * lg + 0.6299787005 * lb));
  out[0] = 0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s;
  out[1] = 1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s;
  out[2] = 0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s;
}

function oklabToSrgb(L, a, b, out) {
  const l_ = L + 0.3963377774 * a + 0.2158037573 * b;
  const m_ = L - 0.1055613458 * a - 0.0638541728 * b;
  const s_ = L - 0.0894841775 * a - 1.291485548 * b;
  const l = l_ * l_ * l_;
  const m = m_ * m_ * m_;
  const s = s_ * s_ * s_;
  const lr = 4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s;
  const lg = -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s;
  const lb = -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s;
  out[0] = linearToSrgb(lr);
  out[1] = linearToSrgb(lg);
  out[2] = linearToSrgb(lb);
}

function round2(v) {
  return Math.round(v * 100) / 100;
}

function round6(v) {
  const r = Math.round(v * 1e6) / 1e6;
  return r === 0 ? 0 : r;
}

function smoothstep(edge0, edge1, x) {
  const t = clamp((x - edge0) / Math.max(edge1 - edge0, 1e-5), 0.0, 1.0);
  return t * t * (3.0 - 2.0 * t);
}

// ---------------------------------------------------------------------------
// Engine v1: Classic Fast (Fast linear RGB mean/std matching with crisp contrast)
// ---------------------------------------------------------------------------
function computeFastRgbStats(rgba, numPixels) {
  const stride = Math.max(1, Math.floor(numPixels / 16000));
  let sumR = 0, sumG = 0, sumB = 0, sumY = 0;
  let sqR = 0, sqG = 0, sqB = 0, sqY = 0;
  let shR = 0, shG = 0, shB = 0, shY = 0, shN = 0;
  let hiR = 0, hiG = 0, hiB = 0, hiY = 0, hiN = 0;
  let satSum = 0;
  let n = 0;

  for (let p = 0; p < numPixels; p += stride) {
    const i = p * 4;
    const r = rgba[i] / 255;
    const g = rgba[i + 1] / 255;
    const b = rgba[i + 2] / 255;
    const y = 0.2126 * r + 0.7152 * g + 0.0722 * b;
    if (y < 0.015 || y > 0.985) continue;

    sumR += r;
    sumG += g;
    sumB += b;
    sumY += y;
    sqR += r * r;
    sqG += g * g;
    sqB += b * b;
    sqY += y * y;

    const maxC = Math.max(r, g, b);
    const minC = Math.min(r, g, b);
    satSum += (maxC - minC) / Math.max(maxC, 1e-4);
    n++;

    if (y < 0.32) {
      shR += r; shG += g; shB += b; shY += y; shN++;
    } else if (y > 0.68) {
      hiR += r; hiG += g; hiB += b; hiY += y; hiN++;
    }
  }

  if (n < 16) {
    return {
      meanR: 0.45, meanG: 0.45, meanB: 0.45, meanY: 0.45,
      stdR: 0.2, stdG: 0.2, stdB: 0.2, stdY: 0.2,
      meanSat: 0.25,
      shBias: [0, 0, 0],
      hiBias: [0, 0, 0],
      hasTarget: false,
    };
  }

  const meanR = sumR / n;
  const meanG = sumG / n;
  const meanB = sumB / n;
  const meanY = sumY / n;
  const stdR = Math.sqrt(Math.max(1e-4, sqR / n - meanR * meanR));
  const stdG = Math.sqrt(Math.max(1e-4, sqG / n - meanG * meanG));
  const stdB = Math.sqrt(Math.max(1e-4, sqB / n - meanB * meanB));
  const stdY = Math.sqrt(Math.max(1e-4, sqY / n - meanY * meanY));

  const shBias = shN > 16
    ? [shR / shN - shY / shN, shG / shN - shY / shN, shB / shN - shY / shN]
    : [0, 0, 0];
  const hiBias = hiN > 16
    ? [hiR / hiN - hiY / hiN, hiG / hiN - hiY / hiN, hiB / hiN - hiY / hiN]
    : [0, 0, 0];

  return {
    meanR, meanG, meanB, meanY,
    stdR, stdG, stdB, stdY,
    meanSat: satSum / n,
    shBias,
    hiBias,
    hasTarget: true,
  };
}

const V1_NOMINAL_TGT = {
  meanR: 0.44, meanG: 0.44, meanB: 0.44, meanY: 0.44,
  stdR: 0.21, stdG: 0.21, stdB: 0.21, stdY: 0.21,
  meanSat: 0.24,
  shBias: [0, 0, 0],
  hiBias: [0, 0, 0],
  hasTarget: false,
};

function analyzeEngineV1(refData, tgtData, options = {}) {
  if (!checkAllowedHost()) {
    throw new Error("Unauthorized host environment.");
  }
  const { numPixels = 0, targetNumPixels = 0, onStage } = options;
  const refN = numPixels || (refData ? Math.floor(refData.length / 4) : 0);
  const tgtN = targetNumPixels || (tgtData ? Math.floor(tgtData.length / 4) : 0);

  if (onStage) onStage("Engine v1: Computing fast RGB mean & std...");
  const ref = computeFastRgbStats(refData, refN);
  const tgt = tgtData && tgtN > 0 ? computeFastRgbStats(tgtData, tgtN) : V1_NOMINAL_TGT;

  const stdRatio = clamp(ref.stdY / Math.max(tgt.stdY, 0.06), 0.72, 1.55);
  const contrast = clamp(stdRatio * 1.06, 0.82, 1.48);
  const pivot = clamp(ref.meanY, 0.28, 0.65);

  const evRaw = 0.52 * Math.log2(Math.max(ref.meanY, 0.08) / Math.max(tgt.meanY, 0.08));
  const exposure = clamp(evRaw, -0.55, 0.40);

  const refRB = (ref.meanR - ref.meanB) - (tgt.hasTarget ? (tgt.meanR - tgt.meanB) * 0.35 : 0);
  const refGM = (ref.meanG - 0.5 * (ref.meanR + ref.meanB)) -
    (tgt.hasTarget ? (tgt.meanG - 0.5 * (tgt.meanR + tgt.meanB)) * 0.35 : 0);
  const temp = clamp(refRB * 1.95, -0.85, 0.85);
  const tint = clamp(-refGM * 2.1, -0.85, 0.85);

  const shadows = clamp((ref.meanY - tgt.meanY) * -0.25 - (contrast - 1.0) * 0.12, -0.22, 0.08);
  const highlights = clamp((ref.stdY - tgt.stdY) * 0.35, -0.28, 0.22);

  const satRatio = tgt.hasTarget
    ? 0.7 * (ref.meanSat / 0.24) + 0.3 * (ref.meanSat / Math.max(tgt.meanSat, 0.06))
    : ref.meanSat / 0.24;
  const sat = clamp(satRatio, 0.82, 1.32);
  const vib = clamp((sat - 1.0) * 0.45, -0.25, 0.35);

  const midBiasR = ref.meanR - ref.meanY;
  const midBiasG = ref.meanG - ref.meanY;
  const midBiasB = ref.meanB - ref.meanY;

  const out = {
    ...DEFAULT_PARAMS,
    gradeMix: 1.0,
    autoGradeMix: 0.0,
    exposure: round2(exposure),
    contrast: round2(contrast),
    pivot: round2(pivot),
    shadows: round2(shadows),
    highlights: round2(highlights),
    temp: round2(temp),
    tint: round2(tint),
    sat: round2(sat),
    vib: round2(vib),
    liftR: round2(clamp(0.5 + (ref.shBias[0] - midBiasR) * 1.4, 0.38, 0.62)),
    liftG: round2(clamp(0.5 + (ref.shBias[1] - midBiasG) * 1.4, 0.38, 0.62)),
    liftB: round2(clamp(0.5 + (ref.shBias[2] - midBiasB) * 1.4, 0.38, 0.62)),
    gammaR: round2(clamp(0.5 + midBiasR * 1.5, 0.40, 0.60)),
    gammaG: round2(clamp(0.5 + midBiasG * 1.5, 0.40, 0.60)),
    gammaB: round2(clamp(0.5 + midBiasB * 1.5, 0.40, 0.60)),
    gainR: round2(clamp(0.5 + ref.hiBias[0] * 1.6, 0.38, 0.62)),
    gainG: round2(clamp(0.5 + ref.hiBias[1] * 1.6, 0.38, 0.62)),
    gainB: round2(clamp(0.5 + ref.hiBias[2] * 1.6, 0.38, 0.62)),
    polyR: IDENTITY_POLY_R.slice(),
    polyG: IDENTITY_POLY_G.slice(),
    polyB: IDENTITY_POLY_B.slice(),
    hueShift: IDENTITY_HUE6.slice(),
    hueSat: IDENTITY_HUE6.slice(),
    hueLuma: IDENTITY_HUE6.slice(),
  };
  return sanitizeParams(out);
}

// ---------------------------------------------------------------------------
// Engine v3: Cinema Hybrid Pro
//   - Perceptual OKLab (L, a, b) Float32Array sampling (< 2 MB RAM, < 25 ms)
//   - Multi-Cue Saliency (Sobel gradient energy + center-weighted prior +
//     chromatic rarity damping + OKLab skin-tone ellipsoid guard)
//   - Decoupled Luma & Black-Floor Lock (P10-P90 quantiles, tanh soft-knee EV cap,
//     neutral Blacks/luma Lift lock, shadow slope cap maxGain <= 1.45 for L < 0.25)
//   - Asymmetric DR Guardrail & Opposing-Ends Lock (contrast >= 0.88, no simultaneous
//     inward collapse of Blacks & Whites, soft-knee chroma min scale >= 0.68)
//   - Highlight Neutrality Guard (L > 0.72)
//   - Smoothed 17^3 OKLab Lattice + 32-projection Sliced Wasserstein OT +
//     3D Laplacian smoothing + 20x20 Ridge Regression Poly-3 + 6-Hue +
//     1 closed-loop residual correction pass
//   - Temporal Luminance Smoothing (EMA alpha = 0.2 across consecutive video frames)
// ---------------------------------------------------------------------------

// Temporal state for video EMA smoothing across consecutive analyses of the same video source.
const temporalVideoState = {
  active: false,
  p10: 0,
  p25: 0,
  p50: 0,
  p75: 0,
  p90: 0,
  midA: 0,
  midB: 0,
  cMean: 0,
  exposure: 0,
  contrast: 1,
};

export function resetV3TemporalState() {
  temporalVideoState.active = false;
}

// Precomputed 32 deterministic unit directions on S^2 (Fibonacci sphere) for 32-projection Sliced Wasserstein OT.
const SWOT_DIRS = (() => {
  const N = 32;
  const dirs = new Float32Array(N * 3);
  const phi = (1 + Math.sqrt(5)) / 2;
  for (let i = 0; i < N; i++) {
    if (i === 0) {
      // Pure L axis first
      dirs[0] = 1; dirs[1] = 0; dirs[2] = 0;
      continue;
    }
    if (i === 1) {
      dirs[3] = 0; dirs[4] = 1; dirs[5] = 0;
      continue;
    }
    if (i === 2) {
      dirs[6] = 0; dirs[7] = 0; dirs[8] = 1;
      continue;
    }
    const z = 1 - (2 * (i + 0.5)) / N;
    const r = Math.sqrt(Math.max(0, 1 - z * z));
    const theta = (2 * Math.PI * i) / phi;
    dirs[i * 3] = z;
    dirs[i * 3 + 1] = r * Math.cos(theta);
    dirs[i * 3 + 2] = r * Math.sin(theta);
  }
  return dirs;
})();

const MAX_SAMPLES = 4096;

function extractSaliencyOklabSamples(rgba, numPixels) {
  if (!rgba || numPixels < 1) {
    return null;
  }
  // Estimate 2D grid dimensions for Sobel & center prior (assume ~16:9 if only numPixels known).
  const estW = Math.max(16, Math.round(Math.sqrt(numPixels * (16 / 9))));
  const estH = Math.max(16, Math.round(numPixels / estW));
  const step = Math.max(1, Math.floor(Math.sqrt(numPixels / MAX_SAMPLES)));
  const gridW = Math.max(4, Math.floor(estW / step));
  const gridH = Math.max(4, Math.floor(estH / step));
  const count = Math.min(MAX_SAMPLES, gridW * gridH);

  const sampL = new Float32Array(count);
  const sampA = new Float32Array(count);
  const sampB = new Float32Array(count);
  const sampW = new Float32Array(count);
  const sampSkin = new Float32Array(count);
  const gridL = new Float32Array(gridW * gridH);

  // Chroma rarity histogram (12 hue bins x 4 chroma bins = 48 bins)
  const rarityHist = new Float32Array(48);
  const sampleBin = new Uint8Array(count);

  const lab = [0, 0, 0];
  let idx = 0;
  for (let gy = 0; gy < gridH && idx < count; gy++) {
    const py = Math.min(estH - 1, gy * step);
    const ny = (gy + 0.5) / gridH - 0.5;
    for (let gx = 0; gx < gridW && idx < count; gx++) {
      const px = Math.min(estW - 1, gx * step);
      const p = Math.min(numPixels - 1, py * estW + px);
      const off = p * 4;
      const lr = SRGB_TO_LINEAR[rgba[off]];
      const lg = SRGB_TO_LINEAR[rgba[off + 1]];
      const lb = SRGB_TO_LINEAR[rgba[off + 2]];
      rgbLinearToOklab(lr, lg, lb, lab);

      const L = lab[0];
      const a = lab[1];
      const b = lab[2];
      sampL[idx] = L;
      sampA[idx] = a;
      sampB[idx] = b;
      gridL[gy * gridW + gx] = L;

      // OKLab skin-tone ellipsoid guard (a: 0.02..0.14, b: 0.03..0.16, L: 0.25..0.88)
      const da = (a - 0.08) / 0.06;
      const db = (b - 0.095) / 0.065;
      const dl = (L - 0.58) / 0.32;
      const dist2 = da * da + db * db + 0.35 * dl * dl;
      const skinProb = dist2 < 1.8 ? Math.exp(-0.85 * dist2) : 0.0;
      sampSkin[idx] = skinProb;

      const chr = Math.sqrt(a * a + b * b);
      const hIdx = Math.min(11, Math.max(0, Math.floor(((Math.atan2(b, a) + Math.PI) / (2 * Math.PI)) * 12)));
      const cIdx = Math.min(3, Math.floor(chr / 0.06));
      const bin = hIdx * 4 + cIdx;
      sampleBin[idx] = bin;
      rarityHist[bin] += 1;

      // Center-weighted prior (suppresses peripheral frame edges)
      const nx = (gx + 0.5) / gridW - 0.5;
      const r2 = nx * nx + ny * ny;
      sampW[idx] = 0.55 + 0.45 * Math.exp(-2.2 * r2);
      idx++;
    }
  }

  const N = idx;
  let totalW = 0;
  let skinWeightSum = 0;
  let skinASum = 0;
  let skinBSum = 0;
  let skinLSum = 0;

  // Multi-Cue Saliency: Sobel gradient energy + chromatic rarity damping + skin guard
  for (let gy = 0; gy < gridH; gy++) {
    const y0 = Math.max(0, gy - 1);
    const y2 = Math.min(gridH - 1, gy + 1);
    for (let gx = 0; gx < gridW; gx++) {
      const k = gy * gridW + gx;
      if (k >= N) break;
      const x0 = Math.max(0, gx - 1);
      const x2 = Math.min(gridW - 1, gx + 1);

      const tl = gridL[y0 * gridW + x0];
      const tc = gridL[y0 * gridW + gx];
      const tr = gridL[y0 * gridW + x2];
      const ml = gridL[gy * gridW + x0];
      const mr = gridL[gy * gridW + x2];
      const bl = gridL[y2 * gridW + x0];
      const bc = gridL[y2 * gridW + gx];
      const br = gridL[y2 * gridW + x2];

      const gxSobel = -tl + tr - 2 * ml + 2 * mr - bl + br;
      const gySobel = -tl - 2 * tc - tr + bl + 2 * bc + br;
      const gradEnergy = Math.sqrt(gxSobel * gxSobel + gySobel * gySobel);

      // Suppress flat background regions (e.g., solid red walls/curtains)
      const edgeWeight = 0.32 + 0.68 * Math.tanh(gradEnergy * 4.5);

      // Chromatic rarity damping: prevent huge uniform color blocks from dominating
      const binFreq = rarityHist[sampleBin[k]] / Math.max(1, N);
      const chr = Math.sqrt(sampA[k] * sampA[k] + sampB[k] * sampB[k]);
      const rarityDamp = chr > 0.045 && binFreq > 0.14
        ? clamp(0.14 / binFreq, 0.35, 1.0)
        : 1.0;

      const L = sampL[k];
      const validLuma = L > 0.025 && L < 0.985 ? 1.0 : 0.08;
      const skinBoost = 1.0 + 0.65 * sampSkin[k];

      const w = sampW[k] * edgeWeight * rarityDamp * validLuma * skinBoost;
      sampW[k] = w;
      totalW += w;

      if (sampSkin[k] > 0.25) {
        const sw = sampSkin[k] * w;
        skinWeightSum += sw;
        skinLSum += L * sw;
        skinASum += sampA[k] * sw;
        skinBSum += sampB[k] * sw;
      }
    }
  }

  if (totalW <= 1e-6) {
    for (let i = 0; i < N; i++) sampW[i] = 1 / Math.max(1, N);
    totalW = 1.0;
  } else {
    const inv = 1.0 / totalW;
    for (let i = 0; i < N; i++) sampW[i] *= inv;
  }

  // Compute weighted luma & chroma quantiles + zone stats
  const lHist = new Float32Array(256);
  const cHist = new Float32Array(256);
  let midA = 0, midB = 0, midW = 0;
  let shA = 0, shB = 0, shW = 0;
  let hiA = 0, hiB = 0, hiW = 0;
  let cMean = 0;

  for (let i = 0; i < N; i++) {
    const L = sampL[i];
    const a = sampA[i];
    const b = sampB[i];
    const w = sampW[i];
    const chr = Math.sqrt(a * a + b * b);

    lHist[Math.min(255, Math.max(0, Math.floor(L * 255)))] += w;
    cHist[Math.min(255, Math.max(0, Math.floor((chr / 0.32) * 255)))] += w;
    cMean += chr * w;

    if (L >= 0.22 && L <= 0.75) {
      midA += a * w;
      midB += b * w;
      midW += w;
    }
    if (L >= 0.05 && L < 0.34) {
      shA += a * w;
      shB += b * w;
      shW += w;
    } else if (L > 0.68 && L <= 0.96) {
      // Highlight Neutrality Guard: damp background color cast above L > 0.72
      const hiNeutralGuard = L > 0.72 ? clamp(1.0 - (L - 0.72) * 2.6, 0.22, 1.0) : 1.0;
      hiA += a * hiNeutralGuard * w;
      hiB += b * hiNeutralGuard * w;
      hiW += w;
    }
  }

  const quantile = (hist, q, scale = 1.0) => {
    let sum = 0;
    for (let i = 0; i < 256; i++) sum += hist[i];
    if (sum <= 1e-7) return 0.5 * scale;
    const target = q * sum;
    let acc = 0;
    for (let i = 0; i < 256; i++) {
      acc += hist[i];
      if (acc >= target) return ((i + 0.5) / 256) * scale;
    }
    return scale;
  };

  return {
    N,
    L: sampL.subarray(0, N),
    A: sampA.subarray(0, N),
    B: sampB.subarray(0, N),
    W: sampW.subarray(0, N),
    Skin: sampSkin.subarray(0, N),
    p10: quantile(lHist, 0.10, 1.0),
    p25: quantile(lHist, 0.25, 1.0),
    p50: quantile(lHist, 0.50, 1.0),
    p75: quantile(lHist, 0.75, 1.0),
    p90: quantile(lHist, 0.90, 1.0),
    c50: quantile(cHist, 0.50, 0.32),
    c90: quantile(cHist, 0.90, 0.32),
    cMean,
    midA: midW > 1e-4 ? midA / midW : 0,
    midB: midW > 1e-4 ? midB / midW : 0,
    shA: shW > 1e-4 ? shA / shW : 0,
    shB: shW > 1e-4 ? shB / shW : 0,
    hiA: hiW > 1e-4 ? hiA / hiW : 0,
    hiB: hiW > 1e-4 ? hiB / hiW : 0,
    skinRatio: skinWeightSum / Math.max(1e-6, totalW),
    skinL: skinWeightSum > 1e-5 ? skinLSum / skinWeightSum : 0.62,
    skinA: skinWeightSum > 1e-5 ? skinASum / skinWeightSum : 0.065,
    skinB: skinWeightSum > 1e-5 ? skinBSum / skinWeightSum : 0.085,
    hasTarget: true,
  };
}

// Synthetic neutral D65 target sample cloud when only Reference is provided.
function createNominalTargetSamples() {
  const G = 12;
  const N = G * G * G;
  const L = new Float32Array(N);
  const A = new Float32Array(N);
  const B = new Float32Array(N);
  const W = new Float32Array(N);
  const Skin = new Float32Array(N);
  const lab = [0, 0, 0];
  let idx = 0;
  let wSum = 0;
  for (let r = 0; r < G; r++) {
    const rv = (r + 0.5) / G;
    const lr = rv <= 0.04045 ? rv / 12.92 : Math.pow((rv + 0.055) / 1.055, 2.4);
    for (let g = 0; g < G; g++) {
      const gv = (g + 0.5) / G;
      const lg = gv <= 0.04045 ? gv / 12.92 : Math.pow((gv + 0.055) / 1.055, 2.4);
      for (let b = 0; b < G; b++) {
        const bv = (b + 0.5) / G;
        const lb = bv <= 0.04045 ? bv / 12.92 : Math.pow((bv + 0.055) / 1.055, 2.4);
        rgbLinearToOklab(lr, lg, lb, lab);
        L[idx] = lab[0];
        A[idx] = lab[1];
        B[idx] = lab[2];
        const chr = Math.sqrt(lab[1] * lab[1] + lab[2] * lab[2]);
        const w = Math.exp(-chr * 6.5);
        W[idx] = w;
        wSum += w;
        idx++;
      }
    }
  }
  for (let i = 0; i < N; i++) W[i] /= wSum;
  return {
    N,
    L,
    A,
    B,
    W,
    Skin,
    p10: 0.22,
    p25: 0.36,
    p50: 0.54,
    p75: 0.72,
    p90: 0.86,
    c50: 0.048,
    c90: 0.135,
    cMean: 0.062,
    midA: 0,
    midB: 0,
    shA: 0,
    shB: 0,
    hiA: 0,
    hiB: 0,
    skinRatio: 0,
    skinL: 0.62,
    skinA: 0.065,
    skinB: 0.085,
    hasTarget: false,
  };
}

// Solves A * x = b (D x D linear system) in-place with partial pivoting.
function solveLinearSystem(A, b, D) {
  const M = new Float64Array(D * D);
  const rhs = new Float64Array(D);
  for (let i = 0; i < D * D; i++) M[i] = A[i];
  for (let i = 0; i < D; i++) rhs[i] = b[i];

  for (let col = 0; col < D; col++) {
    let pivotRow = col;
    let maxVal = Math.abs(M[col * D + col]);
    for (let row = col + 1; row < D; row++) {
      const v = Math.abs(M[row * D + col]);
      if (v > maxVal) {
        maxVal = v;
        pivotRow = row;
      }
    }
    if (maxVal < 1e-12) continue;
    if (pivotRow !== col) {
      for (let k = col; k < D; k++) {
        const tmp = M[col * D + k];
        M[col * D + k] = M[pivotRow * D + k];
        M[pivotRow * D + k] = tmp;
      }
      const tmpB = rhs[col];
      rhs[col] = rhs[pivotRow];
      rhs[pivotRow] = tmpB;
    }

    const diag = M[col * D + col];
    for (let row = col + 1; row < D; row++) {
      const factor = M[row * D + col] / diag;
      if (Math.abs(factor) < 1e-15) continue;
      for (let k = col; k < D; k++) {
        M[row * D + k] -= factor * M[col * D + k];
      }
      rhs[row] -= factor * rhs[col];
    }
  }

  const x = new Float64Array(D);
  for (let row = D - 1; row >= 0; row--) {
    let sum = rhs[row];
    for (let k = row + 1; k < D; k++) {
      sum -= M[row * D + k] * x[k];
    }
    const diag = M[row * D + row];
    x[row] = Math.abs(diag) > 1e-12 ? sum / diag : 0.0;
  }
  return x;
}

function fillPolyBasis20(r, g, b, basis) {
  const r2 = r * r;
  const g2 = g * g;
  const b2 = b * b;
  basis[0] = 1.0;
  basis[1] = r;
  basis[2] = g;
  basis[3] = b;
  basis[4] = r2;
  basis[5] = g2;
  basis[6] = b2;
  basis[7] = r * g;
  basis[8] = r * b;
  basis[9] = g * b;
  basis[10] = r2 * r;
  basis[11] = g2 * g;
  basis[12] = b2 * b;
  basis[13] = r2 * g;
  basis[14] = r2 * b;
  basis[15] = g2 * r;
  basis[16] = g2 * b;
  basis[17] = b2 * r;
  basis[18] = b2 * g;
  basis[19] = r * g * b;
}

const HUE_CENTERS = [
  0.0,
  1.04719755,
  2.0943951,
  3.14159265,
  -2.0943951,
  -1.04719755,
];

function hueSectorWeight(h, center) {
  const d = Math.atan2(Math.sin(h - center), Math.cos(h - center));
  const w = clamp(1.0 - Math.abs(d) / 1.04719755, 0.0, 1.0);
  return w * w * (3.0 - 2.0 * w);
}

// Builds a 17x17x17 OKLab lattice, runs 32-projection Sliced Wasserstein OT,
// applies 3D Laplacian neighbor smoothing, and enforces Decoupled Luma & Black-Floor Lock,
// Asymmetric DR Guardrail, Skin-Tone Ellipsoid Guard, and Highlight Neutrality Guard.
function buildSmoothedOklabLattice(ref, tgt, isLowContrastRefToHighContrastTgt) {
  const G = 17;
  const N3 = G * G * G; // 4913 nodes
  const latL = new Float32Array(N3);
  const latA = new Float32Array(N3);
  const latB = new Float32Array(N3);
  const origL = new Float32Array(N3);
  const origA = new Float32Array(N3);
  const origB = new Float32Array(N3);

  const lab = [0, 0, 0];
  let ptr = 0;
  for (let bz = 0; bz < G; bz++) {
    const bv = bz / (G - 1);
    const lb = bv <= 0.04045 ? bv / 12.92 : Math.pow((bv + 0.055) / 1.055, 2.4);
    for (let gy = 0; gy < G; gy++) {
      const gv = gy / (G - 1);
      const lg = gv <= 0.04045 ? gv / 12.92 : Math.pow((gv + 0.055) / 1.055, 2.4);
      for (let rx = 0; rx < G; rx++) {
        const rv = rx / (G - 1);
        const lr = rv <= 0.04045 ? rv / 12.92 : Math.pow((rv + 0.055) / 1.055, 2.4);
        rgbLinearToOklab(lr, lg, lb, lab);
        latL[ptr] = lab[0];
        latA[ptr] = lab[1];
        latB[ptr] = lab[2];
        origL[ptr] = lab[0];
        origA[ptr] = lab[1];
        origB[ptr] = lab[2];
        ptr++;
      }
    }
  }

  // 32-projection Sliced Wasserstein Optimal Transport (1D CDF quantile transfer per projection)
  const BINS = 64;
  const rHist = new Float32Array(BINS);
  const tHist = new Float32Array(BINS);
  const rCdf = new Float32Array(BINS);
  const tCdf = new Float32Array(BINS);
  const lut1D = new Float32Array(BINS);
  const stepSize = 0.20;

  for (let p = 0; p < 32; p++) {
    const dx = SWOT_DIRS[p * 3];
    const dy = SWOT_DIRS[p * 3 + 1];
    const dz = SWOT_DIRS[p * 3 + 2];

    // Projection bounds
    const pMin = -0.45;
    const pMax = 1.15;
    const invSpan = (BINS - 1) / (pMax - pMin);

    rHist.fill(0);
    tHist.fill(0);

    for (let i = 0; i < ref.N; i++) {
      const proj = ref.L[i] * dx + ref.A[i] * dy + ref.B[i] * dz;
      const bIdx = Math.min(BINS - 1, Math.max(0, Math.floor((proj - pMin) * invSpan)));
      rHist[bIdx] += ref.W[i];
    }
    for (let i = 0; i < tgt.N; i++) {
      const proj = tgt.L[i] * dx + tgt.A[i] * dy + tgt.B[i] * dz;
      const bIdx = Math.min(BINS - 1, Math.max(0, Math.floor((proj - pMin) * invSpan)));
      tHist[bIdx] += tgt.W[i];
    }

    let accR = 0;
    let accT = 0;
    for (let b = 0; b < BINS; b++) {
      accR += rHist[b] + 1e-6;
      accT += tHist[b] + 1e-6;
      rCdf[b] = accR;
      tCdf[b] = accT;
    }
    for (let b = 0; b < BINS; b++) {
      rCdf[b] /= accR;
      tCdf[b] /= accT;
    }

    // Invert rCdf at tCdf[b]
    let rPtr = 0;
    for (let b = 0; b < BINS; b++) {
      const q = tCdf[b];
      while (rPtr < BINS - 1 && rCdf[rPtr] < q) rPtr++;
      const prev = Math.max(0, rPtr - 1);
      const denom = Math.max(1e-6, rCdf[rPtr] - rCdf[prev]);
      const frac = clamp((q - rCdf[prev]) / denom, 0, 1);
      const rBin = prev + frac;
      const origVal = pMin + (b / (BINS - 1)) * (pMax - pMin);
      const matchedVal = pMin + (rBin / (BINS - 1)) * (pMax - pMin);
      lut1D[b] = matchedVal - origVal;
    }

    // Apply transport displacement to 17^3 lattice nodes
    for (let i = 0; i < N3; i++) {
      const proj = latL[i] * dx + latA[i] * dy + latB[i] * dz;
      const fBin = clamp((proj - pMin) * invSpan, 0, BINS - 1);
      const b0 = Math.floor(fBin);
      const b1 = Math.min(BINS - 1, b0 + 1);
      const frac = fBin - b0;
      const delta = (lut1D[b0] * (1 - frac) + lut1D[b1] * frac) * stepSize;
      latL[i] += delta * dx * 0.42;
      latA[i] += delta * dy * 0.58;
      latB[i] += delta * dz * 0.58;
    }
  }

  // 3D Laplacian neighbor smoothing on the 17^3 lattice (2 passes)
  const tmpL = new Float32Array(N3);
  const tmpA = new Float32Array(N3);
  const tmpB = new Float32Array(N3);
  const smoothAlpha = 0.28;

  for (let pass = 0; pass < 2; pass++) {
    for (let bz = 0; bz < G; bz++) {
      const z0 = Math.max(0, bz - 1);
      const z1 = Math.min(G - 1, bz + 1);
      for (let gy = 0; gy < G; gy++) {
        const y0 = Math.max(0, gy - 1);
        const y1 = Math.min(G - 1, gy + 1);
        for (let rx = 0; rx < G; rx++) {
          const x0 = Math.max(0, rx - 1);
          const x1 = Math.min(G - 1, rx + 1);
          const idx = rx + gy * G + bz * G * G;

          const nIdx0 = x0 + gy * G + bz * G * G;
          const nIdx1 = x1 + gy * G + bz * G * G;
          const nIdx2 = rx + y0 * G + bz * G * G;
          const nIdx3 = rx + y1 * G + bz * G * G;
          const nIdx4 = rx + gy * G + z0 * G * G;
          const nIdx5 = rx + gy * G + z1 * G * G;

          const avgL = (latL[nIdx0] + latL[nIdx1] + latL[nIdx2] + latL[nIdx3] + latL[nIdx4] + latL[nIdx5]) / 6;
          const avgA = (latA[nIdx0] + latA[nIdx1] + latA[nIdx2] + latA[nIdx3] + latA[nIdx4] + latA[nIdx5]) / 6;
          const avgB = (latB[nIdx0] + latB[nIdx1] + latB[nIdx2] + latB[nIdx3] + latB[nIdx4] + latB[nIdx5]) / 6;

          tmpL[idx] = latL[idx] * (1 - smoothAlpha) + avgL * smoothAlpha;
          tmpA[idx] = latA[idx] * (1 - smoothAlpha) + avgA * smoothAlpha;
          tmpB[idx] = latB[idx] * (1 - smoothAlpha) + avgB * smoothAlpha;
        }
      }
    }
    latL.set(tmpL);
    latA.set(tmpA);
    latB.set(tmpB);
  }

  // Enforce guardrails on every lattice node:
  // 1. Decoupled Luma & Black-Floor Lock: shadow slope cap maxGain <= 1.45 for L < 0.25, lock pure blacks
  // 2. OKLab Skin-Tone Ellipsoid Guard (a: 0.02..0.14, b: 0.03..0.16)
  // 3. Highlight Neutrality Guard (L > 0.72)
  // 4. Asymmetric DR soft-knee chroma floor (min scale >= 0.68)
  for (let i = 0; i < N3; i++) {
    const L0 = origL[i];
    const a0 = origA[i];
    const b0 = origB[i];

    // Black-floor lock + shadow slope cap maxGain <= 1.45 for L < 0.25
    const blackLock = smoothstep(0.02, 0.14, L0);
    let L1 = L0 + (latL[i] - L0) * blackLock * 0.55;
    if (L0 < 0.25 && L0 > 1e-4) {
      const maxShadowL = L0 * 1.45;
      const minShadowL = L0 * 0.72;
      L1 = clamp(L1, minShadowL, maxShadowL);
    }

    let a1 = latA[i];
    let b1 = latB[i];

    // Asymmetric DR Guardrail: prevent gray-soup washout when Reference has lower contrast
    const chr0 = Math.sqrt(a0 * a0 + b0 * b0);
    const chr1 = Math.sqrt(a1 * a1 + b1 * b1);
    if (chr0 > 0.012 && chr1 < chr0 * 0.68) {
      const minScale = isLowContrastRefToHighContrastTgt ? 0.74 : 0.68;
      const targetChr = chr0 * minScale;
      const boost = targetChr / Math.max(chr1, 1e-5);
      a1 *= boost;
      b1 *= boost;
    }

    // OKLab skin-tone ellipsoid guard (a: 0.02..0.14, b: 0.03..0.16)
    const da = (a0 - 0.08) / 0.06;
    const db = (b0 - 0.095) / 0.065;
    const dl = (L0 - 0.58) / 0.32;
    const skinDist2 = da * da + db * db + 0.35 * dl * dl;
    if (skinDist2 < 1.5) {
      const skinGuard = Math.exp(-0.9 * skinDist2) * 0.62;
      a1 = a1 * (1 - skinGuard) + clamp(a1, 0.02, 0.14) * skinGuard;
      b1 = b1 * (1 - skinGuard) + clamp(b1, 0.03, 0.16) * skinGuard;
      L1 = L1 * (1 - skinGuard * 0.5) + L0 * (skinGuard * 0.5);
    }

    // Highlight Neutrality Guard (L > 0.72): protect bright clouds/highlights from background tint
    if (L0 > 0.72) {
      const hiGuard = smoothstep(0.72, 0.94, L0) * 0.72;
      a1 = a1 * (1 - hiGuard) + a0 * hiGuard;
      b1 = b1 * (1 - hiGuard) + b0 * hiGuard;
    }

    // Shadow neutrality near black floor
    a1 = a0 + (a1 - a0) * blackLock;
    b1 = b0 + (b1 - b0) * blackLock;

    // Perceptual OKLab Soft Gamut Compression (smooth shoulder roll-off above C > 0.22)
    const abComp = [0, 0];
    compressOklabChroma(a1, b1, abComp);
    a1 = abComp[0];
    b1 = abComp[1];

    latL[i] = clamp(L1, 0.0, 1.0);
    latA[i] = clamp(a1, -0.32, 0.32);
    latB[i] = clamp(b1, -0.32, 0.32);
  }

  // Enforce strict monotonicity along every R, G, B axis and neutral gray diagonal
  for (let bz = 0; bz < G; bz++) {
    for (let gy = 0; gy < G; gy++) {
      for (let rx = 1; rx < G; rx++) {
        const prev = (rx - 1) + gy * G + bz * G * G;
        const cur = rx + gy * G + bz * G * G;
        if (latL[cur] < latL[prev]) {
          latL[cur] = latL[prev];
        }
      }
    }
  }

  return { G, N3, latL, latA, latB, origL, origA, origB };
}

// Fits 3rd-order cross-channel polynomial (20 coeffs/channel via 20x20 Ridge Regression)
// + 6-sector cosine Hue curves (Hue-vs-Hue/Sat/Luma) to the smoothed 17^3 OKLab lattice.
function fitPolyAndHueToLattice(lattice) {
  const { G, N3, latL, latA, latB } = lattice;
  const D = 20;
  const AtA = new Float64Array(D * D);
  const AtR = new Float64Array(D);
  const AtG = new Float64Array(D);
  const AtB = new Float64Array(D);
  const basis = new Float64Array(D);
  const rgbTarget = [0, 0, 0];

  const targetR = new Float32Array(N3);
  const targetG = new Float32Array(N3);
  const targetB = new Float32Array(N3);

  let idx = 0;
  for (let bz = 0; bz < G; bz++) {
    const b = bz / (G - 1);
    for (let gy = 0; gy < G; gy++) {
      const g = gy / (G - 1);
      for (let rx = 0; rx < G; rx++) {
        const r = rx / (G - 1);
        oklabToSrgb(latL[idx], latA[idx], latB[idx], rgbTarget);
        targetR[idx] = rgbTarget[0];
        targetG[idx] = rgbTarget[1];
        targetB[idx] = rgbTarget[2];

        const isNeutral = rx === gy && gy === bz;
        const isBlackOrWhite = (rx === 0 && gy === 0 && bz === 0) || (rx === G - 1 && gy === G - 1 && bz === G - 1);
        const w = isBlackOrWhite ? 18.0 : isNeutral ? 3.5 : 1.0;

        fillPolyBasis20(r, g, b, basis);
        for (let i = 0; i < D; i++) {
          const bi = basis[i] * w;
          AtR[i] += bi * rgbTarget[0];
          AtG[i] += bi * rgbTarget[1];
          AtB[i] += bi * rgbTarget[2];
          for (let j = i; j < D; j++) {
            AtA[i * D + j] += bi * basis[j];
          }
        }
        idx++;
      }
    }
  }

  for (let i = 0; i < D; i++) {
    for (let j = 0; j < i; j++) {
      AtA[i * D + j] = AtA[j * D + i];
    }
  }

  // Tikhonov Ridge regularization towards identity polynomial so higher-order terms stay smooth
  const ridgeLambda = 1.6;
  for (let i = 0; i < D; i++) {
    const reg = i < 4 ? ridgeLambda * 0.35 : ridgeLambda * 1.8;
    AtA[i * D + i] += reg;
    AtR[i] += reg * IDENTITY_POLY_R[i];
    AtG[i] += reg * IDENTITY_POLY_G[i];
    AtB[i] += reg * IDENTITY_POLY_B[i];
  }

  const solR = solveLinearSystem(AtA, AtR, D);
  const solG = solveLinearSystem(AtA, AtG, D);
  const solB = solveLinearSystem(AtA, AtB, D);

  const polyR = Array.from(solR, (v) => round6(clamp(v, -3.5, 3.5)));
  const polyG = Array.from(solG, (v) => round6(clamp(v, -3.5, 3.5)));
  const polyB = Array.from(solB, (v) => round6(clamp(v, -3.5, 3.5)));

  // Lock pure black (0,0,0) constant intercept near 0
  polyR[0] = round6(clamp(polyR[0], -0.02, 0.02));
  polyG[0] = round6(clamp(polyG[0], -0.02, 0.02));
  polyB[0] = round6(clamp(polyB[0], -0.02, 0.02));

  // Fit 6-sector cosine Hue curves (Hue-vs-Hue, Hue-vs-Sat, Hue-vs-Luma) on polynomial residuals
  const hueShiftAcc = new Float64Array(6);
  const hueSatAcc = new Float64Array(6);
  const hueLumaAcc = new Float64Array(6);
  const hueWeightAcc = new Float64Array(6);

  idx = 0;
  for (let bz = 0; bz < G; bz++) {
    const b = bz / (G - 1);
    for (let gy = 0; gy < G; gy++) {
      const g = gy / (G - 1);
      for (let rx = 0; rx < G; rx++) {
        const r = rx / (G - 1);
        fillPolyBasis20(r, g, b, basis);
        let pr = 0, pg = 0, pb = 0;
        for (let k = 0; k < D; k++) {
          pr += polyR[k] * basis[k];
          pg += polyG[k] * basis[k];
          pb += polyB[k] * basis[k];
        }
        pr = clamp(pr, 0, 1);
        pg = clamp(pg, 0, 1);
        pb = clamp(pb, 0, 1);

        const yP = 0.2126 * pr + 0.7152 * pg + 0.0722 * pb;
        const c1P = pr - yP;
        const c2P = pb - yP;
        const chrP = Math.sqrt(c1P * c1P + c2P * c2P);

        const tr = targetR[idx];
        const tg = targetG[idx];
        const tb = targetB[idx];
        const yT = 0.2126 * tr + 0.7152 * tg + 0.0722 * tb;
        const c1T = tr - yT;
        const c2T = tb - yT;
        const chrT = Math.sqrt(c1T * c1T + c2T * c2T);

        if (chrP > 0.04 && yP > 0.10 && yP < 0.88) {
          const hP = Math.atan2(c2P, c1P);
          const hT = Math.atan2(c2T, c1T);
          const dH = Math.atan2(Math.sin(hT - hP), Math.cos(hT - hP));
          const dS = clamp(chrT / Math.max(chrP, 1e-4) - 1.0, -0.5, 0.5);
          const dL = clamp((yT - yP) / 0.24, -0.35, 0.35);

          for (let s = 0; s < 6; s++) {
            const w = hueSectorWeight(hP, HUE_CENTERS[s]) * chrP;
            if (w > 1e-4) {
              hueShiftAcc[s] += dH * w;
              hueSatAcc[s] += dS * w;
              hueLumaAcc[s] += dL * w;
              hueWeightAcc[s] += w;
            }
          }
        }
        idx++;
      }
    }
  }

  const hueShift = new Array(6);
  const hueSat = new Array(6);
  const hueLuma = new Array(6);
  for (let s = 0; s < 6; s++) {
    const w = hueWeightAcc[s] + 0.35; // Ridge damping on sector curves
    hueShift[s] = round6(clamp((hueShiftAcc[s] / w) * 0.65, -0.28, 0.28));
    hueSat[s] = round6(clamp((hueSatAcc[s] / w) * 0.65, -0.35, 0.35));
    hueLuma[s] = round6(clamp((hueLumaAcc[s] / w) * 0.55, -0.22, 0.22));
  }

  return { polyR, polyG, polyB, hueShift, hueSat, hueLuma };
}

function analyzeEngineV3(refData, tgtData, options = {}) {
  if (!checkAllowedHost()) {
    throw new Error("Unauthorized host environment.");
  }
  const {
    numPixels = 0,
    targetNumPixels = 0,
    mediaType = "image",
    onStage,
  } = options;

  const refN = numPixels || (refData ? Math.floor(refData.length / 4) : 0);
  const tgtN = targetNumPixels || (tgtData ? Math.floor(tgtData.length / 4) : 0);

  if (onStage) onStage("Engine v3: Extracting OKLab saliency & skin guard...");
  const ref = extractSaliencyOklabSamples(refData, refN);
  if (!ref) {
    throw new Error("Failed to extract reference OKLab samples.");
  }
  const tgt =
    tgtData && tgtN > 0
      ? extractSaliencyOklabSamples(tgtData, tgtN) || createNominalTargetSamples()
      : createNominalTargetSamples();

  // Temporal Luminance Smoothing (EMA alpha = 0.2) across consecutive video frames
  if (mediaType === "video") {
    const alpha = 0.2;
    if (temporalVideoState.active) {
      tgt.p10 = temporalVideoState.p10 * (1 - alpha) + tgt.p10 * alpha;
      tgt.p25 = temporalVideoState.p25 * (1 - alpha) + tgt.p25 * alpha;
      tgt.p50 = temporalVideoState.p50 * (1 - alpha) + tgt.p50 * alpha;
      tgt.p75 = temporalVideoState.p75 * (1 - alpha) + tgt.p75 * alpha;
      tgt.p90 = temporalVideoState.p90 * (1 - alpha) + tgt.p90 * alpha;
      tgt.midA = temporalVideoState.midA * (1 - alpha) + tgt.midA * alpha;
      tgt.midB = temporalVideoState.midB * (1 - alpha) + tgt.midB * alpha;
      tgt.cMean = temporalVideoState.cMean * (1 - alpha) + tgt.cMean * alpha;
    }
    temporalVideoState.active = true;
    temporalVideoState.p10 = tgt.p10;
    temporalVideoState.p25 = tgt.p25;
    temporalVideoState.p50 = tgt.p50;
    temporalVideoState.p75 = tgt.p75;
    temporalVideoState.p90 = tgt.p90;
    temporalVideoState.midA = tgt.midA;
    temporalVideoState.midB = tgt.midB;
    temporalVideoState.cMean = tgt.cMean;
  } else {
    temporalVideoState.active = false;
  }

  // Also run v2 baseline look statistics for parametric sliders
  const v2Params = analyzeImagePixels(
    refData,
    refN,
    null,
    tgtData || null,
    tgtN,
    mediaType
  );

  // Decoupled Luma & Black-Floor Lock:
  // P10-P90 quantiles with tanh soft-knee EV cap (~35-40%).
  const spreadRef = Math.max(ref.p90 - ref.p10, 0.08);
  const spreadTgt = Math.max(tgt.p90 - tgt.p10, 0.08);
  const drRatio = spreadRef / spreadTgt;
  const isLowContrastRefToHighContrastTgt = drRatio < 0.92;

  const anchorRef = Math.max(0.16, 0.45 * ref.p25 + 0.55 * ref.p50);
  const anchorTgt = Math.max(0.16, 0.45 * tgt.p25 + 0.55 * tgt.p50);
  const rawEv = Math.log2(anchorRef / anchorTgt) * 0.58;
  // tanh soft-knee EV cap (~0.38 EV max)
  const exposure = clamp(0.38 * Math.tanh(rawEv / 0.38), -0.38, 0.36);

  // Asymmetric DR Guardrail & Opposing-Ends Lock:
  // Clamp contrast reduction >= 0.88 when matching low-contrast Reference to high-contrast Target.
  const minContrast = isLowContrastRefToHighContrastTgt ? 0.88 : 0.92;
  const contrast = clamp(
    drRatio < 1.0 ? Math.max(minContrast, 0.88 + (drRatio - 0.7) * 0.32) : clamp(drRatio * 1.04, 1.0, 1.34),
    minContrast,
    1.36
  );
  const pivot = clamp(0.46 + (ref.p50 - 0.50) * 0.25, 0.38, 0.56);

  // Lock Blacks at neutral (shadows >= -0.10, never crush or lift aggressively)
  // Opposing-Ends Lock: forbid Shadows (Blacks) and Highlights (Whites) from collapsing inward simultaneously
  let shadows = 0.0;
  let highlights = clamp(v2Params.highlights * 0.65, -0.26, 0.16);
  if (shadows > 0.0 && highlights < 0.0) {
    // Opposing-ends inward collapse forbidden: keep blacks locked at 0.0
    shadows = 0.0;
    highlights = Math.max(highlights, -0.14);
  }

  // Soft-knee chroma compression (min scale >= 0.68) to prevent gray-soup washout
  const chromaRatio = tgt.hasTarget
    ? 0.72 * (ref.cMean / 0.062) + 0.28 * (ref.cMean / Math.max(tgt.cMean, 0.015))
    : ref.cMean / 0.062;
  const softChroma = chromaRatio < 1.0
    ? Math.max(0.68, 1.0 - 0.32 * Math.tanh((1.0 - chromaRatio) * 1.4))
    : Math.min(1.28, 1.0 + 0.28 * Math.tanh((chromaRatio - 1.0) * 1.1));
  const sat = clamp(softChroma, isLowContrastRefToHighContrastTgt ? 0.90 : 0.86, 1.28);
  const vib = clamp(v2Params.vib * 0.75, -0.18, 0.36);

  // Lock luma component of Lift at neutral (zero mean across R/G/B lift offsets)
  const rawLiftR = v2Params.liftR - 0.5;
  const rawLiftG = v2Params.liftG - 0.5;
  const rawLiftB = v2Params.liftB - 0.5;
  const liftLuma = 0.2126 * rawLiftR + 0.7152 * rawLiftG + 0.0722 * rawLiftB;
  const liftR = clamp(0.5 + (rawLiftR - liftLuma) * 0.65, 0.42, 0.58);
  const liftG = clamp(0.5 + (rawLiftG - liftLuma) * 0.65, 0.42, 0.58);
  const liftB = clamp(0.5 + (rawLiftB - liftLuma) * 0.65, 0.42, 0.58);

  // Highlight Neutrality Guard on Gain wheel
  const hiGuardScale = ref.p90 > 0.72 ? 0.55 : 0.75;
  const gainR = clamp(0.5 + (v2Params.gainR - 0.5) * hiGuardScale, 0.40, 0.60);
  const gainG = clamp(0.5 + (v2Params.gainG - 0.5) * hiGuardScale, 0.40, 0.60);
  const gainB = clamp(0.5 + (v2Params.gainB - 0.5) * hiGuardScale, 0.40, 0.60);

  if (onStage) onStage("Engine v3: Solving 17^3 OKLab Optimal Transport & Poly-3...");
  const lattice = buildSmoothedOklabLattice(ref, tgt, isLowContrastRefToHighContrastTgt);
  const { polyR, polyG, polyB, hueShift, hueSat, hueLuma } = fitPolyAndHueToLattice(lattice);

  // 1 Closed-Loop Residual Correction Pass:
  // Simulate the combined Hybrid + Parametric grade on the target sample cloud and refine WB/Exposure/Gamma residuals.
  let candParams = {
    ...DEFAULT_PARAMS,
    gradeMix: 1.0,
    autoGradeMix: 1.0,
    exposure: round2(exposure * 0.68),
    contrast: round2(1.0 + (contrast - 1.0) * 0.65),
    pivot: round2(pivot),
    shadows: round2(shadows),
    highlights: round2(highlights),
    temp: round2(v2Params.temp * 0.65),
    tint: round2(v2Params.tint * 0.65),
    sat: round2(sat),
    vib: round2(vib),
    liftR: round2(liftR),
    liftG: round2(liftG),
    liftB: round2(liftB),
    gammaR: round2(0.5 + (v2Params.gammaR - 0.5) * 0.72),
    gammaG: round2(0.5 + (v2Params.gammaG - 0.5) * 0.72),
    gammaB: round2(0.5 + (v2Params.gammaB - 0.5) * 0.72),
    gainR: round2(gainR),
    gainG: round2(gainG),
    gainB: round2(gainB),
    polyR,
    polyG,
    polyB,
    hueShift,
    hueSat,
    hueLuma,
  };

  const Gprep = prepareGrade(candParams);
  const rgbIn = [0, 0, 0];
  const rgbOut = [0, 0, 0];
  const labOut = [0, 0, 0];
  let simMidL = 0, simMidA = 0, simMidB = 0, simMidW = 0;

  const stepSim = Math.max(1, Math.floor(tgt.N / 512));
  for (let i = 0; i < tgt.N; i += stepSim) {
    oklabToSrgb(tgt.L[i], tgt.A[i], tgt.B[i], rgbIn);
    gradeRGB(Gprep, rgbIn[0], rgbIn[1], rgbIn[2], rgbOut);
    const lr = rgbOut[0] <= 0.04045 ? rgbOut[0] / 12.92 : Math.pow((rgbOut[0] + 0.055) / 1.055, 2.4);
    const lg = rgbOut[1] <= 0.04045 ? rgbOut[1] / 12.92 : Math.pow((rgbOut[1] + 0.055) / 1.055, 2.4);
    const lb = rgbOut[2] <= 0.04045 ? rgbOut[2] / 12.92 : Math.pow((rgbOut[2] + 0.055) / 1.055, 2.4);
    rgbLinearToOklab(lr, lg, lb, labOut);
    if (labOut[0] >= 0.22 && labOut[0] <= 0.75) {
      const w = tgt.W[i];
      simMidL += labOut[0] * w;
      simMidA += labOut[1] * w;
      simMidB += labOut[2] * w;
      simMidW += w;
    }
  }

  if (simMidW > 1e-5) {
    const meanSimL = simMidL / simMidW;
    const meanSimA = simMidA / simMidW;
    const meanSimB = simMidB / simMidW;
    const targetMidA = tgt.hasTarget ? 0.75 * ref.midA + 0.25 * (ref.midA - tgt.midA) : ref.midA;
    const targetMidB = tgt.hasTarget ? 0.75 * ref.midB + 0.25 * (ref.midB - tgt.midB) : ref.midB;

    const resL = clamp(ref.p50 - meanSimL, -0.08, 0.08);
    const resA = clamp(targetMidA - meanSimA, -0.04, 0.04);
    const resB = clamp(targetMidB - meanSimB, -0.04, 0.04);

    candParams.exposure = round2(clamp(candParams.exposure + resL * 0.45, -0.38, 0.36));
    candParams.temp = round2(clamp(candParams.temp + (resB * 1.8 + resA * 0.6) * 0.45, -0.9, 0.9));
    candParams.tint = round2(clamp(candParams.tint + resA * 1.6 * 0.45, -0.9, 0.9));
  }

  if (mediaType === "video") {
    const alpha = 0.2;
    if (Number.isFinite(temporalVideoState.exposure)) {
      candParams.exposure = round2(temporalVideoState.exposure * (1 - alpha) + candParams.exposure * alpha);
      candParams.contrast = round2(temporalVideoState.contrast * (1 - alpha) + candParams.contrast * alpha);
    }
    temporalVideoState.exposure = candParams.exposure;
    temporalVideoState.contrast = candParams.contrast;
  }

  return sanitizeParams(candParams);
}

function prepareTargetForAnalysis(tgtData, targetNumPixels, options = {}) {
  const tgtN = targetNumPixels || (tgtData ? Math.floor(tgtData.length / 4) : 0);
  if (!tgtData || tgtN < 1) {
    return { data: null, numPixels: 0, normStats: null };
  }
  let working = tgtData;
  if (isLogProfileActive(options.inputProfile)) {
    working = applyLogProfileToRgba(working, tgtN, options.inputProfile);
  }
  if (options.autoNormalizeTarget) {
    const norm = autoNormalizeTargetPixels(working, tgtN);
    return { data: norm.data, numPixels: norm.numPixels, normStats: norm.normStats };
  }
  return { data: working, numPixels: tgtN, normStats: null };
}

export const ENGINE_REGISTRY = {
  v1: {
    id: "v1",
    name: "Vega",
    codename: "altair",
    versionBadge: "1.0",
    badge: "1.0",
    subtitle: "Fast Matrix Engine",
    shortTag: "Fast Matrix",
    shortcutKey: "1",
    bestFor: "Fast shot matching & simple color tweaks",
    summary:
      "Fast global color matrix & linear balance. Ideal when both clips were shot in similar lighting.",
    pipelineBadges: ["Fast Speed", "Punchy Contrast", "Simple Match"],
    description:
      "Fast global color matrix & linear balance. Ideal when both clips were shot in similar lighting.",
    analyze(refData, tgtData, options = {}) {
      const prep = prepareTargetForAnalysis(tgtData, options.targetNumPixels, options);
      const out = analyzeEngineV1(refData, prep.data, {
        ...options,
        targetNumPixels: prep.numPixels,
      });
      return prep.normStats ? sanitizeParams(applyTargetAutoNormalizeOffsets(out, prep.normStats)) : out;
    },
  },
  v2: {
    id: "v2",
    name: "Sirius",
    codename: "vega",
    versionBadge: "2.5",
    badge: "2.5",
    subtitle: "Tonal Engine",
    shortTag: "Tonal",
    shortcutKey: "2",
    bestFor: "Clean everyday grades & natural lighting",
    summary:
      "Multi-zone tonal & contrast matching while keeping whites clean and highlights soft.",
    pipelineBadges: ["Clean Whites", "Soft Highlights", "Natural Tone"],
    description:
      "Multi-zone tonal & contrast matching while keeping whites clean and highlights soft.",
    analyze(refData, tgtData, options = {}) {
      const {
        numPixels = 0,
        targetNumPixels = 0,
        mediaType = "image",
        onStage,
      } = options;
      const refPixels = numPixels || (refData ? Math.floor(refData.length / 4) : 0);
      const prep = prepareTargetForAnalysis(tgtData, targetNumPixels, options);
      const v2Out = analyzeImagePixels(
        refData,
        refPixels,
        onStage,
        prep.data,
        prep.numPixels,
        mediaType
      );
      const merged = { ...v2Out, autoGradeMix: 0.0 };
      return sanitizeParams(
        prep.normStats ? applyTargetAutoNormalizeOffsets(merged, prep.normStats) : merged
      );
    },
  },
  v3: {
    id: "v3",
    name: "Polaris",
    codename: "polaris",
    versionBadge: "3.5 Pro",
    badge: "3.5 Pro",
    subtitle: "Perceptual Optical Engine",
    shortTag: "Perceptual",
    shortcutKey: "3",
    bestFor: "Cinematic looks, skin tones & tricky lighting",
    summary:
      "Deep perceptual spectral & LUT matching while protecting skin tones, deep blacks, and bright skies.",
    pipelineBadges: ["Skin-Safe", "Deep Blacks", "Film Color", "Gamut Safe"],
    description:
      "Deep perceptual spectral & LUT matching while protecting skin tones, deep blacks, and bright skies.",
    analyze(refData, tgtData, options = {}) {
      const prep = prepareTargetForAnalysis(tgtData, options.targetNumPixels, options);
      const out = analyzeEngineV3(refData, prep.data, {
        ...options,
        targetNumPixels: prep.numPixels,
      });
      return prep.normStats ? sanitizeParams(applyTargetAutoNormalizeOffsets(out, prep.normStats)) : out;
    },
  },
};

export function getEngine(engineId = DEFAULT_ENGINE_ID) {
  return ENGINE_REGISTRY[engineId] || ENGINE_REGISTRY[DEFAULT_ENGINE_ID];
}

export function listEngines() {
  return [ENGINE_REGISTRY.v1, ENGINE_REGISTRY.v2, ENGINE_REGISTRY.v3];
}
