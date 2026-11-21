// Altair 4.5 Refresh — Built Directly on Top of Altair 4.0's Proven Single-Pass Core
// with Pre-Stage Source Normalize, Cross-Tone Compatibility Guards, Smooth OKLab
// Skin Protect (18°-58°), Deterministic Halton Sampling & 32^3 Tetrahedral LUT Bake.
//
// Single-Pass Zero Double-Application Architecture (1:1 with Altair 4.0):
//   - Primary, 3-Way Wheels, Zero-Intercept Cubic Poly3, and Hue 6V are solved in a
//     single unified grade parameter set (`params`), then baked directly into the
//     universal 32^3 (98,304 float32) Tetrahedral LUT via `bakeParamsToLut32()`.
//   - WebGL preview, .cube, and .kfplug evaluate the 32^3 LUT with `applyPostGrade: false`
//     (zero double-application), and manual slider tweaks transition seamlessly with
//     zero visual pop.
//
// Targeted Upgrades over Altair 4.0:
//   1. Pre-Stage Source Normalize (`normalizeWeight: 0..1`):
//      Midtone-weighted (`w = 4 * L * (1 - L)`) OKLab WB cast neutralization (capped
//      at `maxCast = 0.035`) and gentle `±0.06` median luma pivot before Altair 4.0's
//      core matching math.
//   2. Cross-Tone Compatibility Guard (`sigmaWeight: 0..1`):
//      - Black-Floor & Contrast Lock: `contrast in [0.98, 1.24]`, `exposure <= +0.10`,
//        `highlights in [-0.14, +0.16]`, `shadows in [-0.16, +0.04]`, deep shadows
//        (`L -> 0`) pinned so Black Floor stays grounded (~1.5-3.5 IRE).
//      - Richer Split-Toning & Anti-Tint Guard: global `temp in [-0.24, +0.24]`,
//        `tint in [-0.022, +0.026]`, `Gamma/Gain` wheel chroma offsets `<= 0.036`,
//        `Lift` wheel chroma offsets `<= 0.018`, plus neutral steel & olive-drab separation.
//   3. Smooth OKLab Skin Protect (`skinProtect: 0..1`, hue 18°-58°) + Deterministic
//      Halton Sampling + 32^3 Tetrahedral LUT Bake.

import {
  getStandardCube,
  bakeParamsToLut32,
} from "./lut3d.ts";
import {
  clamp,
  clamp01,
  oklabToGamutSafeSrgb,
} from "./colorSpace.ts";
import { applyLogProfileToRgba, isLogProfileActive } from "../utils/logProfiles.js";
import {
  DEFAULT_PARAMS,
  sanitizeParams,
} from "../utils/gradeEngine.js";
import {
  buildAltairDualSpaceSamplesFromRgb,
  buildNominalNeutralAltairSamples,
  solveAltairRefreshCore,
} from "../utils/altairV4Engine.js";

export interface TwoStageSolveOptions {
  normalizeWeight?: number; // 0..1 (default 1.0)
  sigmaWeight?: number; // 0..1 (default 1.0)
  skinProtect?: number; // 0..1 (default 0.75)
  inputProfile?: string;
  onStage?: (stageText: string) => void;
}

export interface ZoneStats {
  meanA: number;
  meanB: number;
  stdA: number;
  stdB: number;
  weight: number;
}

export interface TwoStageSolveResult {
  lut32: Float32Array;
  params: Record<string, unknown>;
  bakeMs: number;
  normalizeWeight: number;
  sigmaWeight: number;
  stage1Stats: {
    wbA: number;
    wbB: number;
    L10: number;
    L50: number;
    L90: number;
    targetL50: number;
  };
  stage2Stats: {
    shadows: ZoneStats;
    midtones: ZoneStats;
    highlights: ZoneStats;
  };
}

interface DualSpaceSamples {
  count: number;
  r: Float32Array;
  g: Float32Array;
  b: Float32Array;
  linY: Float32Array;
  L: Float32Array;
  a: Float32Array;
  bLab: Float32Array;
  covW: Float32Array;
  wbW: Float32Array;
  skinW: Float32Array;
}

