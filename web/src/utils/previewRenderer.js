import { prepareGrade, evaluateGradeRGB } from "./gradeEngine.js";
import { applyLogProfileRGB, isLogProfileActive } from "./logProfiles.js";
import {
  LUT32_SIZE,
  evaluateLut32Tetrahedral,
  sampleLut3DTetrahedral,
} from "../engine/lut3d.ts";

// CPU preview for still images & live scopes. Uses the exact same equation as
// PREVIEW_FRAGMENT (including 32^3 tetrahedral LUT + optional post-LUT trims).
export function simulateGradePixels(
  sourceData,
  targetData,
  params,
  simulateLogInput = false,
  activeLut = null,
  lutMix = 1.0
) {
  const hasLut = Boolean(activeLut && activeLut.data && activeLut.size);
  const usePostGrade = !hasLut || Boolean(activeLut.applyPostGrade);
  const G = usePostGrade ? prepareGrade(params) : null;
  const useLog = isLogProfileActive(simulateLogInput);
  const alpha = Math.min(1.5, Math.max(0.0, Number.isFinite(lutMix) ? lutMix : 1.0));
  const isFast32 =
    hasLut &&
    activeLut.kind !== "1d" &&
    activeLut.size === LUT32_SIZE &&
    (!activeLut.dMin ||
      (activeLut.dMin[0] === 0 && activeLut.dMin[1] === 0 && activeLut.dMin[2] === 0)) &&
    (!activeLut.dMax ||
      (activeLut.dMax[0] === 1 && activeLut.dMax[1] === 1 && activeLut.dMax[2] === 1));

  const logBuf = [0, 0, 0];
  const lutOut = [0, 0, 0];
  const out = [0, 0, 0];
  const len = sourceData.length;

  for (let i = 0; i < len; i += 4) {
    const a = sourceData[i + 3] / 255.0;
    if (a <= 1e-5) {
      targetData[i] = 0;
      targetData[i + 1] = 0;
      targetData[i + 2] = 0;
      targetData[i + 3] = 0;
      continue;
    }

    let inR = sourceData[i] / 255.0;
    let inG = sourceData[i + 1] / 255.0;
    let inB = sourceData[i + 2] / 255.0;

    if (hasLut) {
      if (useLog) {
        applyLogProfileRGB(inR, inG, inB, simulateLogInput, logBuf);
        inR = logBuf[0];
        inG = logBuf[1];
        inB = logBuf[2];
      }

      if (isFast32) {
        evaluateLut32Tetrahedral(activeLut.data, inR, inG, inB, lutOut);
      } else if (activeLut.kind === "1d") {
        const N = activeLut.size;
        const dMin = activeLut.dMin || [0, 0, 0];
        const dMax = activeLut.dMax || [1, 1, 1];
        const rgb = [inR, inG, inB];
        for (let c = 0; c < 3; c++) {
          const span = dMax[c] - dMin[c];
          const norm = Math.min(1, Math.max(0, (rgb[c] - dMin[c]) / (span > 1e-6 ? span : 1)));
          const x = norm * (N - 1);
          const i0 = Math.floor(x);
          const i1 = Math.min(N - 1, i0 + 1);
          const f = x - i0;
          lutOut[c] = activeLut.data[i0 * 3 + c] * (1 - f) + activeLut.data[i1 * 3 + c] * f;
        }
      } else {
        sampleLut3DTetrahedral(
          activeLut.data,
          activeLut.size,
          inR,
          inG,
          inB,
          lutOut,
          activeLut.dMin,
          activeLut.dMax
        );
      }

      const bR = Math.min(1.0, Math.max(0.0, inR + (lutOut[0] - inR) * alpha));
      const bG = Math.min(1.0, Math.max(0.0, inG + (lutOut[1] - inG) * alpha));
      const bB = Math.min(1.0, Math.max(0.0, inB + (lutOut[2] - inB) * alpha));

      if (G) {
        evaluateGradeRGB(G, bR, bG, bB, out, "rec709");
      } else {
        out[0] = bR;
        out[1] = bG;
        out[2] = bB;
      }
    } else {
      evaluateGradeRGB(G, inR, inG, inB, out, simulateLogInput);
    }

    targetData[i] = Math.round(out[0] * 255.0);
    targetData[i + 1] = Math.round(out[1] * 255.0);
    targetData[i + 2] = Math.round(out[2] * 255.0);
    targetData[i + 3] = sourceData[i + 3];
  }
}
