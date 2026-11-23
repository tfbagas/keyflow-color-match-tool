import JSZip from "jszip";
import {
  PRECISION_HEADER,
  GRADE_FUNCTION,
} from "./gradeShader.js";
import { sanitizeParams } from "./gradeEngine.js";
import { KFPLUG_BASE_PARAMS, DEFAULT_PARAMS } from "./paramSchema.js";
import { checkAllowedHost, sanitizeMetadataText } from "./hostGuard.js";
import {
  GLSL_LOG_PROFILE_FUNCTIONS,
  getLogProfileCode,
  resolveLogProfileId,
} from "./logProfiles.js";
import { composeLutTo32 } from "../engine/lut3d.ts";

export { checkAllowedHost, sanitizeMetadataText };

const BASE_PARAMS = [
  ...KFPLUG_BASE_PARAMS,
  {
    id: "autoGradeMix",
    label: "Auto-Grade Layer",
    type: "scalar",
    default: 1.0,
    min: 0.0,
    max: 1.5,
    displayScale: 100.0,
    decimals: 0,
    group: "Master",
  },
];

const BASE_PARAM_MAP = Object.fromEntries(BASE_PARAMS.map((spec) => [spec.id, spec]));

const BASE_COLORS = [
  { label: "Shadows Tint", r: "liftR", g: "liftG", b: "liftB" },
  { label: "Midtones Tint", r: "gammaR", g: "gammaG", b: "gammaB" },
  { label: "Highlights Tint", r: "gainR", g: "gainG", b: "gainB" },
];

const PRESETS = [
  {
    id: "tealOrange",
    label: "Teal & Orange Cinema",
    values: { contrast: 1.25, exposure: 0.1, sat: 1.15, vib: 0.2, liftR: 0.35, liftG: 0.52, liftB: 0.65, gammaR: 0.52, gammaG: 0.50, gammaB: 0.48, gainR: 0.65, gainG: 0.55, gainB: 0.40 }
  },
  {
    id: "moodyVintage",
    label: "Moody Vintage Film",
    values: { contrast: 0.85, exposure: -0.1, shadows: 0.15, highlights: -0.1, temp: 0.15, sat: 0.8, vib: -0.1, liftR: 0.52, liftG: 0.54, liftB: 0.48, gainR: 0.58, gainG: 0.52, gainB: 0.45 }
  },
  {
    id: "bleachBypass",
    label: "Bleach Bypass",
    values: { contrast: 1.45, exposure: 0.05, sat: 0.55, vib: -0.3, shadows: -0.15, highlights: 0.1, liftR: 0.48, liftG: 0.50, liftB: 0.52 }
  },
  {
    id: "cyberpunkNeon",
    label: "Cyberpunk Magenta/Cyan",
    values: { contrast: 1.3, exposure: 0.1, sat: 1.3, temp: -0.2, tint: 0.3, liftR: 0.38, liftG: 0.48, liftB: 0.68, gainR: 0.68, gainG: 0.38, gainB: 0.58 }
  }
];

const PASS_INDEX_FIELDS = [
  "prevPass",
  "inputPass",
  "sourcePass",
  "passIndex",
  "prevPassIndex",
  "targetPass",
];

function fmtFloat(v) {
  const n = Number.isFinite(v) ? v : 0.0;
  const s = n.toFixed(6);
  return s === "-0.000000" ? "0.000000" : s;
}

function fmtVec4(arr, offset = 0) {
  return `vec4(${fmtFloat(arr[offset])}, ${fmtFloat(arr[offset + 1])}, ${fmtFloat(
    arr[offset + 2]
  )}, ${fmtFloat(arr[offset + 3])})`;
}

function fmtVec3(arr, offset = 0) {
  return `vec3(${fmtFloat(arr[offset])}, ${fmtFloat(arr[offset + 1])}, ${fmtFloat(
    arr[offset + 2]
  )})`;
}

function fmtVec2(arr, offset = 0) {
  return `vec2(${fmtFloat(arr[offset])}, ${fmtFloat(arr[offset + 1])})`;
}

const POLY10_TERMS = 10;
const LUT32_GRID = 32;
const LUT32_INV_MAX = 1.0 / (LUT32_GRID - 1);
const POLY10_RIDGE_LAMBDA = 1e-3;

let cachedPoly10InvAtA = null;

function invertSymmetric10x10(mat) {
  const n = POLY10_TERMS;
  const stride = 2 * n;
  const aug = new Float64Array(n * stride);
  for (let i = 0; i < n; i++) {
    for (let j = 0; j < n; j++) {
      aug[i * stride + j] = mat[i * n + j];
    }
    aug[i * stride + (n + i)] = 1.0;
  }

  for (let col = 0; col < n; col++) {
    let pivotRow = col;
    let pivotAbs = Math.abs(aug[col * stride + col]);
    for (let r = col + 1; r < n; r++) {
      const v = Math.abs(aug[r * stride + col]);
      if (v > pivotAbs) {
        pivotAbs = v;
        pivotRow = r;
      }
    }
    if (pivotAbs < 1e-12) {
      throw new Error("Singular 10x10 normal matrix in LUT polynomial fitter.");
    }
    if (pivotRow !== col) {
      const rowA = col * stride;
      const rowB = pivotRow * stride;
      for (let k = col; k < stride; k++) {
        const tmp = aug[rowA + k];
        aug[rowA + k] = aug[rowB + k];
        aug[rowB + k] = tmp;
      }
    }

    const rowCol = col * stride;
    const invPivot = 1.0 / aug[rowCol + col];
    for (let k = col; k < stride; k++) {
      aug[rowCol + k] *= invPivot;
    }

    for (let r = 0; r < n; r++) {
      if (r === col) continue;
      const rowR = r * stride;
      const factor = aug[rowR + col];
      if (factor === 0.0) continue;
      for (let k = col; k < stride; k++) {
        aug[rowR + k] -= factor * aug[rowCol + k];
      }
    }
  }

  const inv = new Float64Array(n * n);
  for (let i = 0; i < n; i++) {
    for (let j = 0; j < n; j++) {
      inv[i * n + j] = aug[i * stride + (n + j)];
    }
  }
  return inv;
}