interface Stage1Model {
  normW: number;
  wbA: number;
  wbB: number;
  L10: number;
  L50: number;
  L90: number;
  targetL50: number;
  deltaL50: number;
  gamma: number;
  applyOklab: (L0: number, a0: number, b0: number, out: number[]) => void;
}

const MAX_HALTON_SAMPLES = 3072;
const MAX_NORM_CAST = 0.035;
const MAX_NORM_LUMA_PIVOT = 0.06;
const STAGE1_PIVOT_TARGET = 0.50;
const SCRATCH_HIST_256 = new Uint32Array(256);
const PROBS_10_50_90 = [0.10, 0.50, 0.90] as const;

function smoothstep(edge0: number, edge1: number, x: number): number {
  const denom = edge1 - edge0;
  if (Math.abs(denom) < 1e-6) return x < edge0 ? 0.0 : 1.0;
  const t = clamp01((x - edge0) / denom);
  return t * t * (3.0 - 2.0 * t);
}

/**
 * Deterministic low-discrepancy Halton radical-inverse sequence (zero Math.random()).
 */
function halton(index: number, base: number): number {
  let f = 1.0;
  let r = 0.0;
  let i = index;
  while (i > 0) {
    f /= base;
    r += f * (i % base);
    i = Math.floor(i / base);
  }
  return r;
}

/**
 * Neutrality envelope `env(L) = sin(pi * clamp(L, 0, 1))^1.6`.
 * Guarantees pure black (L = 0) and pure white (L = 1) remain 100% neutral.
 */
export function neutralityEnvelope(L: number): number {
  const c = clamp01(L);
  if (c <= 0.0 || c >= 1.0) return 0.0;
  return Math.pow(Math.sin(Math.PI * c), 1.6);
}

function extractHistogramPercentiles(
  values: Float32Array,
  probs: readonly number[],
  out: number[]
): void {
  const n = values.length;
  if (n < 2) {
    for (let k = 0; k < probs.length; k++) out[k] = probs[k];
    return;
  }
  SCRATCH_HIST_256.fill(0);
  for (let i = 0; i < n; i++) {
    const v = values[i];
    const bin = v <= 0.0 ? 0 : v >= 1.0 ? 255 : (v * 255.0) | 0;
    SCRATCH_HIST_256[bin]++;
  }
  let acc = 0;
  let bin = 0;
  for (let k = 0; k < probs.length; k++) {
    const target = Math.max(1, Math.min(n, Math.round(probs[k] * n)));
    while (bin < 255 && acc + SCRATCH_HIST_256[bin] < target) {
      acc += SCRATCH_HIST_256[bin];
      bin++;
    }
    const count = SCRATCH_HIST_256[bin];
    const frac = count > 0 ? clamp01((target - acc) / count) : 0.5;
    out[k] = clamp01((bin + frac) / 256.0);
  }
}

/**
 * Deterministic Halton (base 2) RGBA sampler -> Altair 4.0 DualSpaceSamples.
 * Applies optional Camera Log input transform on the sampled subset only.
 */
function extractHaltonDualSpaceSamples(
  rgba: Uint8ClampedArray,
  totalPixels: number,
  inputProfile = "rec709"
): DualSpaceSamples {
  const n = totalPixels > 0 ? totalPixels : rgba.length >> 2;
  const targetCount = Math.min(MAX_HALTON_SAMPLES, n);
  const useLog = isLogProfileActive(inputProfile);

  let sampledRgba: Uint8ClampedArray;
  let sampledCount: number;

  if (n <= targetCount) {
    sampledRgba = useLog ? applyLogProfileToRgba(rgba, n, inputProfile) : rgba;
    sampledCount = n;
  } else {
    const buf = new Uint8ClampedArray(targetCount * 4);
    for (let s = 0; s < targetCount; s++) {
      const p = Math.min(n - 1, Math.floor(halton(s + 1, 2) * n));
      const src = p << 2;
      const dst = s << 2;
      buf[dst] = rgba[src];
      buf[dst + 1] = rgba[src + 1];
      buf[dst + 2] = rgba[src + 2];
      buf[dst + 3] = rgba[src + 3];
    }
    sampledRgba = useLog ? applyLogProfileToRgba(buf, targetCount, inputProfile) : buf;
    sampledCount = targetCount;
  }

  const rArr = new Float32Array(sampledCount);
  const gArr = new Float32Array(sampledCount);
  const bArr = new Float32Array(sampledCount);
  let count = 0;

  for (let i = 0; i < sampledCount; i++) {
    const idx = i << 2;
    if (sampledRgba[idx + 3] < 16) continue;
    rArr[count] = sampledRgba[idx] / 255.0;
    gArr[count] = sampledRgba[idx + 1] / 255.0;
    bArr[count] = sampledRgba[idx + 2] / 255.0;
    count++;
  }

  return buildAltairDualSpaceSamplesFromRgb(
    rArr.subarray(0, count),
    gArr.subarray(0, count),
    bArr.subarray(0, count)
  ) as DualSpaceSamples;
}

