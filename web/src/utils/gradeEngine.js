// Single source of truth for the Color Match Engine v2 grading equation (CPU side).
// The GLSL twin lives in gradeShader.js and must stay 1:1 with gradeRGB().

export const DEFAULT_PARAMS = {
  gradeMix: 1.0,
  exposure: 0.0,
  contrast: 1.0,
  pivot: 0.435,
  shadows: 0.0,
  highlights: 0.0,
  temp: 0.0,
  tint: 0.0,
  sat: 1.0,
  vib: 0.0,
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

// Safe slider ranges used by Keyflow Mobile.
export const PARAM_LIMITS = {
  gradeMix: [0.0, 1.0],
  exposure: [-2.0, 2.0],
  contrast: [0.5, 2.0],
  pivot: [0.1, 0.9],
  shadows: [-1.0, 1.0],
  highlights: [-1.0, 1.0],
  temp: [-1.0, 1.0],
  tint: [-1.0, 1.0],
  sat: [0.0, 2.0],
  vib: [-1.0, 1.0],
  liftR: [0.0, 1.0],
  liftG: [0.0, 1.0],
  liftB: [0.0, 1.0],
  gammaR: [0.0, 1.0],
  gammaG: [0.0, 1.0],
  gammaB: [0.0, 1.0],
  gainR: [0.0, 1.0],
  gainG: [0.0, 1.0],
  gainB: [0.0, 1.0],
};

export const ROLLOFF_KNEE = 0.82;
export const ROLLOFF_ROOM = 1.0 - ROLLOFF_KNEE; // 0.18

export function clamp(val, min, max) {
  return Math.min(max, Math.max(min, val));
}

// Number.isFinite guard + strict clamp + removal of -0, rounded to 6 decimals.
export function sanitizeValue(key, raw) {
  const [lo, hi] = PARAM_LIMITS[key] || [-Infinity, Infinity];
  let v = typeof raw === "number" ? raw : Number(raw);
  if (!Number.isFinite(v)) v = DEFAULT_PARAMS[key] ?? 0;
  v = clamp(v, lo, hi);
  v = Math.round(v * 1e6) / 1e6;
  if (v === 0) v = 0; // normalizes -0 to +0
  return Number.isFinite(v) ? v : DEFAULT_PARAMS[key] ?? 0;
}

export function sanitizeParams(params) {
  const src = params || {};
  const out = {};
  for (const key of Object.keys(DEFAULT_PARAMS)) {
    out[key] = sanitizeValue(key, src[key]);
  }
  return out;
}

// Scales all grading parameters & 3-Way Color Wheel offsets proportionally from neutral
// by Match Strength (0..150%), keeping every value clamped within Keyflow Mobile bounds.
export function scaleParamsByStrength(params, strengthPct = 100) {
  const f = clamp((Number.isFinite(strengthPct) ? strengthPct : 100) / 100, 0.0, 1.5);
  if (Math.abs(f - 1.0) < 1e-4) return sanitizeParams(params);
  const src = params || {};
  const scaled = { gradeMix: src.gradeMix ?? 1.0 };
  for (const key of Object.keys(DEFAULT_PARAMS)) {
    if (key === "gradeMix") continue;
    const def = DEFAULT_PARAMS[key];
    const val = Number.isFinite(src[key]) ? src[key] : def;
    scaled[key] = def + (val - def) * f;
  }
  return sanitizeParams(scaled);
}

// Precomputes constants shared by every pixel of a frame / LUT node.
export function prepareGrade(params) {
  const p = sanitizeParams(params);
  const m = Math.pow(2.0, p.exposure);
  const wbR = Math.max(1.0 + p.temp * 0.28 + p.tint * 0.14, 0.25);
  const wbG = Math.max(1.0 - p.tint * 0.24, 0.25);
  const wbB = Math.max(1.0 - p.temp * 0.28 + p.tint * 0.14, 0.25);
  const shoulderMix = clamp(
    Math.max(m - 1.0, 0.0) * 1.6 +
      Math.max(p.contrast - 1.0, 0.0) * 1.2 +
      Math.max(p.highlights, 0.0) * 1.5,
    0.0,
    1.0
  );
  return {
    p,
    m,
    wb: [wbR, wbG, wbB],
    shoulderMix,
    lift: [(p.liftR - 0.5) * 2.0, (p.liftG - 0.5) * 2.0, (p.liftB - 0.5) * 2.0],
    gamma: [
      (p.gammaR - 0.5) * 2.0,
      (p.gammaG - 0.5) * 2.0,
      (p.gammaB - 0.5) * 2.0,
    ],
    gain: [(p.gainR - 0.5) * 2.0, (p.gainG - 0.5) * 2.0, (p.gainB - 0.5) * 2.0],
  };
}

function rollShoulder(v, shoulderMix) {
  if (v <= ROLLOFF_KNEE || shoulderMix <= 0.0) return v;
  const over = v - ROLLOFF_KNEE;
  const rolled = ROLLOFF_KNEE + (ROLLOFF_ROOM * over) / Math.max(ROLLOFF_ROOM + over, 1e-5);
  return v * (1.0 - shoulderMix) + rolled * shoulderMix;
}

function smoothstep(edge0, edge1, x) {
  const t = clamp((x - edge0) / Math.max(edge1 - edge0, 1e-5), 0.0, 1.0);
  return t * t * (3.0 - 2.0 * t);
}

// Grades one RGB triplet (0..1 display values). Writes into out[0..2].
export function gradeRGB(G, origR, origG, origB, out) {
  const p = G.p;

  const origLum = 0.2126 * origR + 0.7152 * origG + 0.0722 * origB;
  const shadowChromaMask = smoothstep(0.015, 0.13, origLum);
  const highlightChromaMask = 1.0 - smoothstep(0.86, 1.0, origLum);
  const chromaMask = shadowChromaMask * highlightChromaMask;

  // Exposure + luminance-attenuated white balance (keeps true blacks & glow cores clean).
  const wbR = 1.0 + (G.wb[0] - 1.0) * chromaMask;
  const wbG = 1.0 + (G.wb[1] - 1.0) * chromaMask;
  const wbB = 1.0 + (G.wb[2] - 1.0) * chromaMask;
  let r = Math.max(0.0, origR * G.m * wbR);
  let g = Math.max(0.0, origG * G.m * wbG);
  let b = Math.max(0.0, origB * G.m * wbB);

  const lum = 0.2126 * r + 0.7152 * g + 0.0722 * b;
  const shadowFloorMask = smoothstep(0.04, 0.32, lum);
  const contrastBlackMask = smoothstep(0.0, 0.35, lum);

  const wShadow = clamp(1.0 - lum * 2.5, 0.0, 1.0);
  const wShadowChroma = wShadow * shadowFloorMask * chromaMask;
  const wMid = clamp(1.0 - Math.abs(lum - 0.45) * 2.2, 0.0, 1.0) * chromaMask;
  const wHigh = clamp((lum - 0.48) * 2.0, 0.0, 1.0);
  const wHighChroma = wHigh * chromaMask;

  r += G.lift[0] * wShadowChroma * 0.48 + G.gamma[0] * wMid * 0.52 + G.gain[0] * wHighChroma * 0.48;
  g += G.lift[1] * wShadowChroma * 0.48 + G.gamma[1] * wMid * 0.52 + G.gain[1] * wHighChroma * 0.48;
  b += G.lift[2] * wShadowChroma * 0.48 + G.gamma[2] * wMid * 0.52 + G.gain[2] * wHighChroma * 0.48;

  const shadowsEff = p.shadows > 0.0 ? p.shadows * shadowFloorMask : p.shadows;
  const tone = shadowsEff * wShadow * 0.30 + p.highlights * wHigh * 0.30;
  r += tone;
  g += tone;
  b += tone;

  const cr = Math.max(0.0, (r - p.pivot) * p.contrast + p.pivot);
  const cg = Math.max(0.0, (g - p.pivot) * p.contrast + p.pivot);
  const cb = Math.max(0.0, (b - p.pivot) * p.contrast + p.pivot);
  if (p.contrast < 1.0) {
    r = r * (1.0 - contrastBlackMask) + cr * contrastBlackMask;
    g = g * (1.0 - contrastBlackMask) + cg * contrastBlackMask;
    b = b * (1.0 - contrastBlackMask) + cb * contrastBlackMask;
  } else {
    r = cr;
    g = cg;
    b = cb;
  }

  const lumPost = 0.2126 * r + 0.7152 * g + 0.0722 * b;
  const maxC = Math.max(r, g, b);
  const minC = Math.min(r, g, b);
  const curSat = clamp((maxC - minC) / Math.max(maxC, 1e-5), 0.0, 1.0);

  const postChromaMask = smoothstep(0.015, 0.13, lumPost) * (1.0 - smoothstep(0.86, 1.0, lumPost));
  const vibBonus = p.vib * postChromaMask * (1.0 - curSat * 0.75) * 1.25;
  const satTotal = clamp(p.sat + vibBonus, 0.0, 3.0);
  r = lumPost + satTotal * (r - lumPost);
  g = lumPost + satTotal * (g - lumPost);
  b = lumPost + satTotal * (b - lumPost);

  // Smooth highlight shoulder roll-off starting above 0.82 toward 1.0.
  r = rollShoulder(r, G.shoulderMix);
  g = rollShoulder(g, G.shoulderMix);
  b = rollShoulder(b, G.shoulderMix);

  r = clamp(r, 0.0, 1.0);
  g = clamp(g, 0.0, 1.0);
  b = clamp(b, 0.0, 1.0);

  const mix = p.gradeMix;
  out[0] = origR * (1.0 - mix) + r * mix;
  out[1] = origG * (1.0 - mix) + g * mix;
  out[2] = origB * (1.0 - mix) + b * mix;
}

// Preview-only Rec.709 -> Gentle Flat Log input curve (never exported to .kfplug).
export function applyLogInputRGB(r, g, b, out) {
  const luma = 0.2126 * r + 0.7152 * g + 0.0722 * b;
  const dr = clamp(luma + 0.82 * (r - luma), 0.0, 1.0);
  const dg = clamp(luma + 0.82 * (g - luma), 0.0, 1.0);
  const db = clamp(luma + 0.82 * (b - luma), 0.0, 1.0);
  const t = clamp(luma / 0.08, 0.0, 1.0);
  const toe = 0.04 * (t * t * (3.0 - 2.0 * t));
  out[0] = clamp(toe + Math.pow(dr, 0.84) * 0.88, 0.0, 0.92);
  out[1] = clamp(toe + Math.pow(dg, 0.84) * 0.88, 0.0, 0.92);
  out[2] = clamp(toe + Math.pow(db, 0.84) * 0.88, 0.0, 0.92);
}
