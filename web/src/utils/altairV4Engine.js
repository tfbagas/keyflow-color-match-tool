// Altair 4.0 ULTRA — Flagship Scene-Linear Pro Color Matching Engine
//
// Deterministic 5-stage color-science pipeline:
//   1. Scene-Linear (Rec.709) + Perceptual OKLab Dual-Space Analysis
//      (luminance-weighted sampling ignoring pure black/white clipping extremes)
//   2. Iterative 3D OKLab Covariance & Eigen-Aligned Cholesky/MKL Distribution Transfer
//   3. Multi-Zone Tonal Curve (5 control zones: Blacks, Shadows, Midtones,
//      Highlights, Whites) with Fritsch-Carlson Monotone Cubic Hermite Spline
//      + Scene-Linear Filmic Soft-Shoulder Roll-Off (> 0.80 linear luminance)
//   4. Perceptual Skin-Tone Cluster Lock (OKLab hue in [25°, 65°], moderate chroma,
//      adaptive skinProtect weight) + Neutral-Axis Black/White Anchor
//   5. Deterministic Parameter Decomposition (Primary Sliders + 3-Way Color Wheels +
//      Zero-Intercept Cubic 3D Poly + 6-Sector HSL Residuals + Closed-Loop Trim)
//      for 1:1 parity across WebGL preview, .cube LUT, After Effects .ffx, and .kfplug.

import {
  DEFAULT_PARAMS,
  IDENTITY_POLY_R,
  IDENTITY_POLY_G,
  IDENTITY_POLY_B,
  IDENTITY_HUE6,
  clamp,
  prepareGrade,
  gradeRGB,
  evaluateGradeRGB,
  sanitizeParams,
} from "./gradeEngine.js";
import {
  FILMIC_SHOULDER_KNEE,
  FILMIC_SHOULDER_ROOM,
  srgbToLinearChannel,
  linearToSrgbChannel,
  rgbLinearToOklab,
  oklabToLinearRgb,
  compressOklabChroma,
  strideSampleRgba,
  autoNormalizeTargetPixels,
  applyTargetAutoNormalizeOffsets,
} from "./colorMatcher.js";
import { applyLogProfileToRgba, isLogProfileActive } from "./logProfiles.js";

const LATTICE_SIZE = 17;
const LATTICE_COUNT = LATTICE_SIZE * LATTICE_SIZE * LATTICE_SIZE; // 4913
const MAX_SAMPLES = 3072;
const DEG_TO_RAD = Math.PI / 180.0;
const RAD_TO_DEG = 180.0 / Math.PI;

const HUE_CENTERS = [
  0.0,
  1.04719755,
  2.0943951,
  3.14159265,
  -2.0943951,
  -1.04719755,
];

// 5-Zone Tonal Control Knots in perceptual OKLab L [0..1]:
//   0.000 (Black floor anchor)
//   0.075 (Blacks:     0% - 15%)
//   0.250 (Shadows:   15% - 35%)
//   0.500 (Midtones:  35% - 65%)
//   0.750 (Highlights:65% - 85%)
//   0.925 (Whites:    85% - 100%)
//   1.000 (White ceiling anchor)
const TONE_ZONE_KNOTS = Object.freeze([0.0, 0.075, 0.25, 0.5, 0.75, 0.925, 1.0]);

function smoothstep(edge0, edge1, x) {
  const t = clamp((x - edge0) / Math.max(edge1 - edge0, 1e-5), 0.0, 1.0);
  return t * t * (3.0 - 2.0 * t);
}

function round2(v) {
  const r = Math.round(v * 100) / 100;
  return r === 0 ? 0 : r;
}

function fastTanh(x) {
  const cx = clamp(x, -8.0, 8.0);
  const e2x = Math.exp(2.0 * cx);
  return (e2x - 1.0) / Math.max(e2x + 1.0, 1e-5);
}

function wrapAngleRad(a) {
  return Math.atan2(Math.sin(a), Math.cos(a));
}

function srgbToOklab(r, g, b, out) {
  const lr = srgbToLinearChannel(r);
  const lg = srgbToLinearChannel(g);
  const lb = srgbToLinearChannel(b);
  rgbLinearToOklab(lr, lg, lb, out);
}

function oklabToSrgb(L, a, b, out) {
  const lin = [0, 0, 0];
  oklabToLinearRgb(L, a, b, lin);
  out[0] = linearToSrgbChannel(lin[0]);
  out[1] = linearToSrgbChannel(lin[1]);
  out[2] = linearToSrgbChannel(lin[2]);
}

// ---------------------------------------------------------------------------
// Perceptual Skin-Tone Cluster Detection in OKLab (hue in [25°, 65°], moderate C)
// ---------------------------------------------------------------------------
export function computeSkinClusterMask(L, a, b) {
  const C = Math.hypot(a, b);
  if (C < 0.015 || C > 0.175 || L < 0.16 || L > 0.95) return 0.0;
  let hueDeg = Math.atan2(b, a) * RAD_TO_DEG;
  if (hueDeg < 0.0) hueDeg += 360.0;

  // Smooth plateau across [25°, 65°] with 10° feathering on both sides
  const hueUp = smoothstep(15.0, 25.0, hueDeg);
  const hueDown = 1.0 - smoothstep(65.0, 75.0, hueDeg);
  const hueBand = hueUp * hueDown;
  if (hueBand <= 1e-5) return 0.0;

  // Moderate skin chroma band (excludes neutral greys and neon oranges)
  const chromaBand =
    smoothstep(0.015, 0.032, C) * (1.0 - smoothstep(0.115, 0.168, C));
  // Plausible human skin lightness range
  const lumaBand =
    smoothstep(0.16, 0.27, L) * (1.0 - smoothstep(0.85, 0.95, L));
  return clamp(hueBand * chromaBand * lumaBand, 0.0, 1.0);
}

// ---------------------------------------------------------------------------
// Stage 1: Scene-Linear + OKLab Dual-Space Sampling & Statistics
// ---------------------------------------------------------------------------
function extractDualSpaceSamples(rgbaView, totalPixels, maxSamples = MAX_SAMPLES) {
  const step = Math.max(1, Math.floor(totalPixels / maxSamples));
  const rArr = [];
  const gArr = [];
  const bArr = [];
  const linYArr = [];
  const LArr = [];
  const aArr = [];
  const bLabArr = [];
  const covWArr = [];
  const wbWArr = [];
  const skinWArr = [];
  const lab = [0, 0, 0];

  for (let i = 0; i < totalPixels; i += step) {
    const idx = i * 4;
    if (rgbaView[idx + 3] < 16) continue;
    const r = rgbaView[idx] / 255.0;
    const g = rgbaView[idx + 1] / 255.0;
    const b = rgbaView[idx + 2] / 255.0;

    const lr = srgbToLinearChannel(r);
    const lg = srgbToLinearChannel(g);
    const lb = srgbToLinearChannel(b);
    const linY = 0.2126 * lr + 0.7152 * lg + 0.0722 * lb;

    rgbLinearToOklab(lr, lg, lb, lab);
    const L = lab[0];
    const a = lab[1];
    const bLab = lab[2];
    const C = Math.hypot(a, bLab);

    // Luminance-weighted sampling ignoring pure black / pure white clipping extremes
    const clipGuard =
      smoothstep(0.008, 0.045, linY) * (1.0 - smoothstep(0.92, 0.992, linY));
    const chromaDamp = 1.0 / (1.0 + 4.5 * C * C);
    const covW = Math.max(clipGuard * (0.40 + 0.60 * chromaDamp), 1e-5);

    const wbMid =
      smoothstep(0.05, 0.16, linY) * (1.0 - smoothstep(0.65, 0.90, linY));
    const wbW = Math.max((1.0 / (1.0 + 18.0 * C * C)) * (0.12 + 0.88 * wbMid), 1e-5);

    const skinMask = computeSkinClusterMask(L, a, bLab);

    rArr.push(r);
    gArr.push(g);
    bArr.push(b);
    linYArr.push(linY);
    LArr.push(L);
    aArr.push(a);
    bLabArr.push(bLab);
    covWArr.push(covW);
    wbWArr.push(wbW);
    skinWArr.push(skinMask);
  }

  return {
    count: rArr.length,
    r: Float32Array.from(rArr),
    g: Float32Array.from(gArr),
    b: Float32Array.from(bArr),
    linY: Float32Array.from(linYArr),
    L: Float32Array.from(LArr),
    a: Float32Array.from(aArr),
    bLab: Float32Array.from(bLabArr),
    covW: Float32Array.from(covWArr),
    wbW: Float32Array.from(wbWArr),
    skinW: Float32Array.from(skinWArr),
  };
}

