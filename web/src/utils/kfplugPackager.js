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
import { makeLutSampler } from "./presetImporter.js";

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

function fmtFloat(v) {
  const n = Number.isFinite(v) ? v : 0;
  const s = (n === 0 ? 0 : n).toFixed(6);
  return s;
}

function fmtVec4(arr, offset = 0) {
  return `vec4(${fmtFloat(arr[offset])}, ${fmtFloat(arr[offset + 1])}, ${fmtFloat(
    arr[offset + 2]
  )}, ${fmtFloat(arr[offset + 3])})`;
}

function fmtVec2(arr, offset = 0) {
  return `vec2(${fmtFloat(arr[offset])}, ${fmtFloat(arr[offset + 1])})`;
}

function minifyGlsl(code) {
  return code
    .replace(/\/\/.*$/gm, "")
    .replace(/\s+/g, " ")
    .replace(/\s*([{}();,=+\-*/<>?:\[\]])\s*/g, "$1")
    .trim();
}

function fmtLutComponent(v) {
  const n = Math.min(1, Math.max(0, Number.isFinite(v) ? v : 0));
  const s = n.toFixed(3);
  if (s === "1.000") return "1.";
  if (s === "0.000") return ".0";
  return s.slice(1).replace(/0+$/, "");
}

function buildLutTernaryExpr(nodes, varName, lo, hi) {
  if (lo === hi) {
    return nodes[lo];
  }
  const mid = Math.floor((lo + hi + 1) / 2);
  return `${varName}<${mid}?${buildLutTernaryExpr(nodes, varName, lo, mid - 1)}:${buildLutTernaryExpr(nodes, varName, mid, hi)}`;
}

function buildLutDecisionTree(nodes, varName, lo, hi) {
  if (hi - lo + 1 <= 64) {
    return `v=${buildLutTernaryExpr(nodes, varName, lo, hi)};`;
  }
  const mid = Math.floor((lo + hi + 1) / 2);
  return `if(${varName}<${mid}){${buildLutDecisionTree(nodes, varName, lo, mid - 1)}}else{${buildLutDecisionTree(nodes, varName, mid, hi)}}`;
}

// Packs an arbitrary 3D or 1D LUT into a compact N^3 pure GLSL ES 1.00 lookup table
// using normalized vec3 literals in [0.0, 1.0] and a constant-index binary decision tree
// with trilinear interpolation, compatible with all mobile and desktop GPUs.
function buildBakedLutGlslFunctions(activeLut, N) {
  const sample = makeLutSampler(activeLut);
  const out = [0, 0, 0];
  const total = N * N * N;
  const nodes = new Array(total);
  const denom = Math.max(1, N - 1);

  for (let b = 0; b < N; b++) {
    const bv = b / denom;
    for (let g = 0; g < N; g++) {
      const gv = g / denom;
      for (let r = 0; r < N; r++) {
        const rv = r / denom;
        sample(rv, gv, bv, out);
        nodes[(b * N + g) * N + r] =
          `vec3(${fmtLutComponent(out[0])},${fmtLutComponent(out[1])},${fmtLutComponent(out[2])})`;
      }
    }
  }

  const fetchFn =
    `vec3 fetchLutNode(int i){` +
    `vec3 v=vec3(.0);` +
    buildLutDecisionTree(nodes, "i", 0, total - 1) +
    `return v;` +
    `}`;

  const nMinus1 = `${N - 1}.0`;
  const sampleFn =
    `vec3 kfSampleBakedLut3D(vec3 rgb){` +
    `vec3 pos=clamp(rgb,0.0,1.0)*${nMinus1};` +
    `vec3 i0f=min(floor(pos),vec3(${nMinus1}));` +
    `vec3 i1f=min(i0f+vec3(1.0),vec3(${nMinus1}));` +
    `vec3 f=pos-i0f;` +
    `int r0=int(i0f.r);int g0=int(i0f.g);int b0=int(i0f.b);` +
    `int r1=int(i1f.r);int g1=int(i1f.g);int b1=int(i1f.b);` +
    `int g0n=g0*${N};int g1n=g1*${N};` +
    `int b0n=b0*${N * N};int b1n=b1*${N * N};` +
    `vec3 c000=fetchLutNode(b0n+g0n+r0);` +
    `vec3 c100=fetchLutNode(b0n+g0n+r1);` +
    `vec3 c010=fetchLutNode(b0n+g1n+r0);` +
    `vec3 c110=fetchLutNode(b0n+g1n+r1);` +
    `vec3 c001=fetchLutNode(b1n+g0n+r0);` +
    `vec3 c101=fetchLutNode(b1n+g0n+r1);` +
    `vec3 c011=fetchLutNode(b1n+g1n+r0);` +
    `vec3 c111=fetchLutNode(b1n+g1n+r1);` +
    `vec3 c00=mix(c000,c100,f.r);` +
    `vec3 c10=mix(c010,c110,f.r);` +
    `vec3 c01=mix(c001,c101,f.r);` +
    `vec3 c11=mix(c011,c111,f.r);` +
    `vec3 c0=mix(c00,c10,f.g);` +
    `vec3 c1=mix(c01,c11,f.g);` +
    `return mix(c0,c1,f.b);` +
    `}`;

  return `${fetchFn}\n${sampleFn}\n`;
}