const POLY10_EXPONENTS = [
  [0, 0, 0], // 1.0
  [1, 0, 0], // r
  [0, 1, 0], // g
  [0, 0, 1], // b
  [2, 0, 0], // r*r
  [0, 2, 0], // g*g
  [0, 0, 2], // b*b
  [1, 1, 0], // r*g
  [0, 1, 1], // g*b
  [1, 0, 1], // b*r
];

function getPoly10InvAtA() {
  if (cachedPoly10InvAtA) return cachedPoly10InvAtA;
  const n = POLY10_TERMS;
  // Exact 1D power sums S_k = sum_{i=0..31} (i/31)^k for k = 0..4
  const moments = new Float64Array(5);
  for (let i = 0; i < LUT32_GRID; i++) {
    const u = i * LUT32_INV_MAX;
    let p = 1.0;
    for (let k = 0; k < 5; k++) {
      moments[k] += p;
      p *= u;
    }
  }

  const ata = new Float64Array(n * n);
  for (let i = 0; i < n; i++) {
    const [ri, gi, bi] = POLY10_EXPONENTS[i];
    for (let j = i; j < n; j++) {
      const [rj, gj, bj] = POLY10_EXPONENTS[j];
      const val = moments[ri + rj] * moments[gi + gj] * moments[bi + bj];
      ata[i * n + j] = val;
      ata[j * n + i] = val;
    }
    ata[i * n + i] += POLY10_RIDGE_LAMBDA;
  }

  cachedPoly10InvAtA = invertSymmetric10x10(ata);
  return cachedPoly10InvAtA;
}

// Fits a 32^3 LUT (32,768 RGB samples in .cube R-fastest order) via ridge least-squares
// into a 10-term 3D RGB polynomial transform per output channel:
//   basis = [1.0, r, g, b, r*r, g*g, b*b, r*g, g*b, b*r]
// Fits residual (LUT(x) - x) and adds back identity linear terms so ridge shrinks toward identity.
export function fitLut32ToPoly10(lut32Data) {
  const n = POLY10_TERMS;
  const invAtA = getPoly10InvAtA();
  const rhsR = new Float64Array(n);
  const rhsG = new Float64Array(n);
  const rhsB = new Float64Array(n);

  let idx = 0;
  for (let bi = 0; bi < LUT32_GRID; bi++) {
    const b = bi * LUT32_INV_MAX;
    const b2 = b * b;
    for (let gi = 0; gi < LUT32_GRID; gi++) {
      const g = gi * LUT32_INV_MAX;
      const g2 = g * g;
      const gb = g * b;
      for (let ri = 0; ri < LUT32_GRID; ri++) {
        const r = ri * LUT32_INV_MAX;
        const r2 = r * r;
        const rg = r * g;
        const br = b * r;

        const outR = Number.isFinite(lut32Data[idx]) ? lut32Data[idx] : r;
        const outG = Number.isFinite(lut32Data[idx + 1]) ? lut32Data[idx + 1] : g;
        const outB = Number.isFinite(lut32Data[idx + 2]) ? lut32Data[idx + 2] : b;
        idx += 3;

        const dr = outR - r;
        const dg = outG - g;
        const db = outB - b;

        rhsR[0] += dr;
        rhsG[0] += dg;
        rhsB[0] += db;
        rhsR[1] += dr * r;
        rhsG[1] += dg * r;
        rhsB[1] += db * r;
        rhsR[2] += dr * g;
        rhsG[2] += dg * g;
        rhsB[2] += db * g;
        rhsR[3] += dr * b;
        rhsG[3] += dg * b;
        rhsB[3] += db * b;
        rhsR[4] += dr * r2;
        rhsG[4] += dg * r2;
        rhsB[4] += db * r2;
        rhsR[5] += dr * g2;
        rhsG[5] += dg * g2;
        rhsB[5] += db * g2;
        rhsR[6] += dr * b2;
        rhsG[6] += dg * b2;
        rhsB[6] += db * b2;
        rhsR[7] += dr * rg;
        rhsG[7] += dg * rg;
        rhsB[7] += db * rg;
        rhsR[8] += dr * gb;
        rhsG[8] += dg * gb;
        rhsB[8] += db * gb;
        rhsR[9] += dr * br;
        rhsG[9] += dg * br;
        rhsB[9] += db * br;
      }
    }
  }

  const coeffs = new Array(n);
  for (let i = 0; i < n; i++) {
    const row = i * n;
    let cr = 0.0;
    let cg = 0.0;
    let cb = 0.0;
    for (let j = 0; j < n; j++) {
      const aij = invAtA[row + j];
      cr += aij * rhsR[j];
      cg += aij * rhsG[j];
      cb += aij * rhsB[j];
    }
    coeffs[i] = [
      Number.isFinite(cr) ? cr : 0.0,
      Number.isFinite(cg) ? cg : 0.0,
      Number.isFinite(cb) ? cb : 0.0,
    ];
  }

  // Restore identity linear basis: r -> R, g -> G, b -> B
  coeffs[1][0] += 1.0;
  coeffs[2][1] += 1.0;
  coeffs[3][2] += 1.0;

  return coeffs;
}

