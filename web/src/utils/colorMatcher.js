// Altair 4.0 ULTRA & Polaris 3.5 PRO Perceptual OKLab Soft Gamut Compression,
// Scene-Linear Filmic Soft-Shoulder Roll-Off (> 0.80 linear luminance), and
// Pre-Match Target Auto-Normalization (Exposure + White Balance Neutralization).

export const OKLAB_CHROMA_THRESHOLD = 0.22;
export const OKLAB_CHROMA_ROOM = 0.09;
export const OKLAB_CHROMA_MAX = OKLAB_CHROMA_THRESHOLD + OKLAB_CHROMA_ROOM; // 0.31
export const FILMIC_SHOULDER_KNEE = 0.80;
export const FILMIC_SHOULDER_ROOM = 1.0 - FILMIC_SHOULDER_KNEE; // 0.20
export const REC709_MID_GRAY = 0.44;

function clamp(val, min, max) {
  return Math.min(max, Math.max(min, val));
}

function round2(val) {
  return Math.round(val * 100) / 100;
}

function fastTanh(x) {
  const cx = clamp(x, -8.0, 8.0);
  const e2x = Math.exp(2.0 * cx);
  return (e2x - 1.0) / Math.max(e2x + 1.0, 1e-5);
}

export function srgbToLinearChannel(c) {
  const v = clamp(c, 0.0, 1.0);
  return v <= 0.04045 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
}

export function srgbToLinearExtended(c) {
  const v = Math.max(0.0, Number.isFinite(c) ? c : 0.0);
  return v <= 0.04045 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
}

export function linearToSrgbChannel(c) {
  const v = clamp(c, 0.0, 1.0);
  return v <= 0.0031308 ? v * 12.92 : 1.055 * Math.pow(v, 1.0 / 2.4) - 0.055;
}

function filmicRollLinearChannel(v) {
  const x = Math.max(0.0, Number.isFinite(v) ? v : 0.0);
  if (x <= FILMIC_SHOULDER_KNEE) return x;
  const over = x - FILMIC_SHOULDER_KNEE;
  return FILMIC_SHOULDER_KNEE + FILMIC_SHOULDER_ROOM * fastTanh(over / FILMIC_SHOULDER_ROOM);
}

// 1:1 CPU twin of GLSL kfFilmicLinearShoulder(vec3 rgb) in gradeShader.js.
// Applies a smooth C1 scene-linear highlight soft-shoulder above 0.80 linear
// luminance so bright skies, neon lights, and anime glows compress cleanly.
export function filmicLinearShoulderRGB(r, g, b, out) {
  let lr = srgbToLinearExtended(r);
  let lg = srgbToLinearExtended(g);
  let lb = srgbToLinearExtended(b);

  const linY = 0.2126 * lr + 0.7152 * lg + 0.0722 * lb;
  if (linY > FILMIC_SHOULDER_KNEE) {
    const rolledY = filmicRollLinearChannel(linY);
    const scaleY = rolledY / Math.max(linY, 1e-5);
    lr *= scaleY;
    lg *= scaleY;
    lb *= scaleY;
    const desatT = clamp((linY - FILMIC_SHOULDER_KNEE) / 0.65, 0.0, 1.0) * 0.28;
    lr = lr + (rolledY - lr) * desatT;
    lg = lg + (rolledY - lg) * desatT;
    lb = lb + (rolledY - lb) * desatT;
  }

  lr = filmicRollLinearChannel(lr);
  lg = filmicRollLinearChannel(lg);
  lb = filmicRollLinearChannel(lb);

  out[0] = linearToSrgbChannel(lr);
  out[1] = linearToSrgbChannel(lg);
  out[2] = linearToSrgbChannel(lb);
}

export function rgbLinearToOklab(lr, lg, lb, out) {
  const l = Math.cbrt(Math.max(1e-5, 0.41222147 * lr + 0.53633254 * lg + 0.05144599 * lb));
  const m = Math.cbrt(Math.max(1e-5, 0.21190350 * lr + 0.68069955 * lg + 0.10739696 * lb));
  const s = Math.cbrt(Math.max(1e-5, 0.08830246 * lr + 0.28171884 * lg + 0.62997870 * lb));
  out[0] = 0.21045426 * l + 0.79361779 * m - 0.00407205 * s;
  out[1] = 1.97799850 * l - 2.42859221 * m + 0.45059371 * s;
  out[2] = 0.02590404 * l + 0.78277177 * m - 0.80867577 * s;
}

