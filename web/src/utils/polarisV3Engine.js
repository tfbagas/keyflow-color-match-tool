import {
  DEFAULT_PARAMS,
  IDENTITY_HUE6,
  clamp,
  prepareGrade,
  gradeRGB,
  sanitizeParams,
} from "./gradeEngine.js";
import {
  compressOklabChroma,
  strideSampleRgba,
  autoNormalizeTargetPixels,
  applyTargetAutoNormalizeOffsets,
} from "./colorMatcher.js";
import { applyLogProfileToRgba, isLogProfileActive } from "./logProfiles.js";
import { makeLutSampler } from "./presetImporter.js";

const LATTICE_SIZE = 17;
const LATTICE_COUNT = LATTICE_SIZE * LATTICE_SIZE * LATTICE_SIZE; // 4913
const MAX_HUE_ROT_RAD = (40.0 * Math.PI) / 180.0;
const HUE_RETENTION = 0.36;

const HUE_CENTERS = [
  0.0,
  1.04719755,
  2.0943951,
  3.14159265,
  -2.0943951,
  -1.04719755,
];

function smoothstep(edge0, edge1, x) {
  const t = clamp((x - edge0) / Math.max(edge1 - edge0, 1e-5), 0.0, 1.0);
  return t * t * (3.0 - 2.0 * t);
}

function srgbToLinear(c) {
  const v = clamp(c, 0.0, 1.0);
  return v <= 0.04045 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
}

function linearToSrgb(c) {
  const v = Math.max(c, 0.0);
  const s = v <= 0.0031308 ? 12.92 * v : 1.055 * Math.pow(v, 1.0 / 2.4) - 0.055;
  return clamp(s, 0.0, 1.0);
}

function rgbToOklab(r, g, b, out) {
  const lr = srgbToLinear(r);
  const lg = srgbToLinear(g);
  const lb = srgbToLinear(b);
  const l = Math.cbrt(0.4122214708 * lr + 0.5363325363 * lg + 0.0514459929 * lb);
  const m = Math.cbrt(0.2119034982 * lr + 0.6806995451 * lg + 0.1073969566 * lb);
  const s = Math.cbrt(0.0883024619 * lr + 0.2817188376 * lg + 0.6299787005 * lb);
  out[0] = 0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s;
  out[1] = 1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s;
  out[2] = 0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s;
}

