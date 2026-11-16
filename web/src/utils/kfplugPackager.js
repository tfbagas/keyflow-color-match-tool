import JSZip from "jszip";
import { KFPLUG_FRAGMENT } from "./gradeShader.js";
import { sanitizeParams } from "./gradeEngine.js";

const SHADER_PASS0 = KFPLUG_FRAGMENT;

const BASE_PARAMS = [
  { id: "gradeMix", label: "Grade Mix / Blend", type: "scalar", default: 1.0, min: 0.0, max: 1.0, displayScale: 100.0, decimals: 0, group: "Master" },
  { id: "exposure", label: "Exposure (EV)", type: "scalar", default: 0.0, min: -2.0, max: 2.0, displayScale: 1.0, decimals: 2, group: "Tone & Contrast" },
  { id: "contrast", label: "Contrast", type: "scalar", default: 1.0, min: 0.5, max: 2.0, displayScale: 1.0, decimals: 2, group: "Tone & Contrast" },
  { id: "pivot", label: "Contrast Pivot", type: "scalar", default: 0.435, min: 0.1, max: 0.9, displayScale: 1.0, decimals: 2, group: "Tone & Contrast" },
  { id: "shadows", label: "Shadows Lift/Crush", type: "scalar", default: 0.0, min: -1.0, max: 1.0, displayScale: 100.0, decimals: 0, group: "Tone & Contrast" },
  { id: "highlights", label: "Highlights Boost/Roll", type: "scalar", default: 0.0, min: -1.0, max: 1.0, displayScale: 100.0, decimals: 0, group: "Tone & Contrast" },
  { id: "temp", label: "Color Temperature", type: "scalar", default: 0.0, min: -1.0, max: 1.0, displayScale: 100.0, decimals: 0, group: "White Balance" },
  { id: "tint", label: "Color Tint", type: "scalar", default: 0.0, min: -1.0, max: 1.0, displayScale: 100.0, decimals: 0, group: "White Balance" },
  { id: "sat", label: "Saturation", type: "scalar", default: 1.0, min: 0.0, max: 2.0, displayScale: 100.0, decimals: 0, group: "Color Balance" },
  { id: "vib", label: "Vibrance", type: "scalar", default: 0.0, min: -1.0, max: 1.0, displayScale: 100.0, decimals: 0, group: "Color Balance" },
  { id: "liftR", label: "Shadows Red", type: "scalar", default: 0.5, min: 0.0, max: 1.0, displayScale: 1.0, decimals: 2, group: "3-Way Toning" },
  { id: "liftG", label: "Shadows Green", type: "scalar", default: 0.5, min: 0.0, max: 1.0, displayScale: 1.0, decimals: 2, group: "3-Way Toning" },
  { id: "liftB", label: "Shadows Blue", type: "scalar", default: 0.5, min: 0.0, max: 1.0, displayScale: 1.0, decimals: 2, group: "3-Way Toning" },
  { id: "gammaR", label: "Midtones Red", type: "scalar", default: 0.5, min: 0.0, max: 1.0, displayScale: 1.0, decimals: 2, group: "3-Way Toning" },
  { id: "gammaG", label: "Midtones Green", type: "scalar", default: 0.5, min: 0.0, max: 1.0, displayScale: 1.0, decimals: 2, group: "3-Way Toning" },
  { id: "gammaB", label: "Midtones Blue", type: "scalar", default: 0.5, min: 0.0, max: 1.0, displayScale: 1.0, decimals: 2, group: "3-Way Toning" },
  { id: "gainR", label: "Highlights Red", type: "scalar", default: 0.5, min: 0.0, max: 1.0, displayScale: 1.0, decimals: 2, group: "3-Way Toning" },
  { id: "gainG", label: "Highlights Green", type: "scalar", default: 0.5, min: 0.0, max: 1.0, displayScale: 1.0, decimals: 2, group: "3-Way Toning" },
  { id: "gainB", label: "Highlights Blue", type: "scalar", default: 0.5, min: 0.0, max: 1.0, displayScale: 1.0, decimals: 2, group: "3-Way Toning" },
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

export function checkAllowedHost() {
  const host = (
    typeof self !== "undefined" && self.location
      ? self.location.hostname
      : typeof window !== "undefined" && window.location
      ? window.location.hostname
      : ""
  ).toLowerCase();

  if (!host) return true;
  return (
    host === "keyflow-color-match-tool.pages.dev" ||
    host.endsWith(".keyflow-color-match-tool.pages.dev") ||
    host === "localhost" ||
    host === "127.0.0.1"
  );
}

export function sanitizeMetadataText(raw, fallback = "", maxLen = 160) {
  if (typeof raw !== "string") return fallback;
  let out = "";
  for (let i = 0; i < raw.length; i++) {
    const code = raw.charCodeAt(i);
    const ch = raw[i];
    if (code <= 0x1f || code === 0x7f) continue;
    if (ch === "<" || ch === ">" || ch === '"') continue;
    out += ch;
  }
  const trimmed = out.trim().slice(0, maxLen);
  return trimmed || fallback;
}

export async function generateKfplug(params, presetName, author, description) {
  if (!checkAllowedHost()) {
    throw new Error("Export is restricted to the official domain.");
  }

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
  const safeValues = sanitizeParams(params);
  const safePresets = PRESETS.map((pr) => ({
    ...pr,
    values: Object.fromEntries(
      Object.keys(pr.values).map((k) => [k, sanitizeParams({ ...pr.values })[k]])
    ),
  }));

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
    passes: [{ shader: "pass0.frag", scale: 1.0 }]
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
  zip.file(`effects/${effectId}/pass0.frag`, SHADER_PASS0);

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