// Balanced Rec.709 synthetic neutral population for Reference-only analysis
// (when no Target image is loaded). Deterministic with zero randomness.
function buildNominalNeutralSamples() {
  const rArr = [];
  const gArr = [];
  const bArr = [];
  const linYArr = [];
  const LArr = [];
  const aArr = [];
  const bLabArr = [];
  const covWArr = [];
  const wbWArr = [];
  const skinWArr = [];
  const lab = [0, 0, 0];

  const pushTriplet = (r, g, b, weightMult = 1.0) => {
    const lr = srgbToLinearChannel(r);
    const lg = srgbToLinearChannel(g);
    const lb = srgbToLinearChannel(b);
    const linY = 0.2126 * lr + 0.7152 * lg + 0.0722 * lb;
    rgbLinearToOklab(lr, lg, lb, lab);
    const L = lab[0];
    const a = lab[1];
    const bLab = lab[2];
    const C = Math.hypot(a, bLab);
    const clipGuard =
      smoothstep(0.008, 0.045, linY) * (1.0 - smoothstep(0.92, 0.992, linY));
    const chromaDamp = 1.0 / (1.0 + 4.5 * C * C);
    const covW = Math.max(clipGuard * (0.40 + 0.60 * chromaDamp) * weightMult, 1e-5);
    const wbMid =
      smoothstep(0.05, 0.16, linY) * (1.0 - smoothstep(0.65, 0.90, linY));
    const wbW = Math.max((1.0 / (1.0 + 18.0 * C * C)) * (0.12 + 0.88 * wbMid) * weightMult, 1e-5);

    rArr.push(r);
    gArr.push(g);
    bArr.push(b);
    linYArr.push(linY);
    LArr.push(L);
    aArr.push(a);
    bLabArr.push(bLab);
    covWArr.push(covW);
    wbWArr.push(wbW);
    skinWArr.push(computeSkinClusterMask(L, a, bLab));
  };

  // Balanced 9^3 perceptual cube centered around photographic mid-chroma
  const N = 9;
  for (let ib = 0; ib < N; ib++) {
    const b = ib / (N - 1);
    for (let ig = 0; ig < N; ig++) {
      const g = ig / (N - 1);
      for (let ir = 0; ir < N; ir++) {
        const r = ir / (N - 1);
        const y = 0.2126 * r + 0.7152 * g + 0.0722 * b;
        // Blend 55% toward neutral to emulate realistic photographic chroma variance
        const pr = y + (r - y) * 0.55;
        const pg = y + (g - y) * 0.55;
        const pb = y + (b - y) * 0.55;
        pushTriplet(pr, pg, pb, 1.0);
      }
    }
  }
  // Neutral photographic ramp
  for (let i = 1; i <= 63; i++) {
    const v = i / 64.0;
    pushTriplet(v, v, v, 2.2);
  }

  return {
    count: rArr.length,
    r: Float32Array.from(rArr),
    g: Float32Array.from(gArr),
    b: Float32Array.from(bArr),
    linY: Float32Array.from(linYArr),
    L: Float32Array.from(LArr),
    a: Float32Array.from(aArr),
    bLab: Float32Array.from(bLabArr),
    covW: Float32Array.from(covWArr),
    wbW: Float32Array.from(wbWArr),
    skinW: Float32Array.from(skinWArr),
  };
}

function computeWeightedQuantiles(values, weights, probs) {
  const n = values.length;
  const out = new Float64Array(probs.length);
  if (n === 0) {
    for (let k = 0; k < probs.length; k++) out[k] = probs[k];
    return out;
  }
  const idx = new Int32Array(n);
  for (let i = 0; i < n; i++) idx[i] = i;
  idx.sort((i, j) => values[i] - values[j]);

  let totalW = 0.0;
  for (let i = 0; i < n; i++) totalW += Math.max(weights[idx[i]], 1e-6);

  let acc = 0.0;
  let ptr = 0;
  for (let k = 0; k < probs.length; k++) {
    const target = clamp(probs[k], 0.0, 1.0) * totalW;
    while (ptr < n - 1 && acc + Math.max(weights[idx[ptr]], 1e-6) < target) {
      acc += Math.max(weights[idx[ptr]], 1e-6);
      ptr++;
    }
    out[k] = values[idx[ptr]];
  }
  return out;
}

function computeDualSpaceStats(samples) {
  const n = samples.count;
  if (n < 8) {
    return {
      meanLogY: -2.0,
      stdLogY: 1.25,
      meanL: 0.52,
      stdL: 0.20,
      meanA: 0.0,
      meanB: 0.0,
      meanChroma: 0.055,
      lowChromaRatio: 0.5,
      shadowEnergy: 0.07,
      highEnergy: 0.68,
      zoneQuantilesL: Float64Array.from([0.075, 0.25, 0.5, 0.75, 0.925]),
      shadowAB: [0.0, 0.0],
      midAB: [0.0, 0.0],
      highAB: [0.0, 0.0],
      skinRatio: 0.0,
    };
  }

  let sumW = 0.0;
  let sumLogY = 0.0;
  let sumL = 0.0;
  let sumChroma = 0.0;
  let sumLowChroma = 0.0;
  let sumWbW = 0.0;
  let sumA = 0.0;
  let sumB = 0.0;
  let shY = 0.0, shW = 0.0;
  let hiY = 0.0, hiW = 0.0;
  let shA = 0.0, shB = 0.0, shCW = 0.0;
  let mdA = 0.0, mdB = 0.0, mdCW = 0.0;
  let hiA = 0.0, hiB = 0.0, hiCW = 0.0;
  let skinSum = 0.0;

  for (let i = 0; i < n; i++) {
    const w = samples.covW[i];
    const wbW = samples.wbW[i];
    const linY = samples.linY[i];
    const L = samples.L[i];
    const a = samples.a[i];
    const b = samples.bLab[i];
    const C = Math.hypot(a, b);
    const logY = Math.log2(Math.max(linY, 0.004));

    sumW += w;
    sumLogY += w * logY;
    sumL += w * L;
    sumChroma += w * C;
    if (C < 0.075) sumLowChroma += w;

    sumWbW += wbW;
    sumA += wbW * a;
    sumB += wbW * b;

    if (linY < 0.18) {
      shY += w * linY;
      shW += w;
    } else if (linY > 0.50) {
      hiY += w * linY;
      hiW += w;
    }

    // 3-zone chromaticity (for lift / gamma / gain decomposition)
    const wSh = smoothstep(0.06, 0.14, L) * (1.0 - smoothstep(0.28, 0.42, L)) * w;
    const wMd = smoothstep(0.26, 0.42, L) * (1.0 - smoothstep(0.62, 0.76, L)) * w;
    const wHi = smoothstep(0.58, 0.72, L) * (1.0 - smoothstep(0.88, 0.96, L)) * w;
    shA += wSh * a; shB += wSh * b; shCW += wSh;
    mdA += wMd * a; mdB += wMd * b; mdCW += wMd;
    hiA += wHi * a; hiB += wHi * b; hiCW += wHi;

    skinSum += samples.skinW[i];
  }

  const invW = 1.0 / Math.max(sumW, 1e-6);
  const meanLogY = sumLogY * invW;
  const meanL = sumL * invW;
  const meanChroma = sumChroma * invW;
  const lowChromaRatio = sumLowChroma * invW;
  const meanA = sumA / Math.max(sumWbW, 1e-6);
  const meanB = sumB / Math.max(sumWbW, 1e-6);

  let varLogY = 0.0;
  let varL = 0.0;
  for (let i = 0; i < n; i++) {
    const w = samples.covW[i];
    const dLog = Math.log2(Math.max(samples.linY[i], 0.004)) - meanLogY;
    const dL = samples.L[i] - meanL;
    varLogY += w * dLog * dLog;
    varL += w * dL * dL;
  }

  const zoneQuantilesL = computeWeightedQuantiles(
    samples.L,
    samples.covW,
    [0.075, 0.25, 0.5, 0.75, 0.925]
  );

  return {
    meanLogY,
    stdLogY: Math.sqrt(varLogY * invW),
    meanL,
    stdL: Math.sqrt(varL * invW),
    meanA,
    meanB,
    meanChroma,
    lowChromaRatio,
    shadowEnergy: shW > 1e-4 ? shY / shW : 0.07,
    highEnergy: hiW > 1e-4 ? hiY / hiW : 0.68,
    zoneQuantilesL,
    shadowAB: shCW > 1e-4 ? [shA / shCW, shB / shCW] : [0.0, 0.0],
    midAB: mdCW > 1e-4 ? [mdA / mdCW, mdB / mdCW] : [0.0, 0.0],
    highAB: hiCW > 1e-4 ? [hiA / hiCW, hiB / hiCW] : [0.0, 0.0],
    skinRatio: skinSum / Math.max(n, 1),
  };
}