function resolveSkinProtect(options, activeLut, params) {
  const raw =
    options && options.skinProtect !== undefined
      ? options.skinProtect
      : activeLut && activeLut.skinProtect !== undefined
        ? activeLut.skinProtect
        : params && params.skinProtect !== undefined
          ? params.skinProtect
          : 0.75;
  const num = Number(raw);
  if (!Number.isFinite(num)) return 0.75;
  const norm = num > 1.0 ? num / 100.0 : num;
  return Math.min(1.0, Math.max(0.0, norm));
}

const GLSL_LUT_POLY10_AND_PROTECT = `vec3 kfEvalLutPoly10(vec3 rgb) {
    vec3 c = clamp(rgb, 0.0, 1.0);
    float r = c.r;
    float g = c.g;
    float b = c.b;
    vec3 outRgb = kLutPoly0
        + kLutPoly1 * r
        + kLutPoly2 * g
        + kLutPoly3 * b
        + kLutPoly4 * (r * r)
        + kLutPoly5 * (g * g)
        + kLutPoly6 * (b * b)
        + kLutPoly7 * (r * g)
        + kLutPoly8 * (g * b)
        + kLutPoly9 * (b * r);
    return clamp(outRgb, 0.0, 1.0);
}

vec3 kfClampBlackFloor(vec3 gradedRgb, vec3 origRgb, float maxBlackLift) {
    float srcLuma = dot(origRgb, vec3(0.2126, 0.7152, 0.0722));
    float toeMask = smoothstep(0.0, 0.08, srcLuma);
    vec3 floorCap = origRgb + vec3(maxBlackLift);
    vec3 capped = min(gradedRgb, floorCap);
    return clamp(mix(capped, gradedRgb, toeMask), 0.0, 1.0);
}

vec3 kfRgbToOklab(vec3 rgb) {
    vec3 c = clamp(rgb, 0.0, 1.0);
    float lr = kfSrgbToLin(c.r);
    float lg = kfSrgbToLin(c.g);
    float lb = kfSrgbToLin(c.b);

    float l = pow(max(0.41222147 * lr + 0.53633254 * lg + 0.05144599 * lb, 1e-5), 0.33333333);
    float m = pow(max(0.21190350 * lr + 0.68069955 * lg + 0.10739696 * lb, 1e-5), 0.33333333);
    float s = pow(max(0.08830246 * lr + 0.28171884 * lg + 0.62997870 * lb, 1e-5), 0.33333333);

    return vec3(
        0.21045426 * l + 0.79361779 * m - 0.00407205 * s,
        1.97799850 * l - 2.42859221 * m + 0.45059371 * s,
        0.02590404 * l + 0.78277177 * m - 0.80867577 * s
    );
}

vec3 kfOklabToRgb(vec3 lab) {
    float l_ = lab.x + 0.39633778 * lab.y + 0.21580376 * lab.z;
    float m_ = lab.x - 0.10556135 * lab.y - 0.06385417 * lab.z;
    float s_ = lab.x - 0.08948418 * lab.y - 1.29148555 * lab.z;

    float l3 = l_ * l_ * l_;
    float m3 = m_ * m_ * m_;
    float s3 = s_ * s_ * s_;

    float outLr = 4.07674166 * l3 - 3.30771159 * m3 + 0.23096993 * s3;
    float outLg = -1.26843800 * l3 + 2.60975740 * m3 - 0.34131940 * s3;
    float outLb = -0.00419609 * l3 - 0.70341861 * m3 + 1.70761470 * s3;

    return vec3(kfLinToSrgb(outLr), kfLinToSrgb(outLg), kfLinToSrgb(outLb));
}

// Analytical OKLab Skin-Tone Protection (18 deg - 58 deg hue band)
vec3 kfApplyOklabSkinProtect(vec3 origRgb, vec3 gradedRgb, float protectStrength) {
    if (protectStrength <= 1e-4) {
        return gradedRgb;
    }
    vec3 lab0 = kfRgbToOklab(origRgb);
    float c0 = sqrt(lab0.y * lab0.y + lab0.z * lab0.z);
    if (c0 < 0.020 || c0 > 0.150 || lab0.x < 0.24 || lab0.x > 0.92) {
        return gradedRgb;
    }
    float h0 = atan(lab0.z, lab0.y) * 57.2957795;
    if (h0 < 0.0) {
        h0 += 360.0;
    }
    float hueMask = smoothstep(12.0, 18.0, h0) * (1.0 - smoothstep(58.0, 64.0, h0));
    float chromaMask = smoothstep(0.020, 0.032, c0) * (1.0 - smoothstep(0.118, 0.150, c0));
    float lumaMask = smoothstep(0.24, 0.34, lab0.x) * (1.0 - smoothstep(0.82, 0.92, lab0.x));
    float skinMask = clamp(hueMask * chromaMask * lumaMask, 0.0, 1.0);
    if (skinMask <= 1e-4) {
        return gradedRgb;
    }

    vec3 lab1 = kfRgbToOklab(gradedRgb);
    float h1 = (abs(lab1.y) + abs(lab1.z)) > 1e-5 ? atan(lab1.z, lab1.y) * 57.2957795 : h0;
    if (h1 < 0.0) {
        h1 += 360.0;
    }
    float outsideBand = (h1 < 18.0 || h1 > 58.0) ? 1.0 : 0.0;

    float chromaRetain = clamp(skinMask * protectStrength * (0.48 + 0.24 * outsideBand), 0.0, 0.85);
    float lumaRetain = clamp(skinMask * protectStrength * 0.15, 0.0, 0.30);

    vec3 safeLab = vec3(
        mix(lab1.x, lab0.x, lumaRetain),
        mix(lab1.y, lab0.y, chromaRetain),
        mix(lab1.z, lab0.z, chromaRetain)
    );
    return clamp(kfOklabToRgb(safeLab), 0.0, 1.0);
}
`;