function oklabToRgb(L, a, bLab, out) {
  const l_ = L + 0.3963377774 * a + 0.2158037573 * bLab;
  const m_ = L - 0.1055613458 * a - 0.0638541728 * bLab;
  const s_ = L - 0.0894841775 * a - 1.291485548 * bLab;
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

function computeIlluminantWeight(L, chroma) {
  const c2 = chroma * chroma;
  const baseWeight = 1.0 / (1.0 + 25.0 * c2);
  if (chroma > 0.11) {
    const excess = chroma - 0.11;
    return baseWeight / (1.0 + 40.0 * excess * excess);
  }
  const midGate = smoothstep(0.04, 0.14, L) * (1.0 - 0.35 * smoothstep(0.92, 1.0, L));
  return Math.max(baseWeight * (0.35 + 0.65 * midGate), 1e-4);
}

function extractSamples(rgbaView, totalPixels, maxSamples = 2048) {
  const step = Math.max(1, Math.floor(totalPixels / maxSamples));
  const rArr = [];
  const gArr = [];
  const bArr = [];
  const LArr = [];
  const aArr = [];
  const bLabArr = [];
  const wArr = [];
  const wbWArr = [];
  const lab = [0, 0, 0];

  for (let i = 0; i < totalPixels; i += step) {
    const idx = i * 4;
    const alpha = rgbaView[idx + 3];
    if (alpha < 16) continue;
    const r = rgbaView[idx] / 255.0;
    const g = rgbaView[idx + 1] / 255.0;
    const b = rgbaView[idx + 2] / 255.0;
    rgbToOklab(r, g, b, lab);
    const L = lab[0];
    const a = lab[1];
    const bLab = lab[2];
    const chroma = Math.hypot(a, bLab);

    const illumW = computeIlluminantWeight(L, chroma);
    const wbMid = smoothstep(0.15, 0.30, L) * (1.0 - smoothstep(0.75, 0.94, L));
    const wbW = illumW * (0.1 + 0.9 * wbMid);

    rArr.push(r);
    gArr.push(g);
    bArr.push(b);
    LArr.push(L);
    aArr.push(a);
    bLabArr.push(bLab);
    wArr.push(illumW);
    wbWArr.push(wbW);
  }

  return {
    count: rArr.length,
    r: Float32Array.from(rArr),
    g: Float32Array.from(gArr),
    b: Float32Array.from(bArr),
    L: Float32Array.from(LArr),
    a: Float32Array.from(aArr),
    bLab: Float32Array.from(bLabArr),
    w: Float32Array.from(wArr),
    wbW: Float32Array.from(wbWArr),
  };
}

function computeStats(samples) {
  const n = samples.count;
  if (n === 0) {
    return {
      meanL: 0.5,
      stdL: 0.2,
      meanA: 0.0,
      meanB: 0.0,
      meanChroma: 0.06,
    };
  }
  let sumW = 0.0;
  let sumL = 0.0;
  let sumChroma = 0.0;
  let sumWbW = 0.0;
  let sumA = 0.0;
  let sumB = 0.0;

  for (let i = 0; i < n; i++) {
    const w = samples.w[i];
    const wbW = samples.wbW[i];
    const L = samples.L[i];
    const a = samples.a[i];
    const b = samples.bLab[i];
    const chr = Math.hypot(a, b);
    sumW += w;
    sumL += w * L;
    sumChroma += w * chr;
    sumWbW += wbW;
    sumA += wbW * a;
    sumB += wbW * b;
  }

  const meanL = sumL / Math.max(sumW, 1e-6);
  const meanChroma = sumChroma / Math.max(sumW, 1e-6);
  const meanA = sumA / Math.max(sumWbW, 1e-6);
  const meanB = sumB / Math.max(sumWbW, 1e-6);

  let sumVarL = 0.0;
  for (let i = 0; i < n; i++) {
    const d = samples.L[i] - meanL;
    sumVarL += samples.w[i] * d * d;
  }
  const stdL = Math.sqrt(sumVarL / Math.max(sumW, 1e-6));

  return { meanL, stdL, meanA, meanB, meanChroma };
}

function computeDampedSlidersV3(refStats, tgtStats) {
  const baseL = tgtStats ? tgtStats.meanL : 0.48;
  const baseStdL = tgtStats ? Math.max(tgtStats.stdL, 0.12) : 0.21;
  const baseA = tgtStats ? tgtStats.meanA : 0.0;
  const baseB = tgtStats ? tgtStats.meanB : 0.0;
  const baseChroma = tgtStats ? Math.max(tgtStats.meanChroma, 0.035) : 0.062;

  const dL = refStats.meanL - baseL;
  const exposure = clamp(dL * 0.65, -0.25, 0.25);

  const stdRatio = refStats.stdL / Math.max(baseStdL, 0.12);
  const contrast = clamp(1.0 + (stdRatio - 1.0) * 0.42, 0.88, 1.24);

  const dA = refStats.meanA - baseA;
  const dB = refStats.meanB - baseB;
  const temp = clamp((dB * 2.2 + dA * 0.45) * 0.55, -0.45, 0.45);
  const tint = clamp((dA * 2.1 - dB * 0.25) * 0.50, -0.28, 0.28);

  const chromaRatio = refStats.meanChroma / Math.max(baseChroma, 0.035);
  const sat = clamp(1.0 + (chromaRatio - 1.0) * 0.32, 0.82, 1.20);
  const vib = clamp((chromaRatio - 1.0) * 0.28, -0.15, 0.35);

  return {
    ...DEFAULT_PARAMS,
    gradeMix: 1.0,
    exposure,
    contrast,
    pivot: DEFAULT_PARAMS.pivot ?? 0.435,
    highlights: 0.0,
    shadows: 0.0,
    whites: 0.0,
    blacks: 0.0,
    shadowLevel: 0.0,
    highlightLevel: 0.0,
    shadowTint: "#808080",
    highlightTint: "#808080",
    temp,
    tint,
    sat,
    vib,
    liftR: 0.5,
    liftG: 0.5,
    liftB: 0.5,
    gammaR: 0.5,
    gammaG: 0.5,
    gammaB: 0.5,
    gainR: 0.5,
    gainG: 0.5,
    gainB: 0.5,
  };
}

function match1DWeighted(srcProj, srcWeights, refProj, refWeights, outTargetProj) {
  const nSrc = srcProj.length;
  const nRef = refProj.length;
  const srcIdx = new Int32Array(nSrc);
  const refIdx = new Int32Array(nRef);
  for (let i = 0; i < nSrc; i++) srcIdx[i] = i;
  for (let i = 0; i < nRef; i++) refIdx[i] = i;

  srcIdx.sort((a, b) => srcProj[a] - srcProj[b]);
  refIdx.sort((a, b) => refProj[a] - refProj[b]);

  const srcCdf = new Float32Array(nSrc);
  let accS = 0.0;
  for (let i = 0; i < nSrc; i++) {
    accS += Math.max(srcWeights[srcIdx[i]], 1e-6);
    srcCdf[i] = accS;
  }
  for (let i = 0; i < nSrc; i++) srcCdf[i] /= Math.max(accS, 1e-6);

  const refCdf = new Float32Array(nRef);
  let accR = 0.0;
  for (let i = 0; i < nRef; i++) {
    accR += Math.max(refWeights[refIdx[i]], 1e-6);
    refCdf[i] = accR;
  }
  for (let i = 0; i < nRef; i++) refCdf[i] /= Math.max(accR, 1e-6);

  let rPtr = 0;
  for (let i = 0; i < nSrc; i++) {
    const u = srcCdf[i];
    while (rPtr < nRef - 1 && refCdf[rPtr] < u) {
      rPtr++;
    }
    let mapped;
    if (rPtr === 0) {
      mapped = refProj[refIdx[0]];
    } else {
      const c0 = refCdf[rPtr - 1];
      const c1 = refCdf[rPtr];
      const t = clamp((u - c0) / Math.max(c1 - c0, 1e-6), 0.0, 1.0);
      const v0 = refProj[refIdx[rPtr - 1]];
      const v1 = refProj[refIdx[rPtr]];
      mapped = v0 + (v1 - v0) * t;
    }
    outTargetProj[srcIdx[i]] = mapped;
  }
}

function buildResidualLatticeTargets(G_sliders, refSamples, tgtSamples) {
  const baseR = new Float32Array(LATTICE_COUNT);
  const baseG = new Float32Array(LATTICE_COUNT);
  const baseB = new Float32Array(LATTICE_COUNT);
  const baseL = new Float32Array(LATTICE_COUNT);
  const baseA = new Float32Array(LATTICE_COUNT);
  const baseBLab = new Float32Array(LATTICE_COUNT);
  const nodeWeights = new Float32Array(LATTICE_COUNT);

  const tmpRgb = [0, 0, 0];
  const tmpLab = [0, 0, 0];

  let idx = 0;
  for (let ib = 0; ib < LATTICE_SIZE; ib++) {
    const b0 = ib / (LATTICE_SIZE - 1);
    for (let ig = 0; ig < LATTICE_SIZE; ig++) {
      const g0 = ig / (LATTICE_SIZE - 1);
      for (let ir = 0; ir < LATTICE_SIZE; ir++) {
        const r0 = ir / (LATTICE_SIZE - 1);
        gradeRGB(G_sliders, r0, g0, b0, tmpRgb);
        baseR[idx] = tmpRgb[0];
        baseG[idx] = tmpRgb[1];
        baseB[idx] = tmpRgb[2];
        rgbToOklab(tmpRgb[0], tmpRgb[1], tmpRgb[2], tmpLab);
        baseL[idx] = tmpLab[0];
        baseA[idx] = tmpLab[1];
        baseBLab[idx] = tmpLab[2];
        const chr = Math.hypot(tmpLab[1], tmpLab[2]);
        nodeWeights[idx] = computeIlluminantWeight(tmpLab[0], chr);
        idx++;
      }
    }
  }

  let srcL = baseL;
  let srcA = baseA;
  let srcB = baseBLab;
  let srcW = nodeWeights;
  let useSampleTransport = false;

  if (tgtSamples && tgtSamples.count >= 64) {
    useSampleTransport = true;
    const nT = tgtSamples.count;
    srcL = new Float32Array(nT);
    srcA = new Float32Array(nT);
    srcB = new Float32Array(nT);
    srcW = new Float32Array(nT);
    for (let i = 0; i < nT; i++) {
      gradeRGB(G_sliders, tgtSamples.r[i], tgtSamples.g[i], tgtSamples.b[i], tmpRgb);
      rgbToOklab(tmpRgb[0], tmpRgb[1], tmpRgb[2], tmpLab);
      srcL[i] = tmpLab[0];
      srcA[i] = tmpLab[1];
      srcB[i] = tmpLab[2];
      srcW[i] = tgtSamples.w[i];
    }
  }

  const nSrc = srcL.length;
  const curL = Float32Array.from(srcL);
  const curA = Float32Array.from(srcA);
  const curB = Float32Array.from(srcB);

  const dirs = [
    [1.0, 0.0, 0.0],
    [0.0, 1.0, 0.0],
    [0.0, 0.0, 1.0],
    [0.0, 0.70710678, 0.70710678],
    [0.0, 0.70710678, -0.70710678],
    [0.57735027, 0.57735027, 0.57735027],
    [0.57735027, 0.57735027, -0.57735027],
    [0.57735027, -0.57735027, 0.57735027],
    [0.57735027, -0.57735027, -0.57735027],
    [0.0, 0.8660254, 0.5],
    [0.0, 0.5, 0.8660254],
    [0.0, -0.5, 0.8660254],
  ];

  const srcProj = new Float32Array(nSrc);
  const refProj = new Float32Array(refSamples.count);
  const matchedProj = new Float32Array(nSrc);

  for (let pass = 0; pass < 2; pass++) {
    const stepGain = pass === 0 ? 0.28 : 0.22;
    for (let d = 0; d < dirs.length; d++) {
      const [ux, uy, uz] = dirs[d];
      for (let i = 0; i < nSrc; i++) {
        srcProj[i] = curL[i] * ux + curA[i] * uy + curB[i] * uz;
      }
      for (let j = 0; j < refSamples.count; j++) {
        refProj[j] =
          refSamples.L[j] * ux + refSamples.a[j] * uy + refSamples.bLab[j] * uz;
      }
      match1DWeighted(srcProj, srcW, refProj, refSamples.w, matchedProj);
      for (let i = 0; i < nSrc; i++) {
        const delta = (matchedProj[i] - srcProj[i]) * stepGain;
        curL[i] += delta * ux;
        curA[i] += delta * uy;
        curB[i] += delta * uz;
      }
    }
  }

  const otLatticeL = new Float32Array(LATTICE_COUNT);
  const otLatticeA = new Float32Array(LATTICE_COUNT);
  const otLatticeB = new Float32Array(LATTICE_COUNT);

  if (!useSampleTransport) {
    otLatticeL.set(curL);
    otLatticeA.set(curA);
    otLatticeB.set(curB);
  } else {
    const NBINS = 12;
    const binDL = new Float32Array(NBINS);
    const binDA = new Float32Array(NBINS);
    const binDB = new Float32Array(NBINS);
    const binW = new Float32Array(NBINS);
    for (let i = 0; i < nSrc; i++) {
      const bIdx = clamp(Math.floor(srcL[i] * (NBINS - 1)), 0, NBINS - 1);
      const w = srcW[i];
      binDL[bIdx] += w * (curL[i] - srcL[i]);
      binDA[bIdx] += w * (curA[i] - srcA[i]);
      binDB[bIdx] += w * (curB[i] - srcB[i]);
      binW[bIdx] += w;
    }
    for (let b = 0; b < NBINS; b++) {
      if (binW[b] > 1e-6) {
        binDL[b] /= binW[b];
        binDA[b] /= binW[b];
        binDB[b] /= binW[b];
      }
    }
    for (let i = 0; i < LATTICE_COUNT; i++) {
      const fBin = clamp(baseL[i] * (NBINS - 1), 0.0, NBINS - 1);
      const b0 = Math.floor(fBin);
      const b1 = Math.min(b0 + 1, NBINS - 1);
      const t = fBin - b0;
      const dL = binDL[b0] * (1.0 - t) + binDL[b1] * t;
      const dA = binDA[b0] * (1.0 - t) + binDA[b1] * t;
      const dB = binDB[b0] * (1.0 - t) + binDB[b1] * t;
      otLatticeL[i] = baseL[i] + dL;
      otLatticeA[i] = baseA[i] + dA;
      otLatticeB[i] = baseBLab[i] + dB;
    }
  }

  const targetR = new Float32Array(LATTICE_COUNT);
  const targetG = new Float32Array(LATTICE_COUNT);
  const targetB = new Float32Array(LATTICE_COUNT);

  for (let i = 0; i < LATTICE_COUNT; i++) {
    const L0 = baseL[i];
    const a0 = baseA[i];
    const b0 = baseBLab[i];
    const origChroma = Math.hypot(a0, b0);
    const origHue = Math.atan2(b0, a0);

    const Lot = otLatticeL[i];
    const aot = otLatticeA[i];
    const bot = otLatticeB[i];
    const otChroma = Math.hypot(aot, bot);
    const otHue = Math.atan2(bot, aot);

    let dHue = Math.atan2(Math.sin(otHue - origHue), Math.cos(otHue - origHue));
    dHue = clamp(dHue * (1.0 - HUE_RETENTION), -MAX_HUE_ROT_RAD, MAX_HUE_ROT_RAD);
    const finalHue = origHue + dHue;

    const neutralGate = smoothstep(0.012, 0.06, origChroma);
    const isNeutralHighlight = L0 > 0.70 && origChroma < 0.06;
    const hiNeutralMask =
      smoothstep(0.66, 0.74, L0) * (1.0 - smoothstep(0.015, 0.06, origChroma));
    const highlightChromaAtten = isNeutralHighlight
      ? 0.08
      : 1.0 - 0.88 * hiNeutralMask;

    const shadowToeMask = smoothstep(0.03, 0.22, L0);

    const dChroma = clamp(otChroma - origChroma, -0.055, 0.05) * 0.52 * neutralGate;
    const finalChroma = Math.max(
      0.0,
      (origChroma + dChroma) * highlightChromaAtten * shadowToeMask
    );

    const highlightLumaMask = 1.0 - 0.75 * smoothstep(0.80, 0.98, L0);
    const dL = clamp(Lot - L0, -0.065, 0.065) * 0.40 * shadowToeMask * highlightLumaMask;
    const finalL = clamp(L0 + dL, 0.0, 1.0);
    const rawA = finalChroma * Math.cos(finalHue);
    const rawB = finalChroma * Math.sin(finalHue);
    const abComp = [0, 0];
    compressOklabChroma(rawA, rawB, abComp);
    const finalA = abComp[0];
    const finalB = abComp[1];

    oklabToRgb(finalL, finalA, finalB, tmpRgb);
    targetR[i] = baseR[i] + (tmpRgb[0] - baseR[i]) * shadowToeMask;
    targetG[i] = baseG[i] + (tmpRgb[1] - baseG[i]) * shadowToeMask;
    targetB[i] = baseB[i] + (tmpRgb[2] - baseB[i]) * shadowToeMask;
  }

  return { baseR, baseG, baseB, baseL, baseA, baseBLab, targetR, targetG, targetB };
}

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

function fitZeroInterceptPoly3(lattice) {
  const { baseR, baseG, baseB, baseL, baseA, baseBLab, targetR, targetG, targetB } = lattice;
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
    const isDark = L < 0.12 ? 4.0 : 1.0;
    const isBrightNeutral = L > 0.70 && chr < 0.06 ? 4.5 : 1.0;
    const w = isNeutral * isDark * isBrightNeutral;

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
    const lambda = i < 3 ? 28.0 : i < 9 ? 140.0 : 320.0;
    AtA[i * N + i] += lambda;
    if (i === 0) AtYR[0] += lambda * 1.0;
    if (i === 1) AtYG[1] += lambda * 1.0;
    if (i === 2) AtYB[2] += lambda * 1.0;
  }

  const c19R = solveLinearSystem(AtA, AtYR, N);
  const c19G = solveLinearSystem(AtA, AtYG, N);
  const c19B = solveLinearSystem(AtA, AtYB, N);

  const polyR = new Array(20);
  const polyG = new Array(20);
  const polyB = new Array(20);
  polyR[0] = 0.0;
  polyG[0] = 0.0;
  polyB[0] = 0.0;
  for (let i = 0; i < N; i++) {
    polyR[i + 1] = c19R[i];
    polyG[i + 1] = c19G[i];
    polyB[i + 1] = c19B[i];
  }

  return { polyR, polyG, polyB };
}