// ---------------------------------------------------------------------------
// Stage 2: Exact 3x3 OKLab Covariance, Cholesky, & Eigen-Aligned MKL Transfer
// ---------------------------------------------------------------------------
export function computeOklabCovariance3x3(LArr, aArr, bArr, wArr) {
  const n = LArr.length;
  const mean = [0.5, 0.0, 0.0];
  const cov = new Float64Array([
    0.04, 0.0, 0.0,
    0.0, 0.0025, 0.0,
    0.0, 0.0, 0.0025,
  ]);
  if (n < 4) return { mean, cov };

  let sumW = 0.0;
  let m0 = 0.0, m1 = 0.0, m2 = 0.0;
  for (let i = 0; i < n; i++) {
    const w = wArr[i];
    sumW += w;
    m0 += w * LArr[i];
    m1 += w * aArr[i];
    m2 += w * bArr[i];
  }
  if (sumW <= 1e-6) return { mean, cov };
  m0 /= sumW;
  m1 /= sumW;
  m2 /= sumW;
  mean[0] = m0;
  mean[1] = m1;
  mean[2] = m2;

  let c00 = 0.0, c01 = 0.0, c02 = 0.0;
  let c11 = 0.0, c12 = 0.0, c22 = 0.0;
  for (let i = 0; i < n; i++) {
    const w = wArr[i];
    const d0 = LArr[i] - m0;
    const d1 = aArr[i] - m1;
    const d2 = bArr[i] - m2;
    c00 += w * d0 * d0;
    c01 += w * d0 * d1;
    c02 += w * d0 * d2;
    c11 += w * d1 * d1;
    c12 += w * d1 * d2;
    c22 += w * d2 * d2;
  }

  const invW = 1.0 / sumW;
  // Tikhonov diagonal floor ensures strict positive-definiteness on flat/monochrome inputs
  cov[0] = c00 * invW + 1.5e-3;
  cov[1] = c01 * invW;
  cov[2] = c02 * invW;
  cov[3] = cov[1];
  cov[4] = c11 * invW + 4.0e-4;
  cov[5] = c12 * invW;
  cov[6] = cov[2];
  cov[7] = cov[5];
  cov[8] = c22 * invW + 4.0e-4;

  return { mean, cov };
}

export function cholesky3x3(S) {
  const l00 = Math.sqrt(Math.max(S[0], 1e-7));
  const l10 = S[3] / l00;
  const l20 = S[6] / l00;
  const l11 = Math.sqrt(Math.max(S[4] - l10 * l10, 1e-7));
  const l21 = (S[7] - l20 * l10) / l11;
  const l22 = Math.sqrt(Math.max(S[8] - l20 * l20 - l21 * l21, 1e-7));
  return new Float64Array([
    l00, 0.0, 0.0,
    l10, l11, 0.0,
    l20, l21, l22,
  ]);
}

function invertLower3x3(L) {
  const i00 = 1.0 / Math.max(L[0], 1e-7);
  const i11 = 1.0 / Math.max(L[4], 1e-7);
  const i22 = 1.0 / Math.max(L[8], 1e-7);
  const i10 = -L[3] * i00 * i11;
  const i20 = (L[3] * L[7] - L[4] * L[6]) * i00 * i11 * i22;
  const i21 = -L[7] * i11 * i22;
  return new Float64Array([
    i00, 0.0, 0.0,
    i10, i11, 0.0,
    i20, i21, i22,
  ]);
}

function matMul3x3(A, B) {
  const C = new Float64Array(9);
  for (let r = 0; r < 3; r++) {
    for (let c = 0; c < 3; c++) {
      C[r * 3 + c] =
        A[r * 3] * B[c] +
        A[r * 3 + 1] * B[3 + c] +
        A[r * 3 + 2] * B[6 + c];
    }
  }
  return C;
}

// Deterministic symmetric 3x3 Jacobi eigendecomposition: S = V * diag(evals) * V^T
function jacobiEigen3x3(S) {
  const A = Float64Array.from(S);
  const V = new Float64Array([
    1.0, 0.0, 0.0,
    0.0, 1.0, 0.0,
    0.0, 0.0, 1.0,
  ]);
  const pairs = [
    [0, 1],
    [0, 2],
    [1, 2],
  ];

  for (let sweep = 0; sweep < 18; sweep++) {
    let maxOff = 0.0;
    for (let k = 0; k < 3; k++) {
      const p = pairs[k][0];
      const q = pairs[k][1];
      const apq = A[p * 3 + q];
      if (Math.abs(apq) > maxOff) maxOff = Math.abs(apq);
      if (Math.abs(apq) < 1e-12) continue;

      const app = A[p * 3 + p];
      const aqq = A[q * 3 + q];
      const tau = (aqq - app) / (2.0 * apq);
      const t =
        tau >= 0.0
          ? 1.0 / (tau + Math.sqrt(1.0 + tau * tau))
          : -1.0 / (-tau + Math.sqrt(1.0 + tau * tau));
      const cs = 1.0 / Math.sqrt(1.0 + t * t);
      const sn = t * cs;

      A[p * 3 + p] = app - t * apq;
      A[q * 3 + q] = aqq + t * apq;
      A[p * 3 + q] = 0.0;
      A[q * 3 + p] = 0.0;

      for (let r = 0; r < 3; r++) {
        if (r !== p && r !== q) {
          const arp = A[r * 3 + p];
          const arq = A[r * 3 + q];
          A[r * 3 + p] = cs * arp - sn * arq;
          A[p * 3 + r] = A[r * 3 + p];
          A[r * 3 + q] = sn * arp + cs * arq;
          A[q * 3 + r] = A[r * 3 + q];
        }
        const vrp = V[r * 3 + p];
        const vrq = V[r * 3 + q];
        V[r * 3 + p] = cs * vrp - sn * vrq;
        V[r * 3 + q] = sn * vrp + cs * vrq;
      }
    }
    if (maxOff < 1e-11) break;
  }

  return {
    evals: [
      Math.max(A[0], 1e-7),
      Math.max(A[4], 1e-7),
      Math.max(A[8], 1e-7),
    ],
    V,
  };
}

function symPower3x3(S, power) {
  const { evals, V } = jacobiEigen3x3(S);
  const d = [
    Math.pow(evals[0], power),
    Math.pow(evals[1], power),
    Math.pow(evals[2], power),
  ];
  const out = new Float64Array(9);
  for (let r = 0; r < 3; r++) {
    for (let c = 0; c < 3; c++) {
      out[r * 3 + c] =
        V[r * 3] * d[0] * V[c * 3] +
        V[r * 3 + 1] * d[1] * V[c * 3 + 1] +
        V[r * 3 + 2] * d[2] * V[c * 3 + 2];
    }
  }
  return out;
}

// Computes a spectrally-bounded 3x3 OKLab covariance transfer matrix blending
// Monge-Kantorovich (eigen-aligned optimal Gaussian transport) with Cholesky
// lower-triangular L->(a,b) transfer for clean cross-channel film split toning.
function computeEigenAlignedTransfer3x3(covSrc, covRef) {
  const Ls = cholesky3x3(covSrc);
  const Lr = cholesky3x3(covRef);
  const Tchol = matMul3x3(Lr, invertLower3x3(Ls));

  const Ssqrt = symPower3x3(covSrc, 0.5);
  const SinvSqrt = symPower3x3(covSrc, -0.5);
  const Kraw = matMul3x3(matMul3x3(Ssqrt, covRef), Ssqrt);
  // Enforce exact symmetry before eigendecomposition
  const Ksym = new Float64Array([
    Kraw[0], 0.5 * (Kraw[1] + Kraw[3]), 0.5 * (Kraw[2] + Kraw[6]),
    0.5 * (Kraw[1] + Kraw[3]), Kraw[4], 0.5 * (Kraw[5] + Kraw[7]),
    0.5 * (Kraw[2] + Kraw[6]), 0.5 * (Kraw[5] + Kraw[7]), Kraw[8],
  ]);
  const Ksqrt = symPower3x3(Ksym, 0.5);
  const Tmkl = matMul3x3(matMul3x3(SinvSqrt, Ksqrt), SinvSqrt);

  // Blend eigen-aligned MKL (0.60) + Cholesky L->chroma (0.40) and clamp bounds
  const T = new Float64Array(9);
  for (let i = 0; i < 9; i++) {
    const v = 0.60 * Tmkl[i] + 0.40 * Tchol[i];
    T[i] = Number.isFinite(v) ? v : i % 4 === 0 ? 1.0 : 0.0;
  }

  T[0] = clamp(T[0], 0.72, 1.42);  // L -> L
  T[1] = clamp(T[1], -0.16, 0.16); // a -> L (tightly bounded to avoid chroma-to-luma bleed)
  T[2] = clamp(T[2], -0.16, 0.16); // b -> L
  T[3] = clamp(T[3], -0.36, 0.36); // L -> a (cross-zone split toning)
  T[4] = clamp(T[4], 0.58, 1.62);  // a -> a
  T[5] = clamp(T[5], -0.40, 0.40); // b -> a
  T[6] = clamp(T[6], -0.36, 0.36); // L -> b (cross-zone teal/amber transfer)
  T[7] = clamp(T[7], -0.40, 0.40); // a -> b
  T[8] = clamp(T[8], 0.58, 1.62);  // b -> b

  return T;
}