export function oklabToLinearRgb(L, a, b, out) {
  const l_ = L + 0.39633778 * a + 0.21580376 * b;
  const m_ = L - 0.10556135 * a - 0.06385417 * b;
  const s_ = L - 0.08948418 * a - 1.29148555 * b;
  const l = l_ * l_ * l_;
  const m = m_ * m_ * m_;
  const s = s_ * s_ * s_;
  out[0] = 4.07674166 * l - 3.30771159 * m + 0.23096993 * s;
  out[1] = -1.26843800 * l + 2.60975740 * m - 0.34131940 * s;
  out[2] = -0.00419609 * l - 0.70341861 * m + 1.70761470 * s;
}

// Smooth shoulder roll-off on extreme OKLab chroma (C = sqrt(a^2 + b^2)) above C > 0.22
// so hyper-saturated anime scenes, stage lighting, and neon signage retain tonal detail.
export function compressOklabChroma(a, b, outAB = [0, 0]) {
  const C = Math.sqrt(a * a + b * b);
  if (C <= OKLAB_CHROMA_THRESHOLD) {
    outAB[0] = a;
    outAB[1] = b;
    return C;
  }
  const excess = C - OKLAB_CHROMA_THRESHOLD;
  const compressedC = OKLAB_CHROMA_THRESHOLD + OKLAB_CHROMA_ROOM * fastTanh(excess / OKLAB_CHROMA_ROOM);
  const scale = compressedC / Math.max(C, 1e-5);
  outAB[0] = a * scale;
  outAB[1] = b * scale;
  return compressedC;
}

// 1:1 CPU twin of GLSL kfOklabGamutCompress(vec3 rgb) in gradeShader.js.
export function oklabSoftGamutCompressRGB(r, g, b, out) {
  const cr = clamp(r, 0.0, 1.0);
  const cg = clamp(g, 0.0, 1.0);
  const cb = clamp(b, 0.0, 1.0);

  const lr = srgbToLinearChannel(cr);
  const lg = srgbToLinearChannel(cg);
  const lb = srgbToLinearChannel(cb);

  const lab = [0, 0, 0];
  rgbLinearToOklab(lr, lg, lb, lab);
  const L = lab[0];
  const a = lab[1];
  const bLab = lab[2];
  const C = Math.sqrt(a * a + bLab * bLab);

  if (C <= OKLAB_CHROMA_THRESHOLD) {
    out[0] = cr;
    out[1] = cg;
    out[2] = cb;
    return;
  }

  const excess = C - OKLAB_CHROMA_THRESHOLD;
  const compressedC =
    OKLAB_CHROMA_THRESHOLD + OKLAB_CHROMA_ROOM * fastTanh(excess / OKLAB_CHROMA_ROOM);
  const scale = compressedC / Math.max(C, 1e-5);

  const linOut = [0, 0, 0];
  oklabToLinearRgb(L, a * scale, bLab * scale, linOut);
  out[0] = linearToSrgbChannel(linOut[0]);
  out[1] = linearToSrgbChannel(linOut[1]);
  out[2] = linearToSrgbChannel(linOut[2]);
}

// Pure GLSL ES 1.00 twin for WebGL preview and .kfplug shader exports.
export const GLSL_OKLAB_GAMUT_COMPRESS_FUNCTIONS = `float kfSrgbToLin(float c) {
    float v = clamp(c, 0.0, 1.0);
    if (v <= 0.04045) {
        return v / 12.92;
    }
    return pow(max((v + 0.055) / 1.055, 1e-5), 2.4);
}

float kfLinToSrgb(float c) {
    float v = clamp(c, 0.0, 1.0);
    if (v <= 0.0031308) {
        return v * 12.92;
    }
    return 1.055 * pow(max(v, 1e-5), 1.0 / 2.4) - 0.055;
}

vec3 kfOklabGamutCompress(vec3 rgb) {
    vec3 c = clamp(rgb, 0.0, 1.0);
    float lr = kfSrgbToLin(c.r);
    float lg = kfSrgbToLin(c.g);
    float lb = kfSrgbToLin(c.b);

    float l = pow(max(0.41222147 * lr + 0.53633254 * lg + 0.05144599 * lb, 1e-5), 0.33333333);
    float m = pow(max(0.21190350 * lr + 0.68069955 * lg + 0.10739696 * lb, 1e-5), 0.33333333);
    float s = pow(max(0.08830246 * lr + 0.28171884 * lg + 0.62997870 * lb, 1e-5), 0.33333333);

    float L = 0.21045426 * l + 0.79361779 * m - 0.00407205 * s;
    float a = 1.97799850 * l - 2.42859221 * m + 0.45059371 * s;
    float b = 0.02590404 * l + 0.78277177 * m - 0.80867577 * s;

    float C = sqrt(a * a + b * b);
    if (C <= 0.22) {
        return c;
    }

    float excess = C - 0.22;
    float compressedC = 0.22 + 0.09 * kfTanh(excess / 0.09);
    float scale = compressedC / max(C, 1e-5);
    a *= scale;
    b *= scale;

    float l_ = L + 0.39633778 * a + 0.21580376 * b;
    float m_ = L - 0.10556135 * a - 0.06385417 * b;
    float s_ = L - 0.08948418 * a - 1.29148555 * b;

    float l3 = l_ * l_ * l_;
    float m3 = m_ * m_ * m_;
    float s3 = s_ * s_ * s_;

    float outLr = 4.07674166 * l3 - 3.30771159 * m3 + 0.23096993 * s3;
    float outLg = -1.26843800 * l3 + 2.60975740 * m3 - 0.34131940 * s3;
    float outLb = -0.00419609 * l3 - 0.70341861 * m3 + 1.70761470 * s3;

    return vec3(kfLinToSrgb(outLr), kfLinToSrgb(outLg), kfLinToSrgb(outLb));
}
`;