function hueSectorWeight(h, center) {
  const d = Math.atan2(Math.sin(h - center), Math.cos(h - center));
  const w = clamp(1.0 - Math.abs(d) / 1.04719755, 0.0, 1.0);
  return w * w * (3.0 - 2.0 * w);
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

function fitResidualHue6(lattice, polyR, polyG, polyB) {
  const { baseR, baseG, baseB, targetR, targetG, targetB } = lattice;
  const sumW = new Float64Array(6);
  const sumHue = new Float64Array(6);
  const sumSat = new Float64Array(6);
  const sumLum = new Float64Array(6);

  for (let i = 0; i < LATTICE_COUNT; i++) {
    const r = baseR[i];
    const g = baseG[i];
    const b = baseB[i];
    const pr = clamp(evalPoly19(polyR, r, g, b), 0.0, 1.15);
    const pg = clamp(evalPoly19(polyG, r, g, b), 0.0, 1.15);
    const pb = clamp(evalPoly19(polyB, r, g, b), 0.0, 1.15);

    const y0 = 0.2126 * pr + 0.7152 * pg + 0.0722 * pb;
    const c1 = pr - y0;
    const c2 = pb - y0;
    const chr = Math.hypot(c1, c2);
    if (chr < 0.05 || y0 < 0.12 || y0 > 0.85) continue;

    const tr = targetR[i];
    const tg = targetG[i];
    const tb = targetB[i];
    const ty = 0.2126 * tr + 0.7152 * tg + 0.0722 * tb;
    const tc1 = tr - ty;
    const tc2 = tb - ty;
    const tChr = Math.hypot(tc1, tc2);

    const h0 = Math.atan2(c2, c1);
    const hT = Math.atan2(tc2, tc1);
    const dHue = clamp(Math.atan2(Math.sin(hT - h0), Math.cos(hT - h0)), -0.35, 0.35);
    const dSat = clamp((tChr - chr) / Math.max(chr, 0.05), -0.45, 0.45);
    const dLum = clamp((ty - y0) / 0.24, -0.30, 0.30);

    const gate =
      smoothstep(0.05, 0.14, chr) *
      smoothstep(0.12, 0.25, y0) *
      (1.0 - smoothstep(0.70, 0.88, y0));

    for (let s = 0; s < 6; s++) {
      const sw = hueSectorWeight(h0, HUE_CENTERS[s]) * gate;
      if (sw <= 1e-4) continue;
      sumW[s] += sw;
      sumHue[s] += sw * dHue;
      sumSat[s] += sw * dSat;
      sumLum[s] += sw * dLum;
    }
  }

  const hueShift = IDENTITY_HUE6.slice();
  const hueSat = IDENTITY_HUE6.slice();
  const hueLuma = IDENTITY_HUE6.slice();
  const ridge = 45.0;

  for (let s = 0; s < 6; s++) {
    const denom = sumW[s] + ridge;
    hueShift[s] = clamp(sumHue[s] / denom, -0.22, 0.22);
    hueSat[s] = clamp(sumSat[s] / denom, -0.28, 0.28);
    hueLuma[s] = clamp(sumLum[s] / denom, -0.18, 0.18);
  }

  return { hueShift, hueSat, hueLuma };
}

export function analyzeEngineV3(refView, tgtView, options = {}) {
  const {
    numPixels = 0,
    targetNumPixels = 0,
    autoNormalizeTarget = false,
    inputProfile = "rec709",
    onStage,
  } = options;
  if (typeof onStage === "function") {
    onStage("Sampling illuminant-weighted OKLab distribution...");
  }

  let effectiveTgtView = tgtView;
  let effectiveTgtN = targetNumPixels;
  let normStats = null;
  if (effectiveTgtView && effectiveTgtN > 0) {
    const needsLog = isLogProfileActive(inputProfile);
    if (needsLog || autoNormalizeTarget) {
      const sampled = strideSampleRgba(effectiveTgtView, effectiveTgtN, 3072);
      effectiveTgtView = sampled.data;
      effectiveTgtN = sampled.numPixels;
      if (needsLog) {
        effectiveTgtView = applyLogProfileToRgba(effectiveTgtView, effectiveTgtN, inputProfile);
      }
      if (autoNormalizeTarget) {
        if (typeof onStage === "function") {
          onStage("Auto-normalizing target exposure & white balance...");
        }
        const norm = autoNormalizeTargetPixels(effectiveTgtView, effectiveTgtN);
        effectiveTgtView = norm.data;
        effectiveTgtN = norm.numPixels;
        normStats = norm.normStats;
      }
    }
  }

  const refSamples = extractSamples(refView, numPixels, 2048);
  const tgtSamples =
    effectiveTgtView && effectiveTgtN > 0
      ? extractSamples(effectiveTgtView, effectiveTgtN, 2048)
      : null;

  const refStats = computeStats(refSamples);
  const tgtStats = tgtSamples ? computeStats(tgtSamples) : null;

  if (typeof onStage === "function") {
    onStage("Computing damped primary sliders...");
  }

  const sliderParams = computeDampedSlidersV3(refStats, tgtStats);
  const G_sliders = prepareGrade({ ...sliderParams, autoGradeMix: 0.0 });

  if (typeof onStage === "function") {
    onStage("Mapping 17^3 lattice via Hue-Preserving Optimal Transport...");
  }

  const lattice = buildResidualLatticeTargets(G_sliders, refSamples, tgtSamples);

  if (typeof onStage === "function") {
    onStage("Fitting zero-intercept Poly-3 & 6-sector hue residuals...");
  }

  const { polyR, polyG, polyB } = fitZeroInterceptPoly3(lattice);
  const { hueShift, hueSat, hueLuma } = fitResidualHue6(lattice, polyR, polyG, polyB);

  const combined = normStats
    ? applyTargetAutoNormalizeOffsets(sliderParams, normStats)
    : sliderParams;

  return sanitizeParams({
    ...combined,
    autoGradeMix: 1.0,
    polyR,
    polyG,
    polyB,
    hueShift,
    hueSat,
    hueLuma,
  });
}

// Photographic calibration sample set covering deep shadows, neutral ramp,
// skin tones, foliage, sky blues, warm highlights, and a 6^3 perceptual cube.
export function buildLutCalibrationPixels(targetRgba = null, targetNumPixels = 0) {
  const triplets = [];

  // 1. Neutral ramp (65 steps + extra deep-shadow & highlight stops)
  for (let i = 0; i <= 64; i++) {
    const v = i / 64;
    triplets.push([v, v, v]);
  }
  for (const v of [0.01, 0.02, 0.03, 0.05, 0.07, 0.90, 0.94, 0.97, 0.99]) {
    triplets.push([v, v, v]);
  }

  // 2. Photographic swatches: skin tones, foliage, sky blues, warm tungsten, speculars
  const swatches = [
    // Skin tones (fair -> deep)
    [0.92, 0.78, 0.70], [0.85, 0.67, 0.56], [0.76, 0.57, 0.45],
    [0.64, 0.45, 0.34], [0.50, 0.33, 0.24], [0.35, 0.22, 0.16],
    [0.78, 0.62, 0.48], [0.68, 0.52, 0.40],
    // Foliage & greens
    [0.16, 0.28, 0.12], [0.24, 0.42, 0.18], [0.36, 0.54, 0.24],
    [0.45, 0.52, 0.22], [0.10, 0.22, 0.14], [0.20, 0.46, 0.34],
    // Sky blues & cyans
    [0.14, 0.28, 0.54], [0.24, 0.46, 0.76], [0.42, 0.66, 0.88],
    [0.64, 0.80, 0.94], [0.16, 0.48, 0.58], [0.28, 0.64, 0.72],
    // Warm highlights & golden hour
    [0.96, 0.86, 0.68], [0.92, 0.72, 0.42], [0.86, 0.54, 0.26],
    [0.74, 0.34, 0.18], [0.98, 0.95, 0.88],
  ];
  for (const sw of swatches) {
    triplets.push(sw);
  }

  // 3. 6x6x6 perceptual RGB cube
  for (let b = 0; b < 6; b++) {
    for (let g = 0; g < 6; g++) {
      for (let r = 0; r < 6; r++) {
        triplets.push([r / 5, g / 5, b / 5]);
      }
    }
  }

  // 4. Optional live Target image samples (up to 1024 pixels)
  if (targetRgba && targetNumPixels > 0) {
    const maxTarget = 1024;
    const step = Math.max(1, Math.floor(targetNumPixels / maxTarget));
    for (let i = 0; i < targetNumPixels; i += step) {
      const idx = i * 4;
      if (targetRgba[idx + 3] < 16) continue;
      triplets.push([
        targetRgba[idx] / 255.0,
        targetRgba[idx + 1] / 255.0,
        targetRgba[idx + 2] / 255.0,
      ]);
    }
  }

  return triplets;
}

// Matches a parsed 3D/1D LUT via Polaris v3 PRO using exact LUT-transformed
// pixel pairs (sourcePixels, lutGradedPixels) for .kfplug / slider export.
export function fitPolarisV3ToLut(
  lut,
  targetRgba = null,
  targetNumPixels = 0,
  onStage = null
) {
  const sampleLut = makeLutSampler(lut);
  const triplets = buildLutCalibrationPixels(targetRgba, targetNumPixels);
  const n = triplets.length;
  const sourceRgba = new Uint8ClampedArray(n * 4);
  const lutGradedRgba = new Uint8ClampedArray(n * 4);
  const out = [0, 0, 0];

  for (let i = 0; i < n; i++) {
    const [r, g, b] = triplets[i];
    const off = i * 4;
    sourceRgba[off] = Math.round(clamp(r, 0, 1) * 255);
    sourceRgba[off + 1] = Math.round(clamp(g, 0, 1) * 255);
    sourceRgba[off + 2] = Math.round(clamp(b, 0, 1) * 255);
    sourceRgba[off + 3] = 255;

    sampleLut(r, g, b, out);
    lutGradedRgba[off] = Math.round(clamp(out[0], 0, 1) * 255);
    lutGradedRgba[off + 1] = Math.round(clamp(out[1], 0, 1) * 255);
    lutGradedRgba[off + 2] = Math.round(clamp(out[2], 0, 1) * 255);
    lutGradedRgba[off + 3] = 255;
  }

  const params = analyzeEngineV3(lutGradedRgba, sourceRgba, {
    numPixels: n,
    targetNumPixels: n,
    autoNormalizeTarget: false,
    inputProfile: "rec709",
    onStage,
  });

  return { params, rms: null };
}