function clampFiniteToSpec(raw, spec) {
  const lo = Number.isFinite(spec.min) ? spec.min : -Infinity;
  const hi = Number.isFinite(spec.max) ? spec.max : Infinity;
  const def = Number.isFinite(spec.default) ? spec.default : 0.0;
  const num = typeof raw === "number" ? raw : Number(raw);
  const base = Number.isFinite(num) ? num : def;
  const clamped = Math.min(hi, Math.max(lo, base));
  const rounded = Math.round(clamped * 1e6) / 1e6;
  return rounded === 0 ? 0 : rounded;
}

// Sanitizes a Keyflow scalar values object strictly against declared BASE_PARAMS bounds.
export function sanitizeKfplugParamValues(values, { requireAllKeys = true } = {}) {
  const src = values && typeof values === "object" ? values : {};
  const out = {};

  if (requireAllKeys) {
    for (const spec of BASE_PARAMS) {
      out[spec.id] = clampFiniteToSpec(src[spec.id], spec);
    }
    return out;
  }

  for (const [k, v] of Object.entries(src)) {
    const spec = BASE_PARAM_MAP[k];
    if (!spec) continue;
    out[k] = clampFiniteToSpec(v, spec);
  }
  return out;
}

// Sanitizes shader pass definitions, enforcing whole integer pass indices (Math.round).
export function sanitizeKfplugPasses(passes) {
  const list = Array.isArray(passes) && passes.length > 0
    ? passes
    : [{ shader: "pass0.frag", scale: 1.0 }];

  return list.map((pass, idx) => {
    const src = pass && typeof pass === "object" ? pass : {};
    const shader =
      typeof src.shader === "string" && src.shader.trim()
        ? src.shader.trim()
        : `pass${idx}.frag`;
    const rawScale = Number(src.scale);
    const scale = Number.isFinite(rawScale)
      ? Math.round(Math.min(4.0, Math.max(0.1, rawScale)) * 1e4) / 1e4
      : 1.0;

    const clean = { ...src, shader, scale };
    for (const field of PASS_INDEX_FIELDS) {
      if (field in clean && clean[field] !== undefined && clean[field] !== null) {
        const rawIdx = Number(clean[field]);
        const intIdx = Number.isFinite(rawIdx) ? Math.round(rawIdx) : Math.max(0, idx - 1);
        clean[field] = Math.max(0, Math.min(Math.max(0, idx - 1), intIdx));
      }
    }
    if (Array.isArray(clean.inputPasses)) {
      clean.inputPasses = clean.inputPasses.map((pIdx) => {
        const rawIdx = Number(pIdx);
        const intIdx = Number.isFinite(rawIdx) ? Math.round(rawIdx) : 0;
        return Math.max(0, Math.min(Math.max(0, idx - 1), intIdx));
      });
    }
    return clean;
  });
}

