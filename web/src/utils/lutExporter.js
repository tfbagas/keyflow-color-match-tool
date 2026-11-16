import { prepareGrade, gradeRGB, sanitizeParams } from "./gradeEngine.js";
import { checkAllowedHost, sanitizeMetadataText } from "./kfplugPackager.js";

export const LUT_SIZE = 33;

// Builds a 33x33x33 3D LUT (35,937 RGB nodes, R fastest, then G, then B,
// 6 decimals) from the Color Match Engine v2 equation.
export function generateLutText(params, title = "Match Grade", size = LUT_SIZE) {
  const G = prepareGrade(sanitizeParams(params));
  const cleanTitle = sanitizeMetadataText(title, "Match Grade", 64);
  const lines = [
    `# Created by Color Match Tool for Keyflow (tfbagas)`,
    `TITLE "${cleanTitle}"`,
    `LUT_3D_SIZE ${size}`,
    `DOMAIN_MIN 0.000000 0.000000 0.000000`,
    `DOMAIN_MAX 1.000000 1.000000 1.000000`,
  ];

  const out = [0, 0, 0];
  const denom = size - 1;
  const fmt = (v) => {
    const c = Number.isFinite(v) ? Math.min(1, Math.max(0, v)) : 0;
    return (c <= 0 ? 0 : c).toFixed(6);
  };

  for (let b = 0; b < size; b++) {
    for (let g = 0; g < size; g++) {
      for (let r = 0; r < size; r++) {
        gradeRGB(G, r / denom, g / denom, b / denom, out);
        lines.push(`${fmt(out[0])} ${fmt(out[1])} ${fmt(out[2])}`);
      }
    }
  }
  return lines.join("\n") + "\n";
}

export function generateLutFile(params, title, ext = "cube") {
  if (!checkAllowedHost()) {
    throw new Error("Export is restricted to the official domain.");
  }
  const text = generateLutText(params, title);
  const blob = new Blob([text], { type: "text/plain;charset=utf-8" });
  const safe = sanitizeMetadataText(title, "Grade", 64).replace(/[^a-zA-Z0-9_-]/g, "_") || "Grade";
  const fileName = `Match_Grade_${safe}.${ext}`;
  return { blob, fileName };
}