// Pure GLSL ES 1.00 Scene-Linear Filmic Soft-Shoulder Roll-Off (> 0.80 linear luminance).
// 1:1 GPU twin of filmicLinearShoulderRGB() for WebGL preview and .kfplug shader exports.
export const GLSL_FILMIC_LINEAR_SHOULDER_FUNCTIONS = `float kfSrgbToLinExt(float c) {
    float v = max(c, 0.0);
    if (v <= 0.04045) {
        return v / 12.92;
    }
    return pow(max((v + 0.055) / 1.055, 1e-5), 2.4);
}

float kfFilmicRollLin(float v) {
    float x = max(v, 0.0);
    if (x <= 0.80) {
        return x;
    }
    float over = x - 0.80;
    return 0.80 + 0.20 * kfTanh(over / 0.20);
}

vec3 kfFilmicLinearShoulder(vec3 rgb) {
    float lr = kfSrgbToLinExt(rgb.r);
    float lg = kfSrgbToLinExt(rgb.g);
    float lb = kfSrgbToLinExt(rgb.b);

    float linY = 0.2126 * lr + 0.7152 * lg + 0.0722 * lb;
    if (linY > 0.80) {
        float rolledY = kfFilmicRollLin(linY);
        float scaleY = rolledY / max(linY, 1e-5);
        lr *= scaleY;
        lg *= scaleY;
        lb *= scaleY;
        float desatT = clamp((linY - 0.80) / 0.65, 0.0, 1.0) * 0.28;
        lr = mix(lr, rolledY, desatT);
        lg = mix(lg, rolledY, desatT);
        lb = mix(lb, rolledY, desatT);
    }

    lr = kfFilmicRollLin(lr);
    lg = kfFilmicRollLin(lg);
    lb = kfFilmicRollLin(lb);

    return vec3(kfLinToSrgb(lr), kfLinToSrgb(lg), kfLinToSrgb(lb));
}
`;

// ---------------------------------------------------------------------------
// Pre-Match Target Auto-Normalization (Exposure + White Balance Neutralization)
// ---------------------------------------------------------------------------