// Validates pure GLSL ES 1.00 compliance and uniform parity for Keyflow's shader compiler.
export function validateKfplugGlsl(shaderSource, declaredParams = BASE_PARAMS) {
  const errors = [];
  if (typeof shaderSource !== "string" || !shaderSource.trim()) {
    return { valid: false, errors: ["Shader source is empty."] };
  }

  // 1. Disallow non-finite literals
  if (/\b(?:NaN|Infinity|undefined|null)\b/.test(shaderSource)) {
    errors.push("Shader contains non-finite or invalid JS literal (NaN/Infinity/undefined).");
  }

  // 2. Disallow WebGL2 / GLSL ES 3.00-only syntax
  const forbiddenEs3Patterns = [
    { re: /#version\s+300\b/, label: "#version 300 es directive" },
    { re: /\bsampler3D\b/, label: "sampler3D (WebGL2 only)" },
    { re: /\btexelFetch\s*\(/, label: "texelFetch() (WebGL2 only)" },
    { re: /\blayout\s*\(/, label: "layout() qualifier (WebGL2 only)" },
    { re: /\b(?:uint|uvec[234])\b/, label: "unsigned int type (WebGL2 only)" },
    { re: /\btexture\s*\(/, label: "texture() (must use texture2D in GLSL ES 1.00)" },
    { re: /\btanh\s*\(/, label: "built-in tanh() (must use kfTanh in GLSL ES 1.00)" },
    {
      re: /^\s*(?:in|out)\s+(?:(?:lowp|mediump|highp)\s+)?(?:float|vec[234]|mat[234])\b/m,
      label: "ES 3.00 in/out shader interface qualifier",
    },
  ];
  for (const rule of forbiddenEs3Patterns) {
    if (rule.re.test(shaderSource)) {
      errors.push(`Unsupported WebGL2 / GLSL ES 3.00 syntax detected: ${rule.label}.`);
    }
  }

  // 3. Required Keyflow GLSL ES 1.00 bindings & strict disallow of unbound samplers (e.g. uLutTex)
  if (!/uniform\s+sampler2D\s+uTexture\s*;/.test(shaderSource)) {
    errors.push("Missing required 'uniform sampler2D uTexture;' declaration.");
  }
  const samplerRegex = /uniform\s+sampler2D\s+([A-Za-z0-9_]+)\s*;/g;
  let match;
  while ((match = samplerRegex.exec(shaderSource)) !== null) {
    if (match[1] !== "uTexture") {
      errors.push(
        `Unsupported external sampler uniform '${match[1]}' detected; Keyflow Mobile only binds built-in 'uTexture'.`
      );
    }
  }
  if (!/varying\s+vec2\s+vTex\s*;/.test(shaderSource)) {
    errors.push("Missing required 'varying vec2 vTex;' declaration.");
  }
  if (!/\bgl_FragColor\b/.test(shaderSource)) {
    errors.push("Missing required 'gl_FragColor' output assignment.");
  }
  if (!/void\s+main\s*\(\s*\)/.test(shaderSource)) {
    errors.push("Missing required 'void main()' entrypoint.");
  }

  // 4. Verify all declared params have matching uniform float u<CapitalizedId>
  const expectedUniforms = new Set(
    declaredParams.map((p) => `u${p.id.charAt(0).toUpperCase()}${p.id.slice(1)}`)
  );
  const foundUniforms = new Set();
  const uniformRegex = /uniform\s+float\s+([A-Za-z0-9_]+)\s*;/g;
  while ((match = uniformRegex.exec(shaderSource)) !== null) {
    foundUniforms.add(match[1]);
  }
  for (const uName of expectedUniforms) {
    if (!foundUniforms.has(uName)) {
      errors.push(`Declared param uniform '${uName}' is missing from pass0.frag.`);
    }
  }
  for (const uName of foundUniforms) {
    if (!expectedUniforms.has(uName)) {
      errors.push(`Shader uniform '${uName}' is not declared in effect.json params.`);
    }
  }
  const otherUniformRegex = /uniform\s+(?!sampler2D\b|float\b)([A-Za-z0-9_]+)\s+([A-Za-z0-9_]+)\s*;/g;
  while ((match = otherUniformRegex.exec(shaderSource)) !== null) {
    errors.push(
      `Unsupported non-scalar uniform '${match[1]} ${match[2]}' is not bound by Keyflow Mobile.`
    );
  }

  // 5. Verify float constant declarations include decimal points (no bare integers)
  const constFloatRegex = /const\s+float\s+[A-Za-z0-9_]+\s*=\s*([^;]+);/g;
  while ((match = constFloatRegex.exec(shaderSource)) !== null) {
    const valStr = match[1].trim();
    if (!/^-?\d+\.\d+(?:[eE][+-]?\d+)?$/.test(valStr)) {
      errors.push(`Invalid GLSL float constant literal '${valStr}' (must include decimal point).`);
    }
  }

  return { valid: errors.length === 0, errors };
}

// Strict end-to-end validator for manifest.json, effect.json, and pass0.frag.
export function validateKfplugPackage(manifestData, effectData, shaderPass0) {
  const errors = [];

  if (!manifestData || typeof manifestData !== "object") {
    errors.push("manifest.json payload is missing.");
  } else {
    if (!Number.isInteger(manifestData.format) || manifestData.format !== 1) {
      errors.push("manifest.format must be integer 1.");
    }
    if (!Number.isInteger(manifestData.api) || manifestData.api !== 1) {
      errors.push("manifest.api must be integer 1.");
    }
    if (!Number.isInteger(manifestData.versionCode) || manifestData.versionCode < 1) {
      errors.push("manifest.versionCode must be a positive integer.");
    }
    if (!manifestData.id || typeof manifestData.id !== "string") {
      errors.push("manifest.id must be a non-empty string.");
    }
    if (!Array.isArray(manifestData.effects) || !manifestData.effects.includes(effectData?.id)) {
      errors.push("manifest.effects must include effect.id.");
    }
  }

  if (!effectData || typeof effectData !== "object") {
    errors.push("effect.json payload is missing.");
  } else {
    if ("textures" in effectData || "lut3d" in effectData) {
      errors.push(
        "effect.json must not declare external 'textures' or 'lut3d' bindings (unsupported on Keyflow Mobile)."
      );
    }

    const params = Array.isArray(effectData.params) ? effectData.params : [];
    const paramMap = new Map();
    if (params.length === 0) {
      errors.push("effect.params must contain at least one parameter.");
    }
    for (const spec of params) {
      if (!spec || typeof spec.id !== "string" || !spec.id) {
        errors.push("Encountered parameter declaration without valid id.");
        continue;
      }
      if (!Number.isFinite(spec.min) || !Number.isFinite(spec.max) || !Number.isFinite(spec.default)) {
        errors.push(`Param '${spec.id}' has non-finite min/max/default.`);
      } else if (spec.min > spec.max || spec.default < spec.min || spec.default > spec.max) {
        errors.push(`Param '${spec.id}' default/min/max bounds are inconsistent.`);
      }
      if (!Number.isInteger(spec.decimals) || spec.decimals < 0) {
        errors.push(`Param '${spec.id}' decimals must be a non-negative integer.`);
      }
      paramMap.set(spec.id, spec);
    }

    const checkValueMap = (label, obj, requireAll) => {
      if (!obj || typeof obj !== "object") {
        errors.push(`${label} is missing.`);
        return;
      }
      if (requireAll) {
        for (const [id] of paramMap) {
          if (!(id in obj)) {
            errors.push(`${label} is missing required param '${id}'.`);
          }
        }
      }
      for (const [k, v] of Object.entries(obj)) {
        const spec = paramMap.get(k);
        if (!spec) {
          errors.push(`${label} contains undeclared param '${k}'.`);
          continue;
        }
        if (typeof v !== "number" || !Number.isFinite(v)) {
          errors.push(`${label}.${k} is not a finite number (${String(v)}).`);
        } else if (v < spec.min || v > spec.max) {
          errors.push(`${label}.${k} (${v}) is outside [${spec.min}, ${spec.max}].`);
        }
      }
    };

    checkValueMap("newInstanceValues", effectData.newInstanceValues, true);
    checkValueMap("thumbnailValues", effectData.thumbnailValues, true);

    if (!Array.isArray(effectData.presets) || effectData.presets.length === 0) {
      errors.push("effect.presets must contain at least one preset.");
    } else {
      effectData.presets.forEach((pr, idx) => {
        checkValueMap(`presets[${idx}].values`, pr?.values, idx === 0);
      });
    }

    if (Array.isArray(effectData.colors)) {
      effectData.colors.forEach((c, idx) => {
        for (const ch of ["r", "g", "b"]) {
          if (!paramMap.has(c?.[ch])) {
            errors.push(`colors[${idx}].${ch} references undeclared param '${c?.[ch]}'.`);
          }
        }
      });
    }

    if (!Array.isArray(effectData.passes) || effectData.passes.length === 0) {
      errors.push("effect.passes must contain at least one shader pass.");
    } else {
      effectData.passes.forEach((pass, idx) => {
        if (!pass || typeof pass.shader !== "string" || !pass.shader.trim()) {
          errors.push(`passes[${idx}].shader must be a non-empty string.`);
        }
        if (typeof pass.scale !== "number" || !Number.isFinite(pass.scale) || pass.scale <= 0) {
          errors.push(`passes[${idx}].scale must be a finite positive number.`);
        }
        for (const field of PASS_INDEX_FIELDS) {
          if (field in pass && pass[field] !== undefined && pass[field] !== null) {
            if (!Number.isInteger(pass[field]) || pass[field] < 0 || pass[field] >= idx) {
              errors.push(`passes[${idx}].${field} must be a whole integer in [0, ${Math.max(0, idx - 1)}].`);
            }
          }
        }
        if (Array.isArray(pass.inputPasses)) {
          pass.inputPasses.forEach((pIdx, j) => {
            if (!Number.isInteger(pIdx) || pIdx < 0 || pIdx >= idx) {
              errors.push(`passes[${idx}].inputPasses[${j}] must be a valid whole integer pass index.`);
            }
          });
        }
      });
    }

    if (effectData.cinemaHybrid && typeof effectData.cinemaHybrid === "object") {
      const ch = effectData.cinemaHybrid;
      for (const arrKey of ["polyR", "polyG", "polyB", "hueShift", "hueSat", "hueLuma"]) {
        const arr = ch[arrKey];
        if (!Array.isArray(arr) || !arr.every((x) => typeof x === "number" && Number.isFinite(x))) {
          errors.push(`cinemaHybrid.${arrKey} contains non-finite values.`);
        }
      }
      if (
        "filmicShoulder" in ch &&
        (typeof ch.filmicShoulder !== "number" ||
          !Number.isFinite(ch.filmicShoulder) ||
          ch.filmicShoulder < 0.0 ||
          ch.filmicShoulder > 1.0)
      ) {
        errors.push("cinemaHybrid.filmicShoulder must be finite in [0.0, 1.0].");
      }
    }

    const glslCheck = validateKfplugGlsl(shaderPass0, params);
    if (!glslCheck.valid) {
      errors.push(...glslCheck.errors);
    }
  }

  return { valid: errors.length === 0, errors };
}

const GRADE_MIX_RETURN = "return mix(origRgb, finalRgb, clamp(uGradeMix, 0.0, 1.0));";
const GRADE_FUNCTION_UNMIXED = GRADE_FUNCTION.includes(GRADE_MIX_RETURN)
  ? GRADE_FUNCTION.replace(GRADE_MIX_RETURN, "return finalRgb;")
  : GRADE_FUNCTION;

// Builds self-contained pass0.frag for .kfplug with pure GLSL ES 1.00.
// Samples ONLY Keyflow Mobile's built-in `uTexture` and declared scalar parameter uniforms.
// When an active 32^3 LUT is present, compiles the 32,768-node cube via fast ridge
// least-squares into 10 hardcoded `const vec3` polynomial coefficients (30 floats total),
// paired with analytical OKLab Skin-Tone Protection (18°-58°) and Black Floor clamping.
export function buildKfplugFragmentShader(
  safeParams,
  inputProfile = "rec709",
  activeLut = null,
  lutMix = 1.0,
  options = {}
) {
  const hasLut = Boolean(activeLut && activeLut.data && activeLut.size);
  const preservePostTrims = Boolean(hasLut && activeLut.applyPostGrade);
  const p = sanitizeParams(
    hasLut
      ? preservePostTrims
        ? { ...safeParams, autoGradeMix: 0.0, filmicShoulder: 0.0 }
        : { ...DEFAULT_PARAMS, autoGradeMix: 0.0, filmicShoulder: 0.0 }
      : safeParams
  );
  const logCode = getLogProfileCode(inputProfile || safeParams?.inputProfile);
  const polyBlock = [0, 1, 2, 3, 4]
    .map(
      (i) =>
        `    uPolyR[${i}] = ${fmtVec4(p.polyR, i * 4)};\n` +
        `    uPolyG[${i}] = ${fmtVec4(p.polyG, i * 4)};\n` +
        `    uPolyB[${i}] = ${fmtVec4(p.polyB, i * 4)};`
    )
    .join("\n");

  const clampedLutMix = Math.min(1.0, Math.max(0.0, Number.isFinite(lutMix) ? lutMix : 1.0));
  const clampedFilmic = Math.min(
    1.0,
    Math.max(0.0, Number.isFinite(p.filmicShoulder) ? p.filmicShoulder : 0.0)
  );

  let lutPolyConsts = "";
  if (hasLut) {
    const lut32Data =
      options && options.lut32Data instanceof Float32Array
        ? options.lut32Data
        : composeLutTo32(activeLut, 1.0, null, "rec709");
    const poly10 = fitLut32ToPoly10(lut32Data);
    const blackLuma = Math.max(
      0.0,
      0.2126 * (Number.isFinite(lut32Data[0]) ? lut32Data[0] : 0.0) +
        0.7152 * (Number.isFinite(lut32Data[1]) ? lut32Data[1] : 0.0) +
        0.0722 * (Number.isFinite(lut32Data[2]) ? lut32Data[2] : 0.0)
    );
    const blackFloorMaxLift = Math.min(0.035, Math.max(0.0, blackLuma));
    const skinProtect = resolveSkinProtect(options, activeLut, safeParams);

    const coeffLines = poly10
      .map((c, idx) => `const vec3 kLutPoly${idx} = ${fmtVec3(c)};`)
      .join("\n");

    lutPolyConsts = `${coeffLines}
const float kLutMix = ${fmtFloat(clampedLutMix)};
const float kSkinProtect = ${fmtFloat(skinProtect)};
const float kBlackFloorMaxLift = ${fmtFloat(blackFloorMaxLift)};
`;
  }

  const kfplugUniforms = `uniform float uGradeMix;
uniform float uAutoGradeMix;
uniform float uExposure;
uniform float uContrast;
uniform float uPivot;
uniform float uHighlights;
uniform float uShadows;
uniform float uTemp;
uniform float uTint;
uniform float uSat;
uniform float uVib;

uniform float uLiftR;
uniform float uLiftG;
uniform float uLiftB;

uniform float uGammaR;
uniform float uGammaG;
uniform float uGammaB;

uniform float uGainR;
uniform float uGainG;
uniform float uGainB;

vec4 uPolyR[5];
vec4 uPolyG[5];
vec4 uPolyB[5];
const vec4 uHueShiftA = ${fmtVec4(p.hueShift, 0)};
const vec2 uHueShiftB = ${fmtVec2(p.hueShift, 4)};
const vec4 uHueSatA = ${fmtVec4(p.hueSat, 0)};
const vec2 uHueSatB = ${fmtVec2(p.hueSat, 4)};
const vec4 uHueLumaA = ${fmtVec4(p.hueLuma, 0)};
const vec2 uHueLumaB = ${fmtVec2(p.hueLuma, 4)};
const float uFilmicShoulder = ${fmtFloat(clampedFilmic)};
const float uBakedLogProfile = ${fmtFloat(logCode)};
${lutPolyConsts}`;

  const logBlock = logCode > 0 ? `\n${GLSL_LOG_PROFILE_FUNCTIONS}\n` : "";
  const inputTransformLine =
    logCode > 0
      ? "    vec3 origRgb = kfApplyLogProfile(rawRgb, uBakedLogProfile);"
      : "    vec3 origRgb = rawRgb;";

  if (!hasLut) {
    const gradeBody = `    float srcLuma = dot(origRgb, vec3(0.2126, 0.7152, 0.0722));
    vec3 graded = kfGrade(origRgb);
    float toeProtect = smoothstep(0.0, 0.04, srcLuma);
    graded = min(graded, origRgb) + max(graded - origRgb, vec3(0.0)) * toeProtect;`;

    return `${PRECISION_HEADER}
uniform sampler2D uTexture;
varying vec2 vTex;

${kfplugUniforms}
${GRADE_FUNCTION}${logBlock}
void main() {
    vec4 c = texture2D(uTexture, vTex);
    float a = clamp(c.a, 0.0, 1.0);
    if (a <= 1e-5) {
        gl_FragColor = vec4(0.0);
        return;
    }

${polyBlock}

    vec3 rawRgb = clamp(c.rgb / max(a, 1e-5), 0.0, 1.0);
${inputTransformLine}
${gradeBody}
    gl_FragColor = vec4(clamp(graded, 0.0, 1.0) * a, a);
}
`;
  }

  return `${PRECISION_HEADER}
uniform sampler2D uTexture;
varying vec2 vTex;

${kfplugUniforms}
${GRADE_FUNCTION_UNMIXED}
${GLSL_LUT_POLY10_AND_PROTECT}${logBlock}
void main() {
    vec4 c = texture2D(uTexture, vTex);
    float a = clamp(c.a, 0.0, 1.0);
    if (a <= 1e-5) {
        gl_FragColor = vec4(0.0);
        return;
    }

${polyBlock}

    vec3 rawRgb = clamp(c.rgb / max(a, 1e-5), 0.0, 1.0);
${inputTransformLine}
    float srcLuma = dot(origRgb, vec3(0.2126, 0.7152, 0.0722));
    vec3 polyRgb = kfEvalLutPoly10(origRgb);
    polyRgb = kfClampBlackFloor(polyRgb, origRgb, kBlackFloorMaxLift);
    polyRgb = kfApplyOklabSkinProtect(origRgb, polyRgb, kSkinProtect);
    vec3 lutRgb = clamp(mix(origRgb, polyRgb, kLutMix), 0.0, 1.0);
    vec3 graded = kfGrade(lutRgb);
    float toeProtect = smoothstep(0.0, 0.04, srcLuma);
    graded = min(graded, lutRgb) + max(graded - lutRgb, vec3(0.0)) * toeProtect;
    vec3 finalRgb = mix(origRgb, clamp(graded, 0.0, 1.0), clamp(uGradeMix, 0.0, 1.0));
    gl_FragColor = vec4(clamp(finalRgb, 0.0, 1.0) * a, a);
}
`;
}

function toScalarValues(sanitized) {
  const raw = {};
  for (const key of Object.keys(DEFAULT_PARAMS)) {
    raw[key] = sanitized[key];
  }
  raw.autoGradeMix = sanitized.autoGradeMix ?? 0.0;
  return sanitizeKfplugParamValues(raw, { requireAllKeys: true });
}

// Builds and strictly validates manifestData, effectData, and pass0.frag before packaging.
export function buildKfplugPackageData(
  params,
  presetName,
  author,
  description,
  inputProfile = "rec709",
  activeLut = null,
  lutMix = 1.0,
  options = {}
) {
  const hasLut = Boolean(activeLut && activeLut.data && activeLut.size);
  const resolvedProfile = resolveLogProfileId(inputProfile || params?.inputProfile);
  const cleanName = sanitizeMetadataText(presetName, "Custom Grade", 64);
  const cleanAuthor = sanitizeMetadataText(author, "TFBAGAS", 64);
  const defaultDesc = `Grading preset generated with ToneBench from reference '${cleanName}'.`;
  const cleanDescription = sanitizeMetadataText(description, defaultDesc, 200);

  const cleanSlug = cleanName.replace(/[^a-zA-Z0-9]/g, "").toLowerCase().slice(0, 16) || "grade";
  const pkgId = `com.keyflow.matchgrade.${cleanSlug}`;
  const effectId = `matchgrade_${cleanSlug}`;
  const displayName = `Match Grade (${cleanName})`;

  const words = cleanName.match(/[a-zA-Z0-9]+/g) || [];
  const cleanPresetId =
    "preset" +
    (words.map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join("").slice(0, 24) || "Match");

  // Strict sanitation: finite, no -0, clamped strictly to Keyflow declared slider ranges.
  const preservePostTrims = Boolean(hasLut && activeLut.applyPostGrade);
  const fullSafe = sanitizeParams(
    hasLut
      ? preservePostTrims
        ? { ...params, autoGradeMix: 0.0, filmicShoulder: 0.0 }
        : { ...DEFAULT_PARAMS, autoGradeMix: 0.0, filmicShoulder: 0.0 }
      : params
  );
  const safeValues = toScalarValues(fullSafe);
  const shaderPass0 = buildKfplugFragmentShader(
    fullSafe,
    resolvedProfile,
    activeLut,
    lutMix,
    options
  );

  const safePresets = PRESETS.map((pr) => {
    const sanPr = sanitizeParams({ ...pr.values });
    const rawVals = { autoGradeMix: 0.0 };
    for (const k of Object.keys(pr.values)) {
      rawVals[k] = sanPr[k];
    }
    return {
      ...pr,
      values: sanitizeKfplugParamValues(rawVals, { requireAllKeys: false }),
    };
  });

  const safePasses = sanitizeKfplugPasses([{ shader: "pass0.frag", scale: 1.0 }]);

  const effectData = {
    id: effectId,
    name: displayName,
    category: "Warna",
    thumbnailStyle: "split",
    thumbnailInset: 0.05,
    params: BASE_PARAMS,
    colors: BASE_COLORS,
    presets: [
      {
        id: cleanPresetId,
        label: cleanName.slice(0, 32),
        values: { ...safeValues },
      },
      ...safePresets,
    ],
    newInstanceValues: { ...safeValues },
    thumbnailValues: { ...safeValues },
    passes: safePasses,
    cinemaHybrid: {
      polyR: fullSafe.polyR,
      polyG: fullSafe.polyG,
      polyB: fullSafe.polyB,
      hueShift: fullSafe.hueShift,
      hueSat: fullSafe.hueSat,
      hueLuma: fullSafe.hueLuma,
      filmicShoulder: fullSafe.filmicShoulder,
      inputProfile: resolvedProfile,
    },
  };

  const manifestData = {
    format: 1,
    api: 1,
    id: pkgId,
    name: displayName,
    version: "1.0.0",
    versionCode: 1,
    author: cleanAuthor,
    description: cleanDescription,
    license: "MIT",
    effects: [effectId],
  };

  const validation = validateKfplugPackage(manifestData, effectData, shaderPass0);
  if (!validation.valid) {
    throw new Error(`Invalid .kfplug package: ${validation.errors.join(" | ")}`);
  }

  const safeFileName = cleanName.replace(/[^a-zA-Z0-9_-]/g, "_") || "Grade";
  const fileName = `Match_Grade_${safeFileName}.kfplug`;

  return {
    manifestData,
    effectData,
    shaderPass0,
    effectId,
    displayName,
    fileName,
    validation,
  };
}

export async function generateKfplug(
  params,
  presetName,
  author,
  description,
  inputProfile = "rec709",
  activeLut = null,
  lutMix = 1.0,
  options = {}
) {
  if (!checkAllowedHost()) {
    throw new Error("Export is restricted to the official domain.");
  }

  const {
    manifestData,
    effectData,
    shaderPass0,
    effectId,
    displayName,
    fileName,
  } = buildKfplugPackageData(
    params,
    presetName,
    author,
    description,
    inputProfile,
    activeLut,
    lutMix,
    options
  );

  const zip = new JSZip();
  zip.file("manifest.json", JSON.stringify(manifestData, null, 2));
  zip.file(`effects/${effectId}/effect.json`, JSON.stringify(effectData, null, 2));
  zip.file(`effects/${effectId}/pass0.frag`, shaderPass0);

  const blob = await zip.generateAsync({ type: "blob", compression: "DEFLATE" });

  return { blob, fileName, displayName };
}

export { downloadBlob } from "./download.js";