// ---------------------------------------------------------------------------
// Stage 3: 5-Zone Tonal Curve (Fritsch-Carlson Monotone Cubic Hermite Spline)
// ---------------------------------------------------------------------------
export function buildMonotoneHermite5Zone(srcQuantilesL, refQuantilesL, blend = 0.62) {
  const xs = TONE_ZONE_KNOTS;
  const n = xs.length; // 7 knots
  const ys = new Float64Array(n);

  // Per-zone delta bounds: [Blacks, Shadows, Midtones, Highlights, Whites]
  const maxZoneDelta = [0.055, 0.085, 0.09, 0.085, 0.065];
  const zoneBlend = [0.48, 0.64, 0.68, 0.64, 0.52];

  ys[0] = 0.0; // Anchor deep black floor strictly at 0.0
  for (let z = 0; z < 5; z++) {
    const rawDelta = (refQuantilesL[z] - srcQuantilesL[z]) * zoneBlend[z] * blend;
    const clampedDelta = clamp(rawDelta, -maxZoneDelta[z], maxZoneDelta[z]);
    ys[z + 1] = clamp(xs[z + 1] + clampedDelta, 0.015, 0.985);
  }
  ys[n - 1] = 1.0; // White ceiling anchor

  // Enforce strict monotonicity & slope bounds [0.28, 2.25]
  for (let i = 1; i < n; i++) {
    const dx = xs[i] - xs[i - 1];
    const minY = ys[i - 1] + 0.28 * dx;
    const maxY = ys[i - 1] + 2.25 * dx;
    ys[i] = clamp(ys[i], minY, Math.min(maxY, i === n - 1 ? 1.0 : 0.985));
  }
  // Backward pass to maintain upper ceiling monotonicity
  for (let i = n - 2; i >= 1; i--) {
    const dx = xs[i + 1] - xs[i];
    const maxAllowed = ys[i + 1] - 0.28 * dx;
    if (ys[i] > maxAllowed) ys[i] = maxAllowed;
    ys[i] = Math.max(ys[i], ys[i - 1] + 0.22 * (xs[i] - xs[i - 1]));
  }

  // Fritsch-Carlson monotone cubic Hermite tangents
  const delta = new Float64Array(n - 1);
  for (let i = 0; i < n - 1; i++) {
    delta[i] = (ys[i + 1] - ys[i]) / Math.max(xs[i + 1] - xs[i], 1e-5);
  }

  const m = new Float64Array(n);
  m[0] = delta[0];
  m[n - 1] = delta[n - 2];
  for (let i = 1; i < n - 1; i++) {
    if (delta[i - 1] * delta[i] <= 0.0) {
      m[i] = 0.0;
    } else {
      m[i] = 0.5 * (delta[i - 1] + delta[i]);
    }
  }

  for (let i = 0; i < n - 1; i++) {
    if (Math.abs(delta[i]) < 1e-7) {
      m[i] = 0.0;
      m[i + 1] = 0.0;
      continue;
    }
    const alpha = m[i] / delta[i];
    const beta = m[i + 1] / delta[i];
    const sq = alpha * alpha + beta * beta;
    if (sq > 9.0) {
      const tau = 3.0 / Math.sqrt(sq);
      m[i] = tau * alpha * delta[i];
      m[i + 1] = tau * beta * delta[i];
    }
  }

  return { xs, ys, m };
}

export function evalMonotoneHermite(spline, x) {
  const { xs, ys, m } = spline;
  const v = clamp(x, 0.0, 1.0);
  const n = xs.length;
  let seg = n - 2;
  for (let i = 0; i < n - 1; i++) {
    if (v <= xs[i + 1]) {
      seg = i;
      break;
    }
  }
  const h = Math.max(xs[seg + 1] - xs[seg], 1e-5);
  const t = clamp((v - xs[seg]) / h, 0.0, 1.0);
  const t2 = t * t;
  const t3 = t2 * t;
  const h00 = 2.0 * t3 - 3.0 * t2 + 1.0;
  const h10 = t3 - 2.0 * t2 + t;
  const h01 = -2.0 * t3 + 3.0 * t2;
  const h11 = t3 - t2;
  return clamp(h00 * ys[seg] + h10 * h * m[seg] + h01 * ys[seg + 1] + h11 * h * m[seg + 1], 0.0, 1.0);
}

// Analytical pre-compensation inverse of single-pass ratio-preserving
// filmicLinearShoulderRGB (> 0.80 linear) so fitting poly3 before runtime
// kfFilmicLinearShoulder avoids double highlight compression and preserves
// crisp >= 0.995 sRGB specular whites.
function invFilmicRollLinearChannel(y) {
  if (y <= FILMIC_SHOULDER_KNEE) return Math.max(0.0, y);
  const u = clamp((y - FILMIC_SHOULDER_KNEE) / FILMIC_SHOULDER_ROOM, 0.0, 0.994);
  const atanhU = 0.5 * Math.log((1.0 + u) / Math.max(1.0 - u, 1e-5));
  return FILMIC_SHOULDER_KNEE + FILMIC_SHOULDER_ROOM * atanhU;
}

function preCompensateFilmicTargetRGB(r, g, b, out) {
  let lr = srgbToLinearChannel(r);
  let lg = srgbToLinearChannel(g);
  let lb = srgbToLinearChannel(b);
  const maxLin = Math.max(lr, lg, lb);
  if (maxLin > FILMIC_SHOULDER_KNEE) {
    const invMax = invFilmicRollLinearChannel(maxLin);
    const invScale = invMax / Math.max(maxLin, 1e-5);
    lr *= invScale;
    lg *= invScale;
    lb *= invScale;
  }
  const encodeExt = (lin) => {
    const v = Math.max(0.0, lin);
    if (v <= 0.0031308) return v * 12.92;
    return clamp(1.055 * Math.pow(v, 1.0 / 2.4) - 0.055, 0.0, 1.32);
  };
  out[0] = encodeExt(lr);
  out[1] = encodeExt(lg);
  out[2] = encodeExt(lb);
}

// ---------------------------------------------------------------------------
// Primary Deterministic Slider + 3-Way Color Wheel Decomposition
// ---------------------------------------------------------------------------
function oklabABToZeroMeanWheelDelta(da, db, gain = 1.0, maxOffset = 0.07) {
  // Approximate opponent OKLab (a, b) -> zero-mean RGB wheel tint offsets
  const dr = (1.65 * da + 0.72 * db) * gain;
  const dg = (-0.62 * da + 0.24 * db) * gain;
  const dbC = (-0.42 * da - 1.55 * db) * gain;
  const avg = (dr + dg + dbC) / 3.0;
  return [
    round2(clamp(0.5 + clamp(dr - avg, -maxOffset, maxOffset), 0.40, 0.60)),
    round2(clamp(0.5 + clamp(dg - avg, -maxOffset, maxOffset), 0.40, 0.60)),
    round2(clamp(0.5 + clamp(dbC - avg, -maxOffset, maxOffset), 0.40, 0.60)),
  ];
}