export function computeTargetAutoNormalization(rgba, numPixels = 0) {
  const totalPixels = numPixels || (rgba ? Math.floor(rgba.length / 4) : 0);
  if (!rgba || totalPixels < 16) {
    return {
      active: false,
      exposureOffset: 0.0,
      tempOffset: 0.0,
      tintOffset: 0.0,
      gainR: 1.0,
      gainG: 1.0,
      gainB: 1.0,
      meanY: REC709_MID_GRAY,
    };
  }

  const stride = Math.max(1, Math.floor(totalPixels / 12000));
  let sumY = 0;
  let sumW = 0;
  let midR = 0;
  let midG = 0;
  let midB = 0;
  let midY = 0;
  let midW = 0;

  for (let p = 0; p < totalPixels; p += stride) {
    const i = p * 4;
    if (rgba[i + 3] < 16) continue;
    const r = rgba[i] / 255.0;
    const g = rgba[i + 1] / 255.0;
    const b = rgba[i + 2] / 255.0;
    const y = 0.2126 * r + 0.7152 * g + 0.0722 * b;
    if (y < 0.03 || y > 0.96) continue;

    sumY += y;
    sumW += 1.0;

    if (y >= 0.16 && y <= 0.80) {
      const maxC = Math.max(r, g, b);
      const minC = Math.min(r, g, b);
      const sat = (maxC - minC) / Math.max(maxC, 1e-4);
      // Downweight hyper-saturated pixels so neutral/near-neutral surfaces guide WB
      const illumW = 1.0 / (1.0 + 8.0 * sat * sat);
      midR += r * illumW;
      midG += g * illumW;
      midB += b * illumW;
      midY += y * illumW;
      midW += illumW;
    }
  }

  if (sumW < 8) {
    return {
      active: false,
      exposureOffset: 0.0,
      tempOffset: 0.0,
      tintOffset: 0.0,
      gainR: 1.0,
      gainG: 1.0,
      gainB: 1.0,
      meanY: REC709_MID_GRAY,
    };
  }

  const meanY = sumY / sumW;
  // Gentle pre-match exposure offset centering mid-gray luminance toward Rec.709 neutral (0.44)
  const rawEv = 0.55 * Math.log2(REC709_MID_GRAY / Math.max(meanY, 0.08));
  const exposureOffset = clamp(0.36 * fastTanh(rawEv / 0.36), -0.36, 0.36);
  const evGain = Math.pow(2.0, exposureOffset);

  let gainR = 1.0;
  let gainG = 1.0;
  let gainB = 1.0;
  let tempOffset = 0.0;
  let tintOffset = 0.0;

  if (midW > 1e-4) {
    const avgR = midR / midW;
    const avgG = midG / midW;
    const avgB = midB / midW;
    const avgY = Math.max(midY / midW, 0.08);

    // Gentle 65% gray-world / illuminant neutralization
    const rawGainR = clamp(avgY / Math.max(avgR, 0.08), 0.78, 1.28);
    const rawGainG = clamp(avgY / Math.max(avgG, 0.08), 0.84, 1.20);
    const rawGainB = clamp(avgY / Math.max(avgB, 0.08), 0.78, 1.28);

    gainR = 1.0 + (rawGainR - 1.0) * 0.65;
    gainG = 1.0 + (rawGainG - 1.0) * 0.65;
    gainB = 1.0 + (rawGainB - 1.0) * 0.65;

    const rbDiff = (avgR - avgB) / avgY;
    const gmDiff = (avgG - 0.5 * (avgR + avgB)) / avgY;
    tempOffset = clamp(-rbDiff * 0.95, -0.45, 0.45);
    tintOffset = clamp(gmDiff * 1.05, -0.40, 0.40);
  }

  return {
    active: true,
    exposureOffset: round2(exposureOffset),
    tempOffset: round2(tempOffset),
    tintOffset: round2(tintOffset),
    gainR: gainR * evGain,
    gainG: gainG * evGain,
    gainB: gainB * evGain,
    meanY,
  };
}

// Produces a pre-normalized copy of the TARGET RGBA buffer so Sirius, Polaris, or Altair
// runs color transfer on an exposure-centered, white-balance neutralized target.
export function autoNormalizeTargetPixels(rgba, numPixels = 0) {
  const totalPixels = numPixels || (rgba ? Math.floor(rgba.length / 4) : 0);
  const normStats = computeTargetAutoNormalization(rgba, totalPixels);
  if (!normStats.active || !rgba || totalPixels < 1) {
    return { data: rgba, numPixels: totalPixels, normStats };
  }

  const out = new Uint8ClampedArray(rgba.length);
  const limit = Math.min(rgba.length, totalPixels * 4);
  const { gainR, gainG, gainB } = normStats;

  for (let i = 0; i < limit; i += 4) {
    const r = rgba[i] / 255.0;
    const g = rgba[i + 1] / 255.0;
    const b = rgba[i + 2] / 255.0;
    const y = 0.2126 * r + 0.7152 * g + 0.0722 * b;
    // Protect pure black floor and extreme specular highlights
    const toeMask = clamp((y - 0.015) / 0.10, 0.0, 1.0);
    const hiMask = clamp((0.98 - y) / 0.12, 0.25, 1.0);
    const mask = toeMask * hiMask;

    const nr = clamp(r * (1.0 + (gainR - 1.0) * mask), 0.0, 1.0);
    const ng = clamp(g * (1.0 + (gainG - 1.0) * mask), 0.0, 1.0);
    const nb = clamp(b * (1.0 + (gainB - 1.0) * mask), 0.0, 1.0);

    out[i] = Math.round(nr * 255.0);
    out[i + 1] = Math.round(ng * 255.0);
    out[i + 2] = Math.round(nb * 255.0);
    out[i + 3] = rgba[i + 3];
  }

  return { data: out, numPixels: totalPixels, normStats };
}

// Folds the pre-match Target Auto-Normalize offsets into the matched grading parameters
// so the live Target preview and exported LUT / .kfplug receive the normalization.
export function applyTargetAutoNormalizeOffsets(params, normStats) {
  if (!params || !normStats || !normStats.active) return params;
  return {
    ...params,
    exposure: round2(clamp((params.exposure ?? 0.0) + normStats.exposureOffset * 0.75, -1.5, 1.5)),
    temp: round2(clamp((params.temp ?? 0.0) + normStats.tempOffset * 0.75, -1.0, 1.0)),
    tint: round2(clamp((params.tint ?? 0.0) + normStats.tintOffset * 0.75, -1.0, 1.0)),
  };
}
