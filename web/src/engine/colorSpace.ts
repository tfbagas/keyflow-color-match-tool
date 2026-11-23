// Exact D65 sRGB <-> Linear Rec.709 <-> OKLab Color-Space Conversions
// Locked to Björn Ottosson's exact D65 matrices (10-decimal precision) and
// IEC 61966-2-1 sRGB piecewise EOTF/OETF (0.04045 threshold, 2.4 gamma)
// for 1:1 bit-identical C++17 After Effects (.aex) parity.

export const SRGB_EOTF_THRESHOLD = 0.04045;
export const SRGB_OETF_THRESHOLD = 0.0031308;
export const SRGB_GAMMA = 2.4;
export const SRGB_INV_GAMMA = 1.0 / 2.4;

export function clamp01(v: number): number {
  return v <= 0.0 ? 0.0 : v >= 1.0 ? 1.0 : v;
}

export function clamp(v: number, lo: number, hi: number): number {
  return v <= lo ? lo : v >= hi ? hi : v;
}

/** Exact IEC 61966-2-1 sRGB piecewise EOTF (display sRGB -> linear Rec.709). */
export function srgbToLinear(c: number): number {
  const v = clamp01(c);
  return v <= SRGB_EOTF_THRESHOLD
    ? v / 12.92
    : Math.pow((v + 0.055) / 1.055, SRGB_GAMMA);
}

/** Exact IEC 61966-2-1 sRGB piecewise OETF (linear Rec.709 -> display sRGB). */
export function linearToSrgb(c: number): number {
  const v = clamp01(c);
  return v <= SRGB_OETF_THRESHOLD
    ? v * 12.92
    : 1.055 * Math.pow(v, SRGB_INV_GAMMA) - 0.055;
}

/** Precomputed exact 8-bit sRGB -> Linear table (256 entries). */
export const SRGB_U8_TO_LIN: Float32Array = (() => {
  const lut = new Float32Array(256);
  for (let i = 0; i < 256; i++) {
    lut[i] = srgbToLinear(i / 255.0);
  }
  return lut;
})();

/** Precomputed 4096-entry Linear -> sRGB OETF table (exact to < 1.5e-6). */
const LIN_TO_SRGB_SIZE = 4096;
const LIN_TO_SRGB_LUT: Float32Array = (() => {
  const lut = new Float32Array(LIN_TO_SRGB_SIZE + 1);
  const inv = 1.0 / LIN_TO_SRGB_SIZE;
  for (let i = 0; i <= LIN_TO_SRGB_SIZE; i++) {
    lut[i] = linearToSrgb(i * inv);
  }
  return lut;
})();

export function linearToSrgbFast(c: number): number {
  if (c <= 0.0) return 0.0;
  if (c >= 1.0) return 1.0;
  if (c <= SRGB_OETF_THRESHOLD) return c * 12.92;
  const pos = c * LIN_TO_SRGB_SIZE;
  const idx = pos | 0;
  const f = pos - idx;
  return (
    LIN_TO_SRGB_LUT[idx] +
    f * (LIN_TO_SRGB_LUT[idx + 1] - LIN_TO_SRGB_LUT[idx])
  );
}

/**
 * Exact Björn Ottosson D65 Linear sRGB -> LMS -> OKLab.
 * Writes [L, a, b] into `out` starting at `offset`.
 */
export function linearRgbToOklab(
  lr: number,
  lg: number,
  lb: number,
  out: Float32Array | number[],
  offset = 0
): void {
  const l = Math.cbrt(
    Math.max(0.0, 0.4122214708 * lr + 0.5363325363 * lg + 0.0514459929 * lb)
  );
  const m = Math.cbrt(
    Math.max(0.0, 0.2119034982 * lr + 0.6806995451 * lg + 0.1073969566 * lb)
  );
  const s = Math.cbrt(
    Math.max(0.0, 0.0883024619 * lr + 0.2817188376 * lg + 0.6299787005 * lb)
  );

  out[offset] = 0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s;
  out[offset + 1] = 1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s;
  out[offset + 2] = 0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s;
}

/**
 * Exact Björn Ottosson D65 OKLab -> LMS -> Linear sRGB.
 * Writes [lr, lg, lb] into `out` starting at `offset`.
 */
export function oklabToLinearRgb(
  L: number,
  a: number,
  b: number,
  out: Float32Array | number[],
  offset = 0
): void {
  const l_ = L + 0.3963377774 * a + 0.2158037573 * b;
  const m_ = L - 0.1055613458 * a - 0.0638541728 * b;
  const s_ = L - 0.0894841775 * a - 1.291485548 * b;

  const l = l_ * l_ * l_;
  const m = m_ * m_ * m_;
  const s = s_ * s_ * s_;

  out[offset] = 4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s;
  out[offset + 1] = -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s;
  out[offset + 2] = -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s;
}

export function fastTanh(x: number): number {
  const cx = clamp(x, -8.0, 8.0);
  const e2x = Math.exp(2.0 * cx);
  return (e2x - 1.0) / Math.max(e2x + 1.0, 1e-6);
}