const LUT_GRID_CANDIDATES = [10, 9, 8];
const MAX_FRAG_BYTES = 29500;

function utf8ByteLength(str) {
  if (typeof TextEncoder !== "undefined") {
    return new TextEncoder().encode(str).length;
  }
  return unescape(encodeURIComponent(str)).length;
}

// Builds pass0.frag for .kfplug with pure GLSL ES 1.00 and packed vec4 hybrid
// constants + uAutoGradeMix uniform + optional Camera Log input transform
// so Keyflow Mobile renders 1:1 with preview.
export function buildKfplugFragmentShader(
  safeParams,
  inputProfile = "rec709",
  activeLut = null,
  lutMix = 1.0
) {
  const hasLut = Boolean(activeLut && activeLut.data && activeLut.size);
  const p = sanitizeParams(hasLut ? { ...DEFAULT_PARAMS, autoGradeMix: 0.0 } : safeParams);
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
const float uBakedLogProfile = ${fmtFloat(logCode)};
${hasLut ? `const float uLutMix = ${fmtFloat(clampedLutMix)};\n` : ""}`;

  const logBlock = logCode > 0 ? `\n${GLSL_LOG_PROFILE_FUNCTIONS}\n` : "";
  const inputTransformLine =
    logCode > 0
      ? "    vec3 origRgb = kfApplyLogProfile(rawRgb, uBakedLogProfile);"
      : "    vec3 origRgb = rawRgb;";

  if (!hasLut) {
    const gradeBody = `    float srcLuma = dot(origRgb, vec3(0.2126, 0.7152, 0.0722));
    float shadowMask = smoothstep(0.015, 0.16, srcLuma);
    float blackProtect = smoothstep(0.0, 0.06, srcLuma) * (0.15 + 0.85 * shadowMask);
    vec3 graded = mix(origRgb, kfGrade(origRgb), blackProtect);`;

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
    gl_FragColor = vec4(graded * a, a);
}
`;
  }

  const baseBody = minifyGlsl(`uniform sampler2D uTexture;
varying vec2 vTex;
${kfplugUniforms}
${GRADE_FUNCTION}${logBlock}`);

  const mainFn = minifyGlsl(`void main() {
    vec4 c = texture2D(uTexture, vTex);
    float a = clamp(c.a, 0.0, 1.0);
    if (a <= 1e-5) {
        gl_FragColor = vec4(0.0);
        return;
    }
${polyBlock}
    vec3 rawRgb = clamp(c.rgb / max(a, 1e-5), 0.0, 1.0);
${inputTransformLine}
    vec3 lutRgb = mix(origRgb, kfSampleBakedLut3D(origRgb), uLutMix);
    vec3 graded = clamp(mix(origRgb, kfGrade(lutRgb), clamp(uGradeMix, 0.0, 1.0)), 0.0, 1.0);
    gl_FragColor = vec4(graded * a, a);
}`);

  let fallbackShader = "";
  for (const N of LUT_GRID_CANDIDATES) {
    const lutBlock = buildBakedLutGlslFunctions(activeLut, N);
    const candidate = `${PRECISION_HEADER}${baseBody}\n${lutBlock}${mainFn}\n`;
    fallbackShader = candidate;
    if (utf8ByteLength(candidate) <= MAX_FRAG_BYTES) {
      return candidate;
    }
  }
  return fallbackShader;
}