const NOMINAL_NEUTRAL_SAMPLES: DualSpaceSamples =
  buildNominalNeutralAltairSamples() as DualSpaceSamples;

// Single-entry cache for responsive interactive slider drags
let cachedSampleEntry: {
  refData: Uint8ClampedArray | null;
  refPixels: number;
  tgtData: Uint8ClampedArray | null;
  tgtPixels: number;
  inputProfile: string;
  hasRealTarget: boolean;
  refSamples: DualSpaceSamples;
  rawSrcSamples: DualSpaceSamples;
} | null = null;

function getOrExtractSamples(
  refData: Uint8ClampedArray,
  refPixels: number,
  tgtData: Uint8ClampedArray | null,
  tgtPixels: number,
  inputProfile: string
): {
  refSamples: DualSpaceSamples;
  rawSrcSamples: DualSpaceSamples;
  hasRealTarget: boolean;
} {
  if (
    cachedSampleEntry &&
    cachedSampleEntry.refData === refData &&
    cachedSampleEntry.refPixels === refPixels &&
    cachedSampleEntry.tgtData === tgtData &&
    cachedSampleEntry.tgtPixels === tgtPixels &&
    cachedSampleEntry.inputProfile === inputProfile
  ) {
    return {
      refSamples: cachedSampleEntry.refSamples,
      rawSrcSamples: cachedSampleEntry.rawSrcSamples,
      hasRealTarget: cachedSampleEntry.hasRealTarget,
    };
  }

  const refSamples = extractHaltonDualSpaceSamples(refData, refPixels, "rec709");
  const hasRealTarget = Boolean(tgtData && (tgtPixels >= 16 || tgtData.length >= 64));
  const rawSrcSamples = hasRealTarget
    ? extractHaltonDualSpaceSamples(tgtData as Uint8ClampedArray, tgtPixels, inputProfile)
    : NOMINAL_NEUTRAL_SAMPLES;

  cachedSampleEntry = {
    refData,
    refPixels,
    tgtData,
    tgtPixels,
    inputProfile,
    hasRealTarget,
    refSamples,
    rawSrcSamples,
  };
  return { refSamples, rawSrcSamples, hasRealTarget };
}

