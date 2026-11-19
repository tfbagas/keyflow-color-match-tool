// Single source of truth for the Color Match Engine (Sirius 2.5 / Polaris 3.5 PRO / Altair 4.0 ULTRA)
// grading equation (CPU side).
// The GLSL twin lives in gradeShader.js and must stay 1:1 with gradeRGB().
import { DEFAULT_PARAMS, PARAM_LIMITS } from "./paramSchema.js";
import { oklabSoftGamutCompressRGB, filmicLinearShoulderRGB } from "./colorMatcher.js";
import { applyLogProfileRGB, isLogProfileActive } from "./logProfiles.js";

export { DEFAULT_PARAMS, PARAM_LIMITS };

// Identity polynomial coefficients (20 coeffs per channel: 5 vec4s).
// Basis order:
//   v0: [1, R, G, B]
//   v1: [R^2, G^2, B^2, R*G]
//   v2: [R*B, G*B, R^3, G^3]
//   v3: [B^3, R^2*G, R^2*B, G^2*R]
//   v4: [G^2*B, B^2*R, B^2*G, R*G*B]
export const IDENTITY_POLY_R = Object.freeze([
  0, 1, 0, 0,
  0, 0, 0, 0,
  0, 0, 0, 0,
  0, 0, 0, 0,
  0, 0, 0, 0,
]);
export const IDENTITY_POLY_G = Object.freeze([
  0, 0, 1, 0,
  0, 0, 0, 0,
  0, 0, 0, 0,
  0, 0, 0, 0,
  0, 0, 0, 0,
]);
export const IDENTITY_POLY_B = Object.freeze([
  0, 0, 0, 1,
  0, 0, 0, 0,
  0, 0, 0, 0,
  0, 0, 0, 0,
  0, 0, 0, 0,
]);
export const IDENTITY_HUE6 = Object.freeze([0, 0, 0, 0, 0, 0]);

export const WB_COEFFS = {
  tempRB: 0.28,
  tintRB: 0.14,
  tintG: 0.24,
  minGain: 0.25,
};

export const TONE_COEFFS = {
  shadowSlope: 2.5,
  highlightOffset: 0.48,
  highlightSlope: 2.0,
  strength: 0.30,
};

export function computeWBGains(temp, tint) {
  return [
    Math.max(1.0 + temp * WB_COEFFS.tempRB + tint * WB_COEFFS.tintRB, WB_COEFFS.minGain),
    Math.max(1.0 - tint * WB_COEFFS.tintG, WB_COEFFS.minGain),
    Math.max(1.0 - temp * WB_COEFFS.tempRB + tint * WB_COEFFS.tintRB, WB_COEFFS.minGain),
  ];
}

export const ROLLOFF_KNEE = 0.82;
export const ROLLOFF_ROOM = 1.0 - ROLLOFF_KNEE; // 0.18

export function clamp(val, min, max) {
  return Math.min(max, Math.max(min, val));
}

function round6(val) {
  const r = Math.round(val * 1e6) / 1e6;
  return r === 0 ? 0 : r;
}

