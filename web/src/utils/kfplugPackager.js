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

// Builds pass0.frag for .kfplug with pure GLSL ES 1.00 and packed vec4 hybrid
// constants + uAutoGradeMix uniform + optional Camera Log input transform
// so Keyflow Mobile renders 1:1 with preview.
export function buildKfplugFragmentShader(safeParams, inputProfile = "rec709") {
  const p = sanitizeParams(safeParams);
  const logCode = getLogProfileCode(inputProfile || safeParams?.inputProfile);
  const polyBlock = [0, 1, 2, 3, 4]
    .map(
      (i) =>
        `    uPolyR[${i}] = ${fmtVec4(p.polyR, i * 4)};\n` +
        `    uPolyG[${i}] = ${fmtVec4(p.polyG, i * 4)};\n` +
        `    uPolyB[${i}] = ${fmtVec4(p.polyB, i * 4)};`
    )
    .join("\n");

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
`;

  const logBlock = logCode > 0 ? `\n${GLSL_LOG_PROFILE_FUNCTIONS}\n` : "";
  const inputTransformLine =
    logCode > 0
      ? "    vec3 origRgb = kfApplyLogProfile(rawRgb, uBakedLogProfile);"
      : "    vec3 origRgb = rawRgb;";

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
    float srcLuma = dot(origRgb, vec3(0.2126, 0.7152, 0.0722));
    float shadowMask = smoothstep(0.015, 0.16, srcLuma);
    float blackProtect = smoothstep(0.0, 0.06, srcLuma) * (0.15 + 0.85 * shadowMask);
    vec3 graded = mix(origRgb, kfGrade(origRgb), blackProtect);
    gl_FragColor = vec4(graded * a, a);
}
`;
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
  inputProfile = "rec709"
) {
  if (!checkAllowedHost()) {
    throw new Error("Export is restricted to the official domain.");
  }

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
  const fullSafe = sanitizeParams(params);
  const safeValues = toScalarValues(fullSafe);
  const shaderPass0 = buildKfplugFragmentShader(fullSafe, resolvedProfile);

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