// ---------------------------------------------------------------------------
// Upgrade 1 — Pre-Stage Source Normalize (`normalizeWeight: 0..1`)
//   - Midtone weight: w = 4 * L * (1 - L)
//   - OKLab WB cast cap: maxCast = 0.035
//   - Median luma pivot cap: ±0.06 (toe-pinned so deep blacks stay grounded)
// ---------------------------------------------------------------------------
function fitStage1Normalize(
  rawSrc: DualSpaceSamples,
  normalizeWeight: number,
  hasRealTarget: boolean
): Stage1Model {
  const normW = hasRealTarget ? clamp01(normalizeWeight) : 0.0;
  const n = rawSrc.count;

  const identityApply = (L0: number, a0: number, b0: number, out: number[]): void => {
    out[0] = L0;
    out[1] = a0;
    out[2] = b0;
  };

  if (n < 8 || normW <= 1e-5) {
    return {
      normW: 0.0,
      wbA: 0.0,
      wbB: 0.0,
      L10: 0.1,
      L50: STAGE1_PIVOT_TARGET,
      L90: 0.9,
      targetL50: STAGE1_PIVOT_TARGET,
      deltaL50: 0.0,
      gamma: 1.0,
      applyOklab: identityApply,
    };
  }

  // Exact midtone-weighted white-balance cast estimator: w = 4 * L * (1 - L)
  let sumW = 0.0;
  let sumA = 0.0;
  let sumB = 0.0;
  for (let i = 0; i < n; i++) {
    const L = clamp01(rawSrc.L[i]);
    const w = 4.0 * L * (1.0 - L);
    if (w <= 1e-6) continue;
    sumW += w;
    sumA += w * rawSrc.a[i];
    sumB += w * rawSrc.bLab[i];
  }

  const rawCastA = sumW > 1e-6 ? sumA / sumW : 0.0;
  const rawCastB = sumW > 1e-6 ? sumB / sumW : 0.0;
  const castMag = Math.hypot(rawCastA, rawCastB);
  const castScale = castMag > MAX_NORM_CAST ? MAX_NORM_CAST / castMag : 1.0;

  const wbA = clamp(rawCastA * castScale, -MAX_NORM_CAST, MAX_NORM_CAST) * normW;
  const wbB = clamp(rawCastB * castScale, -MAX_NORM_CAST, MAX_NORM_CAST) * normW;

  const pct = [0.1, 0.5, 0.9];
  extractHistogramPercentiles(rawSrc.L, PROBS_10_50_90, pct);
  const L10 = pct[0];
  const L50 = pct[1];
  const L90 = pct[2];

  // Gentle ±0.06 median luma pivot blended by normalizeWeight
  const clampedL50 = clamp(L50, 0.12, 0.88);
  const deltaL50 =
    clamp(STAGE1_PIVOT_TARGET - clampedL50, -MAX_NORM_LUMA_PIVOT, MAX_NORM_LUMA_PIVOT) *
    normW;
  const targetL50 = clamp(clampedL50 + deltaL50, 0.12, 0.88);
  const gamma = clamp(Math.log(targetL50) / Math.log(clampedL50), 0.78, 1.32);

  const applyOklab = (L0: number, a0: number, b0: number, out: number[]): void => {
    const cL = clamp01(L0);
    // Midtone weight w = 4 * L * (1 - L) pins black (L=0) and white (L=1) at 0
    const env = 4.0 * cL * (1.0 - cL);

    let L1 = cL;
    if (cL > 1e-5 && cL < 0.99999 && Math.abs(gamma - 1.0) > 1e-5) {
      const powL = Math.pow(cL, gamma);
      const delta = powL - cL;
      if (delta > 0.0) {
        // Toe-protected positive lift keeps deep blacks grounded (~2-4 IRE)
        const toeGuard = smoothstep(0.06, 0.28, cL);
        L1 = clamp01(cL + delta * toeGuard);
      } else {
        L1 = clamp01(cL + delta * smoothstep(0.02, 0.12, cL));
      }
    }

    let a1 = a0 - wbA * env;
    // Sign-preserving guard: olive-drab / green pixels never flip across a = 0 into pink
    if (a0 < -0.002 && a1 > 0.0) {
      a1 = 0.0;
    }
    const b1 = b0 - wbB * env;

    out[0] = L1;
    out[1] = a1;
    out[2] = b1;
  };

  return {
    normW,
    wbA,
    wbB,
    L10,
    L50,
    L90,
    targetL50,
    deltaL50,
    gamma,
    applyOklab,
  };
}

function buildNormalizedSourceSamples(
  rawSrc: DualSpaceSamples,
  stage1: Stage1Model
): DualSpaceSamples {
  if (stage1.normW <= 1e-5) return rawSrc;

  const n = rawSrc.count;
  const rArr = new Float32Array(n);
  const gArr = new Float32Array(n);
  const bArr = new Float32Array(n);
  const nLab = [0, 0, 0];
  const srgb = [0, 0, 0];

  for (let i = 0; i < n; i++) {
    stage1.applyOklab(rawSrc.L[i], rawSrc.a[i], rawSrc.bLab[i], nLab);
    oklabToGamutSafeSrgb(nLab[0], nLab[1], nLab[2], srgb, 0, 0.0);
    rArr[i] = srgb[0];
    gArr[i] = srgb[1];
    bArr[i] = srgb[2];
  }

  return buildAltairDualSpaceSamplesFromRgb(rArr, gArr, bArr) as DualSpaceSamples;
}