function sanitizeArray(arr, fallback, lo = -4.0, hi = 4.0) {
  const len = fallback.length;
  if (!Array.isArray(arr) && !(arr instanceof Float32Array)) {
    return fallback.slice();
  }
  const out = new Array(len);
  for (let i = 0; i < len; i++) {
    const raw = i < arr.length ? Number(arr[i]) : fallback[i];
    const v = Number.isFinite(raw) ? clamp(raw, lo, hi) : fallback[i];
    out[i] = round6(v);
  }
  return out;
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
  const rawAutoMix =
    typeof src.autoGradeMix === "number" ? src.autoGradeMix : Number(src.autoGradeMix);
  out.autoGradeMix = Number.isFinite(rawAutoMix)
    ? round6(clamp(rawAutoMix, 0.0, 1.5))
    : 0.0;
  const rawFilmic =
    typeof src.filmicShoulder === "number" ? src.filmicShoulder : Number(src.filmicShoulder);
  out.filmicShoulder = Number.isFinite(rawFilmic)
    ? round6(clamp(rawFilmic, 0.0, 1.0))
    : 0.0;
  out.polyR = sanitizeArray(src.polyR, IDENTITY_POLY_R, -4.0, 4.0);
  out.polyG = sanitizeArray(src.polyG, IDENTITY_POLY_G, -4.0, 4.0);
  out.polyB = sanitizeArray(src.polyB, IDENTITY_POLY_B, -4.0, 4.0);
  // Zero-intercept constraint: P(0,0,0) = (0,0,0) so deep blacks never lift.
  out.polyR[0] = 0;
  out.polyG[0] = 0;
  out.polyB[0] = 0;
  out.hueShift = sanitizeArray(src.hueShift, IDENTITY_HUE6, -0.5, 0.5);
  out.hueSat = sanitizeArray(src.hueSat, IDENTITY_HUE6, -0.8, 0.8);
  out.hueLuma = sanitizeArray(src.hueLuma, IDENTITY_HUE6, -0.5, 0.5);
  return out;
}

// Scales all grading parameters, 3-Way Color Wheel offsets, and Cinema Hybrid Pro
// autoGradeMix proportionally from neutral by Match Strength (0..150%).
export function scaleParamsByStrength(params, strengthPct = 100) {
  const f = clamp((Number.isFinite(strengthPct) ? strengthPct : 100) / 100, 0.0, 1.5);
  const san = sanitizeParams(params);
  if (Math.abs(f - 1.0) < 1e-4) return san;
  const scaled = {
    ...san,
    gradeMix: san.gradeMix ?? 1.0,
    autoGradeMix: round6(clamp((san.autoGradeMix ?? 0.0) * f, 0.0, 1.5)),
    filmicShoulder: san.filmicShoulder ?? 0.0,
  };
  for (const key of Object.keys(DEFAULT_PARAMS)) {
    if (key === "gradeMix") continue;
    const def = DEFAULT_PARAMS[key];
    const val = Number.isFinite(san[key]) ? san[key] : def;
    scaled[key] = def + (val - def) * f;
  }
  return sanitizeParams(scaled);
}