function computePrimarySlidersAltair(refStats, srcStats, tgtSkinRatio = 0.0) {
  // Skin-safe pre-clip guard: when skin clusters are present (> 8% of target),
  // cap primary highlight/warmth/saturation push so Fair Skin highlights never
  // clip baseR inside kfGrade prior to kfHybridLayer.
  const skinPresence = smoothstep(0.08, 0.25, tgtSkinRatio);

  // 1. Scene-Linear Exposure (EV) from log2 linear luminance energy
  const rawEv = (refStats.meanLogY - srcStats.meanLogY) * 0.52;
  const maxEv = 0.44 - 0.41 * skinPresence;
  const exposure = clamp(0.46 * fastTanh(rawEv / 0.46), -0.48, maxEv);

  // 2. Scene-Linear Geometric Mid-Gray Pivot & Dynamic-Range Contrast
  const refMidLin = Math.pow(2.0, clamp(refStats.meanLogY, -4.5, -0.4));
  const pivotSrgb = linearToSrgbChannel(refMidLin);
  const pivot = clamp(0.55 * 0.435 + 0.45 * pivotSrgb, 0.34, 0.56);

  // Symmetric ratio floor prevents contrast collapse on flat/monochrome self-matches
  const spreadRatio =
    Math.max(refStats.stdLogY, 0.42) / Math.max(srcStats.stdLogY, 0.42);
  const iqrRef = Math.max(refStats.zoneQuantilesL[3] - refStats.zoneQuantilesL[1], 0.14);
  const iqrSrc = Math.max(srcStats.zoneQuantilesL[3] - srcStats.zoneQuantilesL[1], 0.14);
  const combinedRatio = 0.55 * spreadRatio + 0.45 * (iqrRef / iqrSrc);
  const maxContrast = 1.32 - 0.25 * skinPresence;
  const contrast = clamp(1.0 + (combinedRatio - 1.0) * 0.48, 0.86, maxContrast);

  // 3. Multi-Zone Shadow & Highlight primary energy offsets
  const shDeltaL = refStats.zoneQuantilesL[1] - srcStats.zoneQuantilesL[1];
  const hiDeltaL = refStats.zoneQuantilesL[3] - srcStats.zoneQuantilesL[3];
  const shadows = clamp(shDeltaL * 0.85, -0.24, 0.22);
  const maxHighlights = 0.22 - 0.22 * skinPresence;
  const highlights = clamp(hiDeltaL * 0.90, -0.26, maxHighlights);

  // 4. Illuminant-weighted OKLab White Balance
  const dA = refStats.meanA - srcStats.meanA;
  const dB = refStats.meanB - srcStats.meanB;
  const maxWarmTemp = 0.48 - 0.40 * skinPresence;
  const maxCoolTemp = 0.48 - 0.34 * skinPresence;
  const maxTint = 0.32 - 0.22 * skinPresence;
  const temp = clamp((dB * 2.35 + dA * 0.45) * 0.52, -maxCoolTemp, maxWarmTemp);
  const tint = clamp((dA * 2.15 - dB * 0.25) * 0.46, -maxTint, maxTint);

  // 5. Saturation & Smart Vibrance (symmetric chroma floor for flat/monochrome inputs)
  const chromaRatio =
    Math.max(refStats.meanChroma, 0.032) / Math.max(srcStats.meanChroma, 0.032);
  const maxSat = 1.24 - 0.20 * skinPresence;
  const maxVib = 0.34 - 0.29 * skinPresence;
  const sat = clamp(1.0 + (chromaRatio - 1.0) * 0.36, 0.80, maxSat);
  const vib = clamp(
    (chromaRatio - 1.0) * 0.32 + (srcStats.lowChromaRatio - refStats.lowChromaRatio) * 0.18,
    -0.18,
    maxVib
  );

  // 6. 3-Way Split-Toning Wheel Decomposition (residual zone color minus global WB)
  const shDA = (refStats.shadowAB[0] - srcStats.shadowAB[0]) - dA * 0.55;
  const shDB = (refStats.shadowAB[1] - srcStats.shadowAB[1]) - dB * 0.55;
  const mdDA = (refStats.midAB[0] - srcStats.midAB[0]) - dA * 0.70;
  const mdDB = (refStats.midAB[1] - srcStats.midAB[1]) - dB * 0.70;
  const hiDA = (refStats.highAB[0] - srcStats.highAB[0]) - dA * 0.55;
  const hiDB = (refStats.highAB[1] - srcStats.highAB[1]) - dB * 0.55;

  const skinWheelDamp = 1.0 - 0.75 * skinPresence;
  const lift = oklabABToZeroMeanWheelDelta(shDA, shDB, 0.55, 0.065);
  const gamma = oklabABToZeroMeanWheelDelta(
    mdDA,
    mdDB,
    0.42 * skinWheelDamp,
    0.055 * skinWheelDamp
  );
  const gain = oklabABToZeroMeanWheelDelta(
    hiDA,
    hiDB,
    0.50 * skinWheelDamp,
    0.065 * skinWheelDamp
  );

  return {
    ...DEFAULT_PARAMS,
    gradeMix: 1.0,
    autoGradeMix: 0.0,
    filmicShoulder: 1.0,
    exposure: round2(exposure),
    contrast: round2(contrast),
    pivot: round2(pivot),
    shadows: round2(shadows),
    highlights: round2(highlights),
    temp: round2(temp),
    tint: round2(tint),
    sat: round2(sat),
    vib: round2(vib),
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

// ---------------------------------------------------------------------------
// Lattice Solver: Iterative 3D OKLab Covariance Transfer + 5-Zone Spline +
// Skin-Tone Cluster Lock + Neutral-Axis Anchor + Scene-Linear Filmic Shoulder
// ---------------------------------------------------------------------------
function buildAltairLatticeTargets(G_sliders, refSamples, srcSamples, refStats, tgtSkinRatio) {
  const baseR = new Float32Array(LATTICE_COUNT);
  const baseG = new Float32Array(LATTICE_COUNT);
  const baseB = new Float32Array(LATTICE_COUNT);
  const baseL = new Float32Array(LATTICE_COUNT);
  const baseA = new Float32Array(LATTICE_COUNT);
  const baseBLab = new Float32Array(LATTICE_COUNT);
  const origA = new Float32Array(LATTICE_COUNT);
  const origBLab = new Float32Array(LATTICE_COUNT);
  const origSkinMask = new Float32Array(LATTICE_COUNT);

  const tmpRgb = [0, 0, 0];
  const tmpLab = [0, 0, 0];
  const rawLab = [0, 0, 0];

  let idx = 0;
  for (let ib = 0; ib < LATTICE_SIZE; ib++) {
    const b0 = ib / (LATTICE_SIZE - 1);
    for (let ig = 0; ig < LATTICE_SIZE; ig++) {
      const g0 = ig / (LATTICE_SIZE - 1);
      for (let ir = 0; ir < LATTICE_SIZE; ir++) {
        const r0 = ir / (LATTICE_SIZE - 1);
        srgbToOklab(r0, g0, b0, rawLab);
        origA[idx] = rawLab[1];
        origBLab[idx] = rawLab[2];
        origSkinMask[idx] = computeSkinClusterMask(rawLab[0], rawLab[1], rawLab[2]);

        gradeRGB(G_sliders, r0, g0, b0, tmpRgb);
        baseR[idx] = tmpRgb[0];
        baseG[idx] = tmpRgb[1];
        baseB[idx] = tmpRgb[2];
        srgbToOklab(tmpRgb[0], tmpRgb[1], tmpRgb[2], tmpLab);
        baseL[idx] = tmpLab[0];
        baseA[idx] = tmpLab[1];
        baseBLab[idx] = tmpLab[2];
        idx++;
      }
    }
  }

  // Evaluate primary grade on source samples to measure residual OKLab distribution
  const nSrc = srcSamples.count;
  const curL = new Float32Array(nSrc);
  const curA = new Float32Array(nSrc);
  const curB = new Float32Array(nSrc);
  const curW = srcSamples.covW;

  for (let i = 0; i < nSrc; i++) {
    gradeRGB(G_sliders, srcSamples.r[i], srcSamples.g[i], srcSamples.b[i], tmpRgb);
    srgbToOklab(tmpRgb[0], tmpRgb[1], tmpRgb[2], tmpLab);
    curL[i] = tmpLab[0];
    curA[i] = tmpLab[1];
    curB[i] = tmpLab[2];
  }

  // 5-Zone Monotone Hermite Tonal Curve solved on post-slider source vs reference
  const postSrcQuantilesL = computeWeightedQuantiles(
    curL,
    curW,
    [0.075, 0.25, 0.5, 0.75, 0.925]
  );
  const toneSpline = buildMonotoneHermite5Zone(postSrcQuantilesL, refStats.zoneQuantilesL, 0.65);

  // Reference 3x3 OKLab covariance & mean
  const refCovStats = computeOklabCovariance3x3(
    refSamples.L,
    refSamples.a,
    refSamples.bLab,
    refSamples.covW
  );
  const refMean = refCovStats.mean;
  const refCov = refCovStats.cov;

  // Iterative 3D OKLab Covariance & Cholesky/MKL Distribution Transfer (3 damped passes)
  const latL = Float32Array.from(baseL);
  const latA = Float32Array.from(baseA);
  const latB = Float32Array.from(baseBLab);

  const iterSteps = [0.46, 0.32, 0.22];
  const abComp = [0, 0];

  for (let iter = 0; iter < iterSteps.length; iter++) {
    const step = iterSteps[iter];
    const curCovStats = computeOklabCovariance3x3(curL, curA, curB, curW);
    const curMean = curCovStats.mean;
    const Tfull = computeEigenAlignedTransfer3x3(curCovStats.cov, refCov);

    // Damped affine step: A = (1 - step) * I + step * Tfull
    const a00 = 1.0 - step + step * Tfull[0];
    const a01 = step * Tfull[1];
    const a02 = step * Tfull[2];
    const a10 = step * Tfull[3];
    const a11 = 1.0 - step + step * Tfull[4];
    const a12 = step * Tfull[5];
    const a20 = step * Tfull[6];
    const a21 = step * Tfull[7];
    const a22 = 1.0 - step + step * Tfull[8];

    const dM0 = step * (refMean[0] - curMean[0]);
    const dM1 = step * (refMean[1] - curMean[1]);
    const dM2 = step * (refMean[2] - curMean[2]);

    // Advance source samples
    for (let i = 0; i < nSrc; i++) {
      const x0 = curL[i] - curMean[0];
      const x1 = curA[i] - curMean[1];
      const x2 = curB[i] - curMean[2];
      const nL = clamp(curMean[0] + dM0 + a00 * x0 + a01 * x1 + a02 * x2, 0.0, 1.0);
      const nA = curMean[1] + dM1 + a10 * x0 + a11 * x1 + a12 * x2;
      const nB = curMean[2] + dM2 + a20 * x0 + a21 * x1 + a22 * x2;
      compressOklabChroma(nA, nB, abComp);
      curL[i] = nL;
      curA[i] = abComp[0];
      curB[i] = abComp[1];
    }

    // Apply identical step to 17^3 lattice nodes
    for (let i = 0; i < LATTICE_COUNT; i++) {
      const x0 = latL[i] - curMean[0];
      const x1 = latA[i] - curMean[1];
      const x2 = latB[i] - curMean[2];
      const nL = clamp(curMean[0] + dM0 + a00 * x0 + a01 * x1 + a02 * x2, 0.0, 1.0);
      const nA = curMean[1] + dM1 + a10 * x0 + a11 * x1 + a12 * x2;
      const nB = curMean[2] + dM2 + a20 * x0 + a21 * x1 + a22 * x2;
      compressOklabChroma(nA, nB, abComp);
      latL[i] = nL;
      latA[i] = abComp[0];
      latB[i] = abComp[1];
    }
  }

  // Adaptive skinProtect retention weight (stronger when real skin clusters exist)
  const adaptiveSkinProtect = clamp(0.58 + 0.30 * Math.min(1.0, tgtSkinRatio * 4.0), 0.58, 0.88);

  const targetR = new Float32Array(LATTICE_COUNT);
  const targetG = new Float32Array(LATTICE_COUNT);
  const targetB = new Float32Array(LATTICE_COUNT);
  const compRgb = [0, 0, 0];

  for (let i = 0; i < LATTICE_COUNT; i++) {
    const L0 = baseL[i];
    const a0 = baseA[i];
    const b0 = baseBLab[i];
    const origC = Math.hypot(a0, b0);

    // 1. Combine 5-Zone Monotone Hermite Tonal Curve with 3D covariance L
    const splineL = evalMonotoneHermite(toneSpline, L0);
    const covL = latL[i];
    const rawTargetL = 0.65 * splineL + 0.35 * covL;

    // 2. Neutral-axis black & white guards
    const shadowToeMask = smoothstep(0.02, 0.16, L0);
    const darkNeutralMask =
      (1.0 - smoothstep(0.06, 0.22, L0)) * (1.0 - smoothstep(0.015, 0.055, origC));
    const brightNeutralMask =
      smoothstep(0.72, 0.84, L0) * (1.0 - smoothstep(0.015, 0.060, origC));
    const neutralGuard = (1.0 - 0.88 * darkNeutralMask) * (1.0 - 0.88 * brightNeutralMask);

    // 3. Blend transferred chromaticity with neutral guards
    const dA = (latA[i] - a0) * neutralGuard * shadowToeMask;
    const dB = (latB[i] - b0) * neutralGuard * shadowToeMask;
    let candA = a0 + dA;
    let candB = b0 + dB;

    // 4. Perceptual Skin-Tone Cluster Lock (anchored to original ungraded OKLab skin hue in [25°, 65°])
    // Uses a smooth wide transition halo around the skin corridor when real skin is present
    // so the global cubic polynomial can preserve skin cleanly without sharp discontinuities.
    const rawHueDeg = ((Math.atan2(origBLab[i], origA[i]) * RAD_TO_DEG) + 360.0) % 360.0;
    const rawC = Math.hypot(origA[i], origBLab[i]);
    const skinHalo =
      tgtSkinRatio > 0.08
        ? smoothstep(5.0, 24.0, rawHueDeg) *
          (1.0 - smoothstep(66.0, 88.0, rawHueDeg)) *
          smoothstep(0.012, 0.032, rawC) *
          (1.0 - smoothstep(0.135, 0.21, rawC)) *
          smoothstep(0.14, 0.25, baseL[i]) *
          (1.0 - smoothstep(0.88, 0.98, baseL[i])) *
          smoothstep(0.08, 0.22, tgtSkinRatio) *
          0.55
        : 0.0;
    const skinM = Math.max(origSkinMask[i], skinHalo);
    if (skinM > 1e-4) {
      const skinAnchorC = Math.hypot(origA[i], origBLab[i]);
      const skinAnchorHue = Math.atan2(origBLab[i], origA[i]);
      const candC = Math.hypot(candA, candB);
      const candHue = Math.atan2(candB, candA);
      const dHue = wrapAngleRad(candHue - skinAnchorHue);

      let candDeg = candHue * RAD_TO_DEG;
      if (candDeg < 0.0) candDeg += 360.0;
      const outsideSkinCorridor = candDeg < 24.0 || candDeg > 66.0 ? 1.0 : 0.0;
      const effProtect = clamp(
        adaptiveSkinProtect + 0.22 * outsideSkinCorridor,
        0.58,
        0.95
      );

      let safeHue = skinAnchorHue + dHue * (1.0 - effProtect * skinM);
      let safeDeg = safeHue * RAD_TO_DEG;
      if (safeDeg < 0.0) safeDeg += 360.0;
      if (safeDeg < 24.0 || safeDeg > 66.0) {
        const clampedDeg = clamp(safeDeg > 180.0 ? 24.0 : safeDeg, 24.0, 66.0);
        const pullRad = wrapAngleRad(clampedDeg * DEG_TO_RAD - safeHue);
        safeHue += pullRad * skinM * 0.90;
      }

      const safeC = clamp(
        skinAnchorC + (candC - skinAnchorC) * (1.0 - effProtect * skinM * 0.85),
        skinAnchorC * 0.82,
        Math.min(skinAnchorC * 1.16, 0.135)
      );
      candA = safeC * Math.cos(safeHue);
      candB = safeC * Math.sin(safeHue);
    }

    // 5. Final chroma soft-compression and luminance anchoring
    compressOklabChroma(candA, candB, abComp);
    const hiLumaGuard = 1.0 - 0.65 * smoothstep(0.84, 0.99, L0);
    const finalL = clamp(
      L0 + clamp(rawTargetL - L0, -0.095, 0.095) * shadowToeMask * hiLumaGuard,
      0.0,
      1.0
    );

    oklabToSrgb(finalL, abComp[0], abComp[1], tmpRgb);

    // 6. Pre-compensate cleanly for the single-pass runtime kfFilmicLinearShoulder
    // (> 0.80 linear) so highlights match 1:1 without double compression.
    preCompensateFilmicTargetRGB(tmpRgb[0], tmpRgb[1], tmpRgb[2], compRgb);

    targetR[i] = baseR[i] + (compRgb[0] - baseR[i]) * shadowToeMask;
    targetG[i] = baseG[i] + (compRgb[1] - baseG[i]) * shadowToeMask;
    targetB[i] = baseB[i] + (compRgb[2] - baseB[i]) * shadowToeMask;
  }

  return {
    baseR,
    baseG,
    baseB,
    baseL,
    baseA,
    baseBLab,
    baseSkinMask: origSkinMask,
    adaptiveSkinProtect,
    targetR,
    targetG,
    targetB,
  };
}

// ---------------------------------------------------------------------------
// Linear Solver & Zero-Intercept Cubic 3D Polynomial + 6-Hue Residual Fit
// ---------------------------------------------------------------------------
function solveLinearSystem(A, b, n) {
  const M = new Float64Array(n * n);
  const rhs = new Float64Array(n);
  for (let i = 0; i < n * n; i++) M[i] = A[i];
  for (let i = 0; i < n; i++) rhs[i] = b[i];

  for (let k = 0; k < n; k++) {
    let maxRow = k;
    let maxVal = Math.abs(M[k * n + k]);
    for (let i = k + 1; i < n; i++) {
      const v = Math.abs(M[i * n + k]);
      if (v > maxVal) {
        maxVal = v;
        maxRow = i;
      }
    }
    if (maxRow !== k) {
      for (let j = k; j < n; j++) {
        const tmp = M[k * n + j];
        M[k * n + j] = M[maxRow * n + j];
        M[maxRow * n + j] = tmp;
      }
      const tmpB = rhs[k];
      rhs[k] = rhs[maxRow];
      rhs[maxRow] = tmpB;
    }

    const pivot = M[k * n + k];
    if (Math.abs(pivot) < 1e-12) continue;

    for (let i = k + 1; i < n; i++) {
      const factor = M[i * n + k] / pivot;
      for (let j = k; j < n; j++) {
        M[i * n + j] -= factor * M[k * n + j];
      }
      rhs[i] -= factor * rhs[k];
    }
  }

  const x = new Float64Array(n);
  for (let i = n - 1; i >= 0; i--) {
    let sum = rhs[i];
    for (let j = i + 1; j < n; j++) {
      sum -= M[i * n + j] * x[j];
    }
    const diag = M[i * n + i];
    x[i] = Math.abs(diag) > 1e-12 ? sum / diag : 0.0;
  }
  return x;
}

function fitZeroInterceptPoly3Altair(lattice) {
  const {
    baseR,
    baseG,
    baseB,
    baseL,
    baseA,
    baseBLab,
    baseSkinMask,
    adaptiveSkinProtect = 0.60,
    targetR,
    targetG,
    targetB,
  } = lattice;
  const N = 19;
  const AtA = new Float64Array(N * N);
  const AtYR = new Float64Array(N);
  const AtYG = new Float64Array(N);
  const AtYB = new Float64Array(N);
  const phi = new Float64Array(N);

  for (let idx = 0; idx < LATTICE_COUNT; idx++) {
    const r = baseR[idx];
    const g = baseG[idx];
    const b = baseB[idx];
    const L = baseL[idx];
    const chr = Math.hypot(baseA[idx], baseBLab[idx]);

    const isNeutral = chr < 0.045 ? 3.5 : 1.0;
    const isDark = L < 0.14 ? 4.2 : 1.0;
    const isBrightNeutral =
      L > 0.94 && chr < 0.03 ? 18.0 : L > 0.74 && chr < 0.06 ? 5.5 : 1.0;
    const skinM = baseSkinMask[idx];
    const isSkin =
      skinM > 0.12 ? 1.0 + skinM * (10.0 + 18.0 * adaptiveSkinProtect) : 1.0;
    const w = isNeutral * isDark * isBrightNeutral * isSkin;

    const r2 = r * r;
    const g2 = g * g;
    const b2 = b * b;

    phi[0] = r;
    phi[1] = g;
    phi[2] = b;
    phi[3] = r2;
    phi[4] = g2;
    phi[5] = b2;
    phi[6] = r * g;
    phi[7] = r * b;
    phi[8] = g * b;
    phi[9] = r2 * r;
    phi[10] = g2 * g;
    phi[11] = b2 * b;
    phi[12] = r2 * g;
    phi[13] = r2 * b;
    phi[14] = g2 * r;
    phi[15] = g2 * b;
    phi[16] = b2 * r;
    phi[17] = b2 * g;
    phi[18] = r * g * b;

    const tr = targetR[idx];
    const tg = targetG[idx];
    const tb = targetB[idx];

    for (let i = 0; i < N; i++) {
      const wPhiI = w * phi[i];
      AtYR[i] += wPhiI * tr;
      AtYG[i] += wPhiI * tg;
      AtYB[i] += wPhiI * tb;
      const rowOff = i * N;
      for (let j = i; j < N; j++) {
        AtA[rowOff + j] += wPhiI * phi[j];
      }
    }
  }

  for (let i = 0; i < N; i++) {
    for (let j = 0; j < i; j++) {
      AtA[i * N + j] = AtA[j * N + i];
    }
  }

  for (let i = 0; i < N; i++) {
    const lambda = i < 3 ? 24.0 : i < 9 ? 120.0 : 280.0;
    AtA[i * N + i] += lambda;
    if (i === 0) AtYR[0] += lambda * 1.0;
    if (i === 1) AtYG[1] += lambda * 1.0;
    if (i === 2) AtYB[2] += lambda * 1.0;
  }

  const c19R = solveLinearSystem(AtA, AtYR, N);
  const c19G = solveLinearSystem(AtA, AtYG, N);
  const c19B = solveLinearSystem(AtA, AtYB, N);

  const polyR = IDENTITY_POLY_R.slice();
  const polyG = IDENTITY_POLY_G.slice();
  const polyB = IDENTITY_POLY_B.slice();
  polyR[0] = 0.0;
  polyG[0] = 0.0;
  polyB[0] = 0.0;
  for (let i = 0; i < N; i++) {
    polyR[i + 1] = Number.isFinite(c19R[i]) ? c19R[i] : IDENTITY_POLY_R[i + 1];
    polyG[i + 1] = Number.isFinite(c19G[i]) ? c19G[i] : IDENTITY_POLY_G[i + 1];
    polyB[i + 1] = Number.isFinite(c19B[i]) ? c19B[i] : IDENTITY_POLY_B[i + 1];
  }

  return { polyR, polyG, polyB };
}

function evalPoly19(c20, r, g, b) {
  const r2 = r * r;
  const g2 = g * g;
  const b2 = b * b;
  return (
    c20[1] * r +
    c20[2] * g +
    c20[3] * b +
    c20[4] * r2 +
    c20[5] * g2 +
    c20[6] * b2 +
    c20[7] * r * g +
    c20[8] * r * b +
    c20[9] * g * b +
    c20[10] * r2 * r +
    c20[11] * g2 * g +
    c20[12] * b2 * b +
    c20[13] * r2 * g +
    c20[14] * r2 * b +
    c20[15] * g2 * r +
    c20[16] * g2 * b +
    c20[17] * b2 * r +
    c20[18] * b2 * g +
    c20[19] * r * g * b
  );
}

function hueSectorWeight(h, center) {
  const d = wrapAngleRad(h - center);
  const w = clamp(1.0 - Math.abs(d) / 1.04719755, 0.0, 1.0);
  return w * w * (3.0 - 2.0 * w);
}

function fitResidualHue6Altair(lattice, polyR, polyG, polyB) {
  const {
    baseR,
    baseG,
    baseB,
    baseSkinMask,
    adaptiveSkinProtect = 0.60,
    targetR,
    targetG,
    targetB,
  } = lattice;
  const sumW = new Float64Array(6);
  const sumHue = new Float64Array(6);
  const sumSat = new Float64Array(6);
  const sumLum = new Float64Array(6);

  // Non-skin damping on Red-Orange (s=0, 0 deg) and Yellow-Orange (s=5, -60 deg)
  // opponent-chroma sectors where human skin tones reside (~-35 deg to -52 deg).
  const skinSectorNonSkinDamp = clamp(1.0 - 0.72 * adaptiveSkinProtect, 0.22, 0.75);

  for (let i = 0; i < LATTICE_COUNT; i++) {
    const r = baseR[i];
    const g = baseG[i];
    const b = baseB[i];
    const pr = clamp(evalPoly19(polyR, r, g, b), 0.0, 1.35);
    const pg = clamp(evalPoly19(polyG, r, g, b), 0.0, 1.35);
    const pb = clamp(evalPoly19(polyB, r, g, b), 0.0, 1.35);

    const y0 = 0.2126 * pr + 0.7152 * pg + 0.0722 * pb;
    const c1 = pr - y0;
    const c2 = pb - y0;
    const chr = Math.hypot(c1, c2);
    if (chr < 0.045 || y0 < 0.12 || y0 > 0.86) continue;

    const tr = targetR[i];
    const tg = targetG[i];
    const tb = targetB[i];
    const ty = 0.2126 * tr + 0.7152 * tg + 0.0722 * tb;
    const tc1 = tr - ty;
    const tc2 = tb - ty;
    const tChr = Math.hypot(tc1, tc2);

    const h0 = Math.atan2(c2, c1);
    const hT = Math.atan2(tc2, tc1);
    const dHue = clamp(wrapAngleRad(hT - h0), -0.32, 0.32);
    const dSat = clamp((tChr - chr) / Math.max(chr, 0.05), -0.42, 0.42);
    const dLum = clamp((ty - y0) / 0.24, -0.28, 0.28);

    const gate =
      smoothstep(0.045, 0.13, chr) *
      smoothstep(0.12, 0.24, y0) *
      (1.0 - smoothstep(0.72, 0.88, y0));

    const skinM = baseSkinMask ? baseSkinMask[i] : 0.0;
    const skinBoost =
      skinM > 0.15 ? 1.0 + skinM * (8.0 + 14.0 * adaptiveSkinProtect) : 1.0;

    for (let s = 0; s < 6; s++) {
      let sw = hueSectorWeight(h0, HUE_CENTERS[s]) * gate;
      if (sw <= 1e-4) continue;
      if (s === 0 || s === 5) {
        sw *= skinM > 0.15 ? skinBoost : skinSectorNonSkinDamp;
      }
      sumW[s] += sw;
      sumHue[s] += sw * dHue;
      sumSat[s] += sw * dSat;
      sumLum[s] += sw * dLum;
    }
  }

  const hueShift = IDENTITY_HUE6.slice();
  const hueSat = IDENTITY_HUE6.slice();
  const hueLuma = IDENTITY_HUE6.slice();
  const ridge = 42.0;

  for (let s = 0; s < 6; s++) {
    const isSkinSector = s === 0 || s === 5;
    const denom = sumW[s] + ridge;
    const maxShift = isSkinSector ? 0.30 : 0.20;
    const maxSat = isSkinSector ? clamp(0.24 - 0.08 * adaptiveSkinProtect, 0.16, 0.24) : 0.26;
    hueShift[s] = clamp(sumHue[s] / denom, -maxShift, maxShift);
    hueSat[s] = clamp(sumSat[s] / denom, -maxSat, maxSat);
    hueLuma[s] = clamp(sumLum[s] / denom, -0.16, 0.16);
  }

  return { hueShift, hueSat, hueLuma };
}

// Canonical skin anchors (Fair, Medium, Olive, Deep) used as a lightweight
// corridor guard inside Closed-Loop Residual Trim.
const SKIN_GUARD_SWATCHES = Object.freeze([
  [0.91, 0.76, 0.67],
  [0.78, 0.57, 0.44],
  [0.64, 0.46, 0.34],
  [0.38, 0.24, 0.17],
]);

function skinCorridorExcessRad(hueRad) {
  let deg = hueRad * RAD_TO_DEG;
  if (deg < 0.0) deg += 360.0;
  if (deg >= 25.0 && deg <= 65.0) return 0.0;
  const distLow = Math.abs(wrapAngleRad(hueRad - 25.0 * DEG_TO_RAD));
  const distHigh = Math.abs(wrapAngleRad(hueRad - 65.0 * DEG_TO_RAD));
  return Math.min(distLow, distHigh);
}

// ---------------------------------------------------------------------------
// Closed-Loop Verification & Residual Trim against Exact evaluateGradeRGB()
// ---------------------------------------------------------------------------
function measureOklabError(params, srcSamples, refStats) {
  const G = prepareGrade(params);
  const outRgb = [0, 0, 0];
  const outLab = [0, 0, 0];
  const inLab = [0, 0, 0];
  const step = Math.max(1, Math.floor(srcSamples.count / 512));
  let sumW = 0.0;
  let sumL = 0.0;
  let sumWbW = 0.0;
  let sumA = 0.0;
  let sumB = 0.0;
  let skinDriftSum = 0.0;
  let skinOutSum = 0.0;
  let skinWSum = 0.0;

  for (let i = 0; i < srcSamples.count; i += step) {
    evaluateGradeRGB(G, srcSamples.r[i], srcSamples.g[i], srcSamples.b[i], outRgb, false);
    srgbToOklab(outRgb[0], outRgb[1], outRgb[2], outLab);
    const w = srcSamples.covW[i];
    const wbW = srcSamples.wbW[i];
    sumW += w;
    sumL += w * outLab[0];
    sumWbW += wbW;
    sumA += wbW * outLab[1];
    sumB += wbW * outLab[2];

    const sw = srcSamples.skinW ? srcSamples.skinW[i] : 0.0;
    if (sw > 0.15) {
      const hIn = Math.atan2(srcSamples.bLab[i], srcSamples.a[i]);
      const hOut = Math.atan2(outLab[2], outLab[1]);
      const drift = Math.abs(wrapAngleRad(hOut - hIn));
      const excess = skinCorridorExcessRad(hOut);
      skinDriftSum += sw * (drift + 3.0 * excess);
      skinOutSum += sw * excess;
      skinWSum += sw;
    }
  }

  // Canonical skin swatches guard (prevents trim from drifting skin out of [25°, 65°])
  const swatchWeight = skinWSum > 1e-3 ? 0.35 : 0.15;
  for (let k = 0; k < SKIN_GUARD_SWATCHES.length; k++) {
    const [sr, sg, sb] = SKIN_GUARD_SWATCHES[k];
    srgbToOklab(sr, sg, sb, inLab);
    evaluateGradeRGB(G, sr, sg, sb, outRgb, false);
    srgbToOklab(outRgb[0], outRgb[1], outRgb[2], outLab);
    const hIn = Math.atan2(inLab[2], inLab[1]);
    const hOut = Math.atan2(outLab[2], outLab[1]);
    const drift = Math.abs(wrapAngleRad(hOut - hIn));
    const excess = skinCorridorExcessRad(hOut);
    skinDriftSum += swatchWeight * (drift + 3.0 * excess);
    skinOutSum += swatchWeight * excess;
    skinWSum += swatchWeight;
  }

  const meanL = sumL / Math.max(sumW, 1e-6);
  const meanA = sumA / Math.max(sumWbW, 1e-6);
  const meanB = sumB / Math.max(sumWbW, 1e-6);
  const errL = refStats.meanL - meanL;
  const errA = refStats.meanA - meanA;
  const errB = refStats.meanB - meanB;
  const meanSkinPenalty = skinWSum > 1e-5 ? skinDriftSum / skinWSum : 0.0;
  const skinOutOfCorridor = skinWSum > 1e-5 ? skinOutSum / skinWSum : 0.0;
  const score =
    Math.sqrt(errL * errL + 1.8 * (errA * errA + errB * errB)) + 0.45 * meanSkinPenalty;
  return { errL, errA, errB, skinOutOfCorridor, score };
}

// ---------------------------------------------------------------------------
// Main Entrypoint: Altair 4.0 ULTRA (Scene-Linear Pro)
// ---------------------------------------------------------------------------
export function analyzeEngineAltairV4(refView, tgtView, options = {}) {
  const {
    numPixels = 0,
    targetNumPixels = 0,
    autoNormalizeTarget = false,
    inputProfile = "rec709",
    onStage,
  } = options;

  const refN = numPixels || (refView ? Math.floor(refView.length / 4) : 0);
  if (!refView || refN < 1) {
    return sanitizeParams({ ...DEFAULT_PARAMS, autoGradeMix: 0.0, filmicShoulder: 1.0 });
  }

  if (typeof onStage === "function") {
    onStage("Altair 4.0 ULTRA: Linearizing Rec.709 & OKLab dual-space...");
  }

  let effectiveTgtView = tgtView;
  let effectiveTgtN =
    targetNumPixels || (tgtView ? Math.floor(tgtView.length / 4) : 0);
  let normStats = null;

  // Sample-First Pre-Pass: stride-sample to MAX_SAMPLES (3,072) BEFORE running
  // Camera Log linearization & Auto-Normalize (~8x faster on HD/4K frames).
  if (effectiveTgtView && effectiveTgtN > 0) {
    const needsLog = isLogProfileActive(inputProfile);
    if (needsLog || autoNormalizeTarget) {
      const sampled = strideSampleRgba(effectiveTgtView, effectiveTgtN, MAX_SAMPLES);
      effectiveTgtView = sampled.data;
      effectiveTgtN = sampled.numPixels;
      if (needsLog) {
        effectiveTgtView = applyLogProfileToRgba(
          effectiveTgtView,
          effectiveTgtN,
          inputProfile
        );
      }
      if (autoNormalizeTarget) {
        if (typeof onStage === "function") {
          onStage("Altair 4.0 ULTRA: Auto-normalizing target exposure & WB...");
        }
        const norm = autoNormalizeTargetPixels(effectiveTgtView, effectiveTgtN);
        effectiveTgtView = norm.data;
        effectiveTgtN = norm.numPixels;
        normStats = norm.normStats;
      }
    }
  }

  const refSamples = extractDualSpaceSamples(refView, refN, MAX_SAMPLES);
  const hasRealTarget = Boolean(effectiveTgtView && effectiveTgtN >= 16);
  const srcSamples = hasRealTarget
    ? extractDualSpaceSamples(effectiveTgtView, effectiveTgtN, MAX_SAMPLES)
    : buildNominalNeutralSamples();

  const refStats = computeDualSpaceStats(refSamples);
  const srcStats = computeDualSpaceStats(srcSamples);
  const effectiveSkinRatio = hasRealTarget ? srcStats.skinRatio : refStats.skinRatio;

  if (typeof onStage === "function") {
    onStage("Altair 4.0 ULTRA: Solving scene-linear sliders & 3-way wheels...");
  }

  const primaryParams = computePrimarySlidersAltair(
    refStats,
    srcStats,
    effectiveSkinRatio
  );
  const G_sliders = prepareGrade({
    ...primaryParams,
    autoGradeMix: 0.0,
    filmicShoulder: 0.0,
  });

  if (typeof onStage === "function") {
    onStage("Altair 4.0 ULTRA: Iterative 3D OKLab covariance & 5-zone spline...");
  }

  const lattice = buildAltairLatticeTargets(
    G_sliders,
    refSamples,
    srcSamples,
    refStats,
    effectiveSkinRatio
  );

  if (typeof onStage === "function") {
    onStage("Altair 4.0 ULTRA: Fitting cubic 3D poly, skin lock & filmic shoulder...");
  }

  const { polyR, polyG, polyB } = fitZeroInterceptPoly3Altair(lattice);
  const { hueShift, hueSat, hueLuma } = fitResidualHue6Altair(
    lattice,
    polyR,
    polyG,
    polyB
  );

  let candidate = sanitizeParams({
    ...primaryParams,
    autoGradeMix: 1.0,
    filmicShoulder: 1.0,
    polyR,
    polyG,
    polyB,
    hueShift,
    hueSat,
    hueLuma,
  });

  // Closed-loop residual trim against the exact evaluateGradeRGB() shader twin
  const baseEval = measureOklabError(candidate, srcSamples, refStats);
  if (baseEval.score > 0.006) {
    const skinTrimDamp = 1.0 - 0.65 * smoothstep(0.08, 0.25, effectiveSkinRatio);
    const trimmed = sanitizeParams({
      ...candidate,
      exposure: round2(
        clamp(
          candidate.exposure + clamp(baseEval.errL * 0.55 * skinTrimDamp, -0.14, 0.14),
          -0.60,
          0.55
        )
      ),
      temp: round2(
        clamp(
          candidate.temp +
            clamp(
              (baseEval.errB * 1.5 + baseEval.errA * 0.35) * 0.45 * skinTrimDamp,
              -0.14,
              0.14
            ),
          -0.65,
          0.65
        )
      ),
      tint: round2(
        clamp(
          candidate.tint +
            clamp(
              (baseEval.errA * 1.4 - baseEval.errB * 0.2) * 0.45 * skinTrimDamp,
              -0.12,
              0.12
            ),
          -0.45,
          0.45
        )
      ),
    });
    const trimEval = measureOklabError(trimmed, srcSamples, refStats);
    if (
      trimEval.score < baseEval.score &&
      trimEval.skinOutOfCorridor <= baseEval.skinOutOfCorridor + 1e-4
    ) {
      candidate = trimmed;
    }
  }

  if (normStats) {
    candidate = sanitizeParams(applyTargetAutoNormalizeOffsets(candidate, normStats));
  }

  return sanitizeParams(candidate);
}