// ---------------------------------------------------------------------------
// Main Entry Point: Altair 4.5 Refresh (Altair 4.0 Core + Upgrades 1-3 + 32^3 LUT)
// ---------------------------------------------------------------------------
export function solveTwoStageLut32(
  refData: Uint8ClampedArray,
  refPixels: number,
  tgtData: Uint8ClampedArray | null,
  tgtPixels: number,
  options: TwoStageSolveOptions = {}
): TwoStageSolveResult {
  const t0 = typeof performance !== "undefined" ? performance.now() : Date.now();

  const normalizeWeight = clamp01(
    options.normalizeWeight !== undefined ? options.normalizeWeight : 1.0
  );
  const sigmaWeight = clamp01(
    options.sigmaWeight !== undefined ? options.sigmaWeight : 1.0
  );
  const skinProtect = clamp01(
    options.skinProtect !== undefined ? options.skinProtect : 0.75
  );
  const inputProfile = options.inputProfile || "rec709";

  // Exact identity fast path when both stages are dialed to 0% (ΔE = 0.00)
  if (normalizeWeight <= 1e-5 && sigmaWeight <= 1e-5) {
    const lut32 = new Float32Array(getStandardCube());
    const t1 = typeof performance !== "undefined" ? performance.now() : Date.now();
    const emptyZone: ZoneStats = { meanA: 0, meanB: 0, stdA: 0, stdB: 0, weight: 0 };
    return {
      lut32,
      params: sanitizeParams({ ...DEFAULT_PARAMS, autoGradeMix: 0.0, filmicShoulder: 0.0 }),
      bakeMs: t1 - t0,
      normalizeWeight: 0,
      sigmaWeight: 0,
      stage1Stats: {
        wbA: 0,
        wbB: 0,
        L10: 0.1,
        L50: STAGE1_PIVOT_TARGET,
        L90: 0.9,
        targetL50: STAGE1_PIVOT_TARGET,
      },
      stage2Stats: {
        shadows: emptyZone,
        midtones: emptyZone,
        highlights: emptyZone,
      },
    };
  }

  options.onStage?.("Stage 1: Halton sampling & Source Normalize pre-stage...");
  const { refSamples, rawSrcSamples, hasRealTarget } = getOrExtractSamples(
    refData,
    refPixels,
    tgtData,
    tgtPixels,
    inputProfile
  );

  // Upgrade 1: Pre-Stage Source Normalize (w = 4*L*(1-L), maxCast = 0.035, ±0.06 L50 pivot)
  const stage1 = fitStage1Normalize(rawSrcSamples, normalizeWeight, hasRealTarget);
  const normSrcSamples = buildNormalizedSourceSamples(rawSrcSamples, stage1);

  // Upgrades 2 & 3 on top of Altair 4.0's exact proven single-pass core solver
  const { params, refStats } = solveAltairRefreshCore({
    refSamples,
    rawSrcSamples,
    normSrcSamples,
    stage1,
    normalizeWeight,
    sigmaWeight,
    skinProtect,
    hasRealTarget,
    onStage: options.onStage,
  });

  // Single-pass 32^3 (98,304 float32) Tetrahedral LUT bake directly from `params`
  // (exact same path as Altair 4.0 -> zero double-application & zero slider-edit pop)
  options.onStage?.("Baking universal 32³ Tetrahedral LUT...");
  const lut32 = bakeParamsToLut32(params, "rec709");

  const t1 = typeof performance !== "undefined" ? performance.now() : Date.now();

  const makeZone = (ab: [number, number]): ZoneStats => ({
    meanA: ab ? ab[0] : 0,
    meanB: ab ? ab[1] : 0,
    stdA: 0.03,
    stdB: 0.03,
    weight: 1,
  });

  return {
    lut32,
    params,
    bakeMs: t1 - t0,
    normalizeWeight,
    sigmaWeight,
    stage1Stats: {
      wbA: stage1.wbA,
      wbB: stage1.wbB,
      L10: stage1.L10,
      L50: stage1.L50,
      L90: stage1.L90,
      targetL50: stage1.targetL50,
    },
    stage2Stats: {
      shadows: makeZone(refStats.shadowAB),
      midtones: makeZone(refStats.midAB),
      highlights: makeZone(refStats.highAB),
    },
  };
}
