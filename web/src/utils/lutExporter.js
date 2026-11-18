import { prepareGrade, evaluateGradeRGB, sanitizeParams } from "./gradeEngine.js";
import { checkAllowedHost, sanitizeMetadataText } from "./hostGuard.js";
import { applyLogProfileRGB, isLogProfileActive, resolveLogProfileId } from "./logProfiles.js";
import { makeLutSampler } from "./presetImporter.js";

export const LUT_SIZE = 33;

// Builds a 33x33x33 3D LUT (35,937 RGB nodes, R fastest, then G, then B,
// 6 decimals) from the Color Match Engine equation (or directly from an active
// imported 3D/1D LUT when provided), baking any active Camera Log input profile.
export function generateLutText(
  params,
  title = "Match Grade",
  size = LUT_SIZE,
  inputProfile = "rec709",
  activeLut = null,
  lutMix = 1.0
) {
  const resolvedProfile = resolveLogProfileId(inputProfile || params?.inputProfile);
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

  if (activeLut && activeLut.data && activeLut.size) {
    const sample = makeLutSampler(activeLut);
    const mix = Math.min(1, Math.max(0, Number.isFinite(lutMix) ? lutMix : 1.0));
    const useLog = isLogProfileActive(resolvedProfile);
    const inBuf = [0, 0, 0];

    for (let b = 0; b < size; b++) {
      for (let g = 0; g < size; g++) {
        for (let r = 0; r < size; r++) {
          let inR = r / denom;
          let inG = g / denom;
          let inB = b / denom;
          if (useLog) {
            applyLogProfileRGB(inR, inG, inB, resolvedProfile, inBuf);
            inR = inBuf[0];
            inG = inBuf[1];
            inB = inBuf[2];
          }
          sample(inR, inG, inB, out);
          out[0] = inR + (out[0] - inR) * mix;
          out[1] = inG + (out[1] - inG) * mix;
          out[2] = inB + (out[2] - inB) * mix;
          lines.push(`${fmt(out[0])} ${fmt(out[1])} ${fmt(out[2])}`);
        }
      }
    }
    return lines.join("\n") + "\n";
  }

  const G = prepareGrade(sanitizeParams(params));
  for (let b = 0; b < size; b++) {
    for (let g = 0; g < size; g++) {
      for (let r = 0; r < size; r++) {
        evaluateGradeRGB(G, r / denom, g / denom, b / denom, out, resolvedProfile);
        lines.push(`${fmt(out[0])} ${fmt(out[1])} ${fmt(out[2])}`);
      }
    }
  }
  return lines.join("\n") + "\n";
}

export function generateLutFile(
  params,
  title,
  ext = "cube",
  inputProfile = "rec709",
  size = LUT_SIZE,
  activeLut = null,
  lutMix = 1.0
) {
  if (!checkAllowedHost()) {
    throw new Error("Export is restricted to the official domain.");
  }
  const safeSize = [17, 33, 65].includes(Number(size)) ? Number(size) : LUT_SIZE;
  const text = generateLutText(params, title, safeSize, inputProfile, activeLut, lutMix);
  const blob = new Blob([text], { type: "text/plain;charset=utf-8" });
  const safe = sanitizeMetadataText(title, "Grade", 64).replace(/[^a-zA-Z0-9_-]/g, "_") || "Grade";
  const fileName = `Match_Grade_${safe}.${ext}`;
  return { blob, fileName };
}