function toScalarValues(sanitized) {
  const out = {};
  for (const key of Object.keys(DEFAULT_PARAMS)) {
    out[key] = sanitized[key];
  }
  out.autoGradeMix = sanitized.autoGradeMix ?? 0.0;
  return out;
}

export async function generateKfplug(
  params,
  presetName,
  author,
  description,
  inputProfile = "rec709",
  activeLut = null,
  lutMix = 1.0
) {
  if (!checkAllowedHost()) {
    throw new Error("Export is restricted to the official domain.");
  }

  const hasLut = Boolean(activeLut && activeLut.data && activeLut.size);
  const resolvedProfile = resolveLogProfileId(inputProfile || params?.inputProfile);
  const cleanName = sanitizeMetadataText(presetName, "Custom Grade", 64);
  const cleanAuthor = sanitizeMetadataText(author, "TFBAGAS", 64);
  const defaultDesc = `Grading preset matched from reference '${cleanName}'.`;
  const cleanDescription = sanitizeMetadataText(description, defaultDesc, 200);

  const cleanSlug = cleanName.replace(/[^a-zA-Z0-9]/g, "").toLowerCase().slice(0, 16) || "grade";
  const pkgId = `com.keyflow.matchgrade.${cleanSlug}`;
  const effectId = `matchgrade_${cleanSlug}`;
  const displayName = `Match Grade (${cleanName})`;

  const words = cleanName.match(/[a-zA-Z0-9]+/g) || [];
  const cleanPresetId = "preset" + (words.map(w => w.charAt(0).toUpperCase() + w.slice(1)).join("").slice(0, 24) || "Match");

  // Strict sanitation: finite, no -0, clamped to Keyflow slider ranges.
  const fullSafe = sanitizeParams(hasLut ? { ...DEFAULT_PARAMS, autoGradeMix: 0.0 } : params);
  const safeValues = toScalarValues(fullSafe);
  const shaderPass0 = buildKfplugFragmentShader(fullSafe, resolvedProfile, activeLut, lutMix);

  const safePresets = PRESETS.map((pr) => {
    const sanPr = sanitizeParams({ ...pr.values });
    const vals = { autoGradeMix: 0.0 };
    for (const k of Object.keys(pr.values)) {
      vals[k] = sanPr[k];
    }
    return {
      ...pr,
      values: vals,
    };
  });

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
        values: { ...safeValues }
      },
      ...safePresets
    ],
    newInstanceValues: { ...safeValues },
    thumbnailValues: { ...safeValues },
    passes: [{ shader: "pass0.frag", scale: 1.0 }],
    cinemaHybrid: {
      polyR: fullSafe.polyR,
      polyG: fullSafe.polyG,
      polyB: fullSafe.polyB,
      hueShift: fullSafe.hueShift,
      hueSat: fullSafe.hueSat,
      hueLuma: fullSafe.hueLuma,
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
    effects: [effectId]
  };

  const zip = new JSZip();
  zip.file("manifest.json", JSON.stringify(manifestData, null, 2));
  zip.file(`effects/${effectId}/effect.json`, JSON.stringify(effectData, null, 2));
  zip.file(`effects/${effectId}/pass0.frag`, shaderPass0);

  const blob = await zip.generateAsync({ type: "blob", compression: "DEFLATE" });
  const safeFileName = cleanName.replace(/[^a-zA-Z0-9_-]/g, "_") || "Grade";
  const fileName = `Match_Grade_${safeFileName}.kfplug`;

  return { blob, fileName, displayName };
}

export function downloadBlob(blob, fileName) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  setTimeout(() => {
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }, 100);
}