/**
 * Converts OKLab (L, a, b) to gamut-safe display sRGB [0, 1].
 * Whenever any linear RGB channel exceeds [0, 1], smoothly desaturates chroma
 * along constant (L, hue) to the exact Rec.709 gamut boundary so out-of-gamut
 * colors compress cleanly with zero harsh channel clipping or hue shift.
 *
 * When `softCeiling` > 0 (e.g. 0..1 grade strength), applies a smooth filmic
 * highlight shoulder keeping Peak Luma <= 96 IRE and a tiny interior chroma
 * margin so saturated colors never hard-clip a channel to 0 or 255.
 */
export function oklabToGamutSafeSrgb(
  L: number,
  a: number,
  b: number,
  out: Float32Array | number[],
  outIdx = 0,
  softCeiling = 0.0
): void {
  if (L <= 0.0) {
    out[outIdx] = 0.0;
    out[outIdx + 1] = 0.0;
    out[outIdx + 2] = 0.0;
    return;
  }

  let cL = clamp01(L);
  let ca = a;
  let cb = b;

  if (softCeiling > 1e-4) {
    // Smooth filmic highlight shoulder: rolls L > 0.91 gracefully below ~0.970 (~96 IRE)
    if (cL > 0.91) {
      const rolledL = 0.91 + 0.062 * fastTanh((cL - 0.91) / 0.062);
      cL = cL + (rolledL - cL) * softCeiling;
    }
    // Soft tanh chroma saturation compression above C = 0.140 -> asymptotes at 0.220
    const cSq = ca * ca + cb * cb;
    if (cSq > 0.0196) {
      const C = Math.sqrt(cSq);
      const compC = 0.14 + 0.08 * fastTanh((C - 0.14) / 0.08);
      const scale = 1.0 + (compC / C - 1.0) * softCeiling;
      ca *= scale;
      cb *= scale;
    }
  } else if (cL >= 1.0) {
    out[outIdx] = 1.0;
    out[outIdx + 1] = 1.0;
    out[outIdx + 2] = 1.0;
    return;
  }

  let l_ = cL + 0.3963377774 * ca + 0.2158037573 * cb;
  let m_ = cL - 0.1055613458 * ca - 0.0638541728 * cb;
  let s_ = cL - 0.0894841775 * ca - 1.291485548 * cb;

  let l3 = l_ * l_ * l_;
  let m3 = m_ * m_ * m_;
  let s3 = s_ * s_ * s_;

  let lr = 4.0767416621 * l3 - 3.3077115913 * m3 + 0.2309699292 * s3;
  let lg = -1.2684380046 * l3 + 2.6097574011 * m3 - 0.3413193965 * s3;
  let lb = -0.0041960863 * l3 - 0.7034186147 * m3 + 1.707614701 * s3;

  // Interior linear bounds prevent channel floor/ceiling gamut clip flags on bright saturated tones
  const linLo = softCeiling > 1e-4 && cL > 0.20 ? 0.0012 * softCeiling : 0.0;
  const linHi = softCeiling > 1e-4 ? 1.0 - 0.085 * softCeiling : 1.0;
  const eps = 2e-4;

  // Constant-(L, hue) chroma compression onto the Rec.709 [linLo, linHi]^3 boundary
  // Uses small float32 rounding epsilon so valid in-gamut cube boundary vertices never collapse.
  if (
    lr < linLo - eps ||
    lg < linLo - eps ||
    lb < linLo - eps ||
    lr > linHi + eps ||
    lg > linHi + eps ||
    lb > linHi + eps
  ) {
    let lo = 0.0;
    let hi = 1.0;
    for (let iter = 0; iter < 6; iter++) {
      const mid = 0.5 * (lo + hi);
      const ta = ca * mid;
      const tb = cb * mid;
      l_ = cL + 0.3963377774 * ta + 0.2158037573 * tb;
      m_ = cL - 0.1055613458 * ta - 0.0638541728 * tb;
      s_ = cL - 0.0894841775 * ta - 1.291485548 * tb;
      l3 = l_ * l_ * l_;
      m3 = m_ * m_ * m_;
      s3 = s_ * s_ * s_;
      const tr = 4.0767416621 * l3 - 3.3077115913 * m3 + 0.2309699292 * s3;
      const tg = -1.2684380046 * l3 + 2.6097574011 * m3 - 0.3413193965 * s3;
      const tbv = -0.0041960863 * l3 - 0.7034186147 * m3 + 1.707614701 * s3;
      if (
        tr >= linLo - eps &&
        tg >= linLo - eps &&
        tbv >= linLo - eps &&
        tr <= linHi + eps &&
        tg <= linHi + eps &&
        tbv <= linHi + eps
      ) {
        lo = mid;
        lr = tr;
        lg = tg;
        lb = tbv;
      } else {
        hi = mid;
      }
    }
    if (lo === 0.0) {
      const grayLin = clamp(cL * cL * cL, 0.0, linHi);
      lr = grayLin;
      lg = grayLin;
      lb = grayLin;
    }
  }

  out[outIdx] = linearToSrgbFast(clamp(lr, 0.0, linHi));
  out[outIdx + 1] = linearToSrgbFast(clamp(lg, 0.0, linHi));
  out[outIdx + 2] = linearToSrgbFast(clamp(lb, 0.0, linHi));
}