// Precomputes constants shared by every pixel of a frame / LUT node.
export function prepareGrade(params) {
  const p = sanitizeParams(params);
  const m = Math.pow(2.0, p.exposure);
  const wb = computeWBGains(p.temp, p.tint);
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
    wb,
    shoulderMix,
    lift: [(p.liftR - 0.5) * 2.0, (p.liftG - 0.5) * 2.0, (p.liftB - 0.5) * 2.0],
    gamma: [
      (p.gammaR - 0.5) * 2.0,
      (p.gammaG - 0.5) * 2.0,
      (p.gammaB - 0.5) * 2.0,
    ],
    gain: [(p.gainR - 0.5) * 2.0, (p.gainG - 0.5) * 2.0, (p.gainB - 0.5) * 2.0],
    autoGradeMix: p.autoGradeMix,
    filmicShoulder: p.filmicShoulder ?? 0.0,
    polyR: p.polyR,
    polyG: p.polyG,
    polyB: p.polyB,
    hueShift: p.hueShift,
    hueSat: p.hueSat,
    hueLuma: p.hueLuma,
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

function evalPoly20(c, b0, b1, b2, b3, b4) {
  return (
    c[0] * b0[0] + c[1] * b0[1] + c[2] * b0[2] + c[3] * b0[3] +
    c[4] * b1[0] + c[5] * b1[1] + c[6] * b1[2] + c[7] * b1[3] +
    c[8] * b2[0] + c[9] * b2[1] + c[10] * b2[2] + c[11] * b2[3] +
    c[12] * b3[0] + c[13] * b3[1] + c[14] * b3[2] + c[15] * b3[3] +
    c[16] * b4[0] + c[17] * b4[1] + c[18] * b4[2] + c[19] * b4[3]
  );
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

function agxChannel(x) {
  const v = Math.max(x, 0.0);
  const k = 0.72;
  if (v <= k) return v;
  const over = v - k;
  const room = 1.0 - k;
  return k + (room * over) / Math.max(room + over * 0.88, 1e-5);
}

// Applies the Cinema Hybrid Pro residual layer (1:1 twin of kfHybridLayer in gradeShader.js).
export function applyHybridLayerRGB(G, baseR, baseG, baseB, out) {
  const autoMix = clamp(G.autoGradeMix ?? 0.0, 0.0, 1.5);
  if (autoMix <= 1e-5) {
    out[0] = baseR;
    out[1] = baseG;
    out[2] = baseB;
    return;
  }

  const r = clamp(baseR, 0.0, 1.0);
  const g = clamp(baseG, 0.0, 1.0);
  const b = clamp(baseB, 0.0, 1.0);
  const baseLuma = 0.2126 * r + 0.7152 * g + 0.0722 * b;
  const shadowMask = smoothstep(0.015, 0.16, baseLuma);
  const r2 = r * r;
  const g2 = g * g;
  const b2 = b * b;

  // Constant intercept basis term is strictly 0.0 so P(0,0,0) = (0,0,0).
  const b0 = [0.0, r, g, b];
  const b1 = [r2, g2, b2, r * g];
  const b2v = [r * b, g * b, r2 * r, g2 * g];
  const b3 = [b2 * b, r2 * g, r2 * b, g2 * r];
  const b4 = [g2 * b, b2 * r, b2 * g, r * g * b];

  const useFilmicLinear = (G.filmicShoulder ?? 0.0) > 0.5;
  const polyMax = useFilmicLinear ? 1.35 : 1.15;

  let pr = clamp(evalPoly20(G.polyR, b0, b1, b2v, b3, b4), 0.0, polyMax);
  let pg = clamp(evalPoly20(G.polyG, b0, b1, b2v, b3, b4), 0.0, polyMax);
  let pb = clamp(evalPoly20(G.polyB, b0, b1, b2v, b3, b4), 0.0, polyMax);

  // 6-sector Hue curves (Hue-vs-Hue, Hue-vs-Sat, Hue-vs-Luma) in opponent chroma space.
  const y0 = 0.2126 * pr + 0.7152 * pg + 0.0722 * pb;
  const c1 = pr - y0;
  const c2 = pb - y0;
  const chr = Math.sqrt(c1 * c1 + c2 * c2 + 1e-6);
  const hueGate =
    smoothstep(0.015, 0.08, chr) *
    smoothstep(0.03, 0.14, y0) *
    (1.0 - smoothstep(0.86, 0.99, y0));
  const hAngle = Math.abs(c1) + Math.abs(c2) > 1e-4 ? Math.atan2(c2, c1) : 0.0;

  let dHue = 0.0;
  let dSat = 0.0;
  let dLum = 0.0;
  for (let s = 0; s < 6; s++) {
    const w = hueSectorWeight(hAngle, HUE_CENTERS[s]);
    dHue += w * G.hueShift[s];
    dSat += w * G.hueSat[s];
    dLum += w * G.hueLuma[s];
  }
  dHue *= hueGate;
  dSat *= hueGate;
  dLum *= hueGate;

  const cs = Math.cos(dHue);
  const sn = Math.sin(dHue);
  const rc1 = c1 * cs - c2 * sn;
  const rc2 = c1 * sn + c2 * cs;
  const satScale = clamp(1.0 + dSat, 0.25, 1.85);
  const nc1 = rc1 * satScale;
  const nc2 = rc2 * satScale;
  const ny = clamp(y0 + dLum * 0.24, 0.0, polyMax);
  const ng = ny - (0.2126 * nc1 + 0.0722 * nc2) / 0.7152;
  pr = ny + nc1;
  pg = ng;
  pb = ny + nc2;

  // Luma-vs-Sat roll-off at extreme black & white ends.
  const y1 = 0.2126 * pr + 0.7152 * pg + 0.0722 * pb;
  const endRoll = 0.75 + 0.25 * (smoothstep(0.0, 0.10, y1) * (1.0 - smoothstep(0.85, 1.0, y1)));
  pr = y1 + (pr - y1) * endRoll;
  pg = y1 + (pg - y1) * endRoll;
  pb = y1 + (pb - y1) * endRoll;

  // Subtractive Film Density (Beer-Lambert saturation darkening for rich colors).
  const maxC = Math.max(pr, pg, pb);
  const minC = Math.min(pr, pg, pb);
  const satEst = clamp((maxC - minC) / Math.max(maxC, 1e-4), 0.0, 1.0);
  const midMask = smoothstep(0.08, 0.30, y1) * (1.0 - smoothstep(0.68, 0.92, y1));
  const density = 1.0 - satEst * midMask * 0.065;
  pr *= density;
  pg *= density;
  pb *= density;

  let or = 0.0;
  let og = 0.0;
  let ob = 0.0;

  if (useFilmicLinear) {
    // Altair 4.0 ULTRA: Scene-Linear Filmic Soft-Shoulder Roll-Off (> 0.80 linear)
    // followed by Perceptual OKLab Soft Gamut Compression (C > 0.22).
    const filmicOut = [0, 0, 0];
    filmicLinearShoulderRGB(pr, pg, pb, filmicOut);
    const gamutOut = [0, 0, 0];
    oklabSoftGamutCompressRGB(filmicOut[0], filmicOut[1], filmicOut[2], gamutOut);
    or = clamp(gamutOut[0], 0.0, 1.0);
    og = clamp(gamutOut[1], 0.0, 1.0);
    ob = clamp(gamutOut[2], 0.0, 1.0);
  } else {
    // Polaris 3.5 PRO: Soft Rec.709 Gamut Clamp + OKLab Gamut Compression + AgX Roll-Off.
    const y2 = clamp(0.2126 * pr + 0.7152 * pg + 0.0722 * pb, 0.0, 1.0);
    const dr = pr - y2;
    const dg = pg - y2;
    const db = pb - y2;
    const maxSpan = Math.max(Math.abs(dr), Math.abs(dg), Math.abs(db), 1e-4);
    const softSpan = Math.tanh(maxSpan * 1.35) / 1.35;
    const gScale = softSpan / maxSpan;
    pr = Math.max(y2 + dr * gScale, 0.0);
    pg = Math.max(y2 + dg * gScale, 0.0);
    pb = Math.max(y2 + db * gScale, 0.0);

    const gamutOut = [0, 0, 0];
    oklabSoftGamutCompressRGB(pr, pg, pb, gamutOut);
    pr = gamutOut[0];
    pg = gamutOut[1];
    pb = gamutOut[2];

    const ir = 0.856 * pr + 0.095 * pg + 0.049 * pb;
    const ig = 0.070 * pr + 0.875 * pg + 0.055 * pb;
    const ib = 0.048 * pr + 0.102 * pg + 0.850 * pb;
    const ar = agxChannel(ir);
    const ag = agxChannel(ig);
    const ab = agxChannel(ib);
    or = clamp(1.182 * ar - 0.128 * ag - 0.054 * ab, 0.0, 1.0);
    og = clamp(-0.094 * ar + 1.158 * ag - 0.064 * ab, 0.0, 1.0);
    ob = clamp(-0.055 * ar - 0.125 * ag + 1.180 * ab, 0.0, 1.0);
  }

  const hybridDeltaR = (or - baseR) * autoMix;
  const hybridDeltaG = (og - baseG) * autoMix;
  const hybridDeltaB = (ob - baseB) * autoMix;

  out[0] = clamp(baseR + shadowMask * hybridDeltaR, 0.0, 1.0);
  out[1] = clamp(baseG + shadowMask * hybridDeltaG, 0.0, 1.0);
  out[2] = clamp(baseB + shadowMask * hybridDeltaB, 0.0, 1.0);
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

  const wShadow = clamp(1.0 - lum * TONE_COEFFS.shadowSlope, 0.0, 1.0);
  const wShadowChroma = wShadow * shadowFloorMask * chromaMask;
  const wMid = clamp(1.0 - Math.abs(lum - 0.45) * 2.2, 0.0, 1.0) * chromaMask;
  const wHigh = clamp((lum - TONE_COEFFS.highlightOffset) * TONE_COEFFS.highlightSlope, 0.0, 1.0);
  const wHighChroma = wHigh * chromaMask;

  r += G.lift[0] * wShadowChroma * 0.48 + G.gamma[0] * wMid * 0.52 + G.gain[0] * wHighChroma * 0.48;
  g += G.lift[1] * wShadowChroma * 0.48 + G.gamma[1] * wMid * 0.52 + G.gain[1] * wHighChroma * 0.48;
  b += G.lift[2] * wShadowChroma * 0.48 + G.gamma[2] * wMid * 0.52 + G.gain[2] * wHighChroma * 0.48;

  const shadowsEff = p.shadows > 0.0 ? p.shadows * shadowFloorMask : p.shadows;
  const tone =
    shadowsEff * wShadow * TONE_COEFFS.strength +
    p.highlights * wHigh * TONE_COEFFS.strength;
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

  let baseR = clamp(r, 0.0, 1.0);
  let baseG = clamp(g, 0.0, 1.0);
  let baseB = clamp(b, 0.0, 1.0);

  if ((G.autoGradeMix ?? 0.0) > 1e-5) {
    applyHybridLayerRGB(G, baseR, baseG, baseB, out);
    baseR = out[0];
    baseG = out[1];
    baseB = out[2];
  }

  const mix = p.gradeMix;
  out[0] = origR * (1.0 - mix) + baseR * mix;
  out[1] = origG * (1.0 - mix) + baseG * mix;
  out[2] = origB * (1.0 - mix) + baseB * mix;
}

// Camera Log -> Rec.709 input curve (supports S-Log3, C-Log3, D-Log M, Apple Log).
export function applyLogInputRGB(r, g, b, out, logProfile = "slog3") {
  applyLogProfileRGB(r, g, b, logProfile === true ? "slog3" : logProfile, out);
}

// Evaluates gradeRGB() with 1:1 shadow-toe protection and optional Camera Log input transform.
// Matches PREVIEW_FRAGMENT and KFPLUG_FRAGMENT identically.
export function evaluateGradeRGB(G, rawR, rawG, rawB, out, simulateLogInput = false) {
  let inR = rawR;
  let inG = rawG;
  let inB = rawB;
  if (isLogProfileActive(simulateLogInput)) {
    applyLogProfileRGB(rawR, rawG, rawB, simulateLogInput, out);
    inR = out[0];
    inG = out[1];
    inB = out[2];
  }
  const baseLuma = 0.2126 * inR + 0.7152 * inG + 0.0722 * inB;
  gradeRGB(G, inR, inG, inB, out);
  // Strictly monotonic shadow-toe clamp: prevents unwanted black lift in [0.0, 0.04]
  // without pulling darkened shadows back up (zero luminance reversals).
  const toeProtect = smoothstep(0.0, 0.04, baseLuma);
  out[0] = Math.min(out[0], inR) + Math.max(out[0] - inR, 0.0) * toeProtect;
  out[1] = Math.min(out[1], inG) + Math.max(out[1] - inG, 0.0) * toeProtect;
  out[2] = Math.min(out[2], inB) + Math.max(out[2] - inB, 0.0) * toeProtect;
}
