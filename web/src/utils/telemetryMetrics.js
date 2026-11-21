import { DEFAULT_PARAMS, IDENTITY_HUE6, clamp, sanitizeParams, prepareGrade, evaluateGradeRGB } from "./gradeEngine.js";
import { applyLogProfileRGB, isLogProfileActive } from "./logProfiles.js";
import { LUT32_SIZE, evaluateLut32Tetrahedral, sampleLut3DTetrahedral } from "../engine/lut3d.ts";

function srgbToLin(c) {
  return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
}

function rgbToOklab(r, g, b, out) {
  const lr = srgbToLin(clamp(r, 0, 1));
  const lg = srgbToLin(clamp(g, 0, 1));
  const lb = srgbToLin(clamp(b, 0, 1));
  const l = Math.cbrt(0.4122214708 * lr + 0.5363325363 * lg + 0.0514459929 * lb);
  const m = Math.cbrt(0.2119034982 * lr + 0.6806995451 * lg + 0.1073969566 * lb);
  const s = Math.cbrt(0.0883024619 * lr + 0.2817188376 * lg + 0.6299787005 * lb);
  out[0] = 0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s;
  out[1] = 1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s;
  out[2] = 0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s;
}

/**
 * Applies Skin Protect (0..100%, baseline 75%) deterministically to grading parameters
 * so WebGL preview, CPU scopes, .kfplug, .cube, and .ffx remain 100% 1:1.
 * At 75% (engine baseline), parameters pass through unmodified.
 */
export function applySkinProtectToParams(params, skinProtectPct = 75) {
  const san = sanitizeParams(params);
  const sp = clamp(Number.isFinite(skinProtectPct) ? skinProtectPct : 75, 0, 100);
  if (Math.abs(sp - 75) < 0.5) return san;

  // delta > 0 increases protection (damps skin-sector hue/sat shifts & midtone tint);
  // delta < 0 relaxes protection toward raw look transfer.
  const delta = (sp - 75) / 25; // -3.0 .. +1.0
  const hueScale = delta > 0 ? 1.0 - delta * 0.62 : 1.0 - delta * 0.16;
  const satScale = delta > 0 ? 1.0 - delta * 0.48 : 1.0 - delta * 0.12;
  const gammaDamp = delta > 0 ? 1.0 - delta * 0.25 : 1.0;

  const nextHueShift = (san.hueShift || IDENTITY_HUE6).slice();
  const nextHueSat = (san.hueSat || IDENTITY_HUE6).slice();

  // Sector 0 (Red 0 deg) and Sector 1 (Yellow/Orange 60 deg) span human skin-tone hues
  nextHueShift[0] = clamp(nextHueShift[0] * hueScale, -0.5, 0.5);
  nextHueShift[1] = clamp(nextHueShift[1] * hueScale, -0.5, 0.5);
  nextHueSat[0] = clamp(nextHueSat[0] * satScale, -0.8, 0.8);
  nextHueSat[1] = clamp(nextHueSat[1] * satScale, -0.8, 0.8);

  const gMean = (san.gammaR + san.gammaG + san.gammaB) / 3;
  return sanitizeParams({
    ...san,
    gammaR: gMean + (san.gammaR - gMean) * gammaDamp,
    gammaG: gMean + (san.gammaG - gMean) * gammaDamp,
    gammaB: gMean + (san.gammaB - gMean) * gammaDamp,
    hueShift: nextHueShift,
    hueSat: nextHueSat,
  });
}

/**
 * Computes fast perceptual OKLab Delta-E between reference buffer and graded target buffer,
 * plus skin-tone hue safety check (< 1ms on strided sample).
 */
export function computeLiveColorMetrics(
  refBuf,
  tgtBuf,
  effectiveParams,
  logProfile = "rec709",
  skinProtectPct = 75,
  activeLut = null,
  lutMix = 1.0
) {
  if (!refBuf?.data || !refBuf.numPixels) {
    return { deltaE: null, skinSafe: true };
  }

  const hasLut = Boolean(activeLut && activeLut.data && activeLut.size);
  const alpha = clamp(Number.isFinite(lutMix) ? lutMix : 1.0, 0.0, 1.5);
  const usePostGrade = !hasLut || Boolean(activeLut.applyPostGrade);
  const evalPixel = (gradePrepared, r, g, b, out) => {
    if (hasLut) {
      const lutOut = [0, 0, 0];
      if (activeLut.kind !== "1d" && activeLut.size === LUT32_SIZE) {
        evaluateLut32Tetrahedral(activeLut.data, r, g, b, lutOut);
      } else {
        sampleLut3DTetrahedral(
          activeLut.data,
          activeLut.size,
          r,
          g,
          b,
          lutOut,
          activeLut.dMin,
          activeLut.dMax
        );
      }
      const bR = clamp(r + (lutOut[0] - r) * alpha, 0, 1);
      const bG = clamp(g + (lutOut[1] - g) * alpha, 0, 1);
      const bB = clamp(b + (lutOut[2] - b) * alpha, 0, 1);
      if (usePostGrade && gradePrepared) {
        evaluateGradeRGB(gradePrepared, bR, bG, bB, out);
      } else {
        out[0] = bR;
        out[1] = bG;
        out[2] = bB;
      }
      return;
    }
    evaluateGradeRGB(gradePrepared, r, g, b, out);
  };

  const sampleMeanOklab = (buf, gradePrepared, applyLog, applyGrade) => {
    const data = buf.data;
    const total = buf.numPixels;
    const stride = Math.max(1, Math.floor(total / 256));
    let sumL = 0;
    let sumA = 0;
    let sumB = 0;
    let count = 0;
    let skinDriftSum = 0;
    let skinCount = 0;
    const lab = [0, 0, 0];
    const labOrig = [0, 0, 0];
    const tmp = [0, 0, 0];
    const graded = [0, 0, 0];

    for (let p = 0; p < total; p += stride) {
      const i = p * 4;
      let r = data[i] / 255;
      let g = data[i + 1] / 255;
      let b = data[i + 2] / 255;
      if (applyLog) {
        applyLogProfileRGB(r, g, b, logProfile, tmp);
        r = tmp[0];
        g = tmp[1];
        b = tmp[2];
      }
      if (applyGrade) {
        rgbToOklab(r, g, b, labOrig);
        evalPixel(gradePrepared, r, g, b, graded);
        rgbToOklab(graded[0], graded[1], graded[2], lab);

        // Skin-tone OKLab cluster check: L in [0.35..0.82], C in [0.03..0.15], hue in [25..62 deg]
        const cOrig = Math.hypot(labOrig[1], labOrig[2]);
        if (labOrig[0] >= 0.35 && labOrig[0] <= 0.82 && cOrig >= 0.03 && cOrig <= 0.15) {
          const hOrig = (Math.atan2(labOrig[2], labOrig[1]) * 180) / Math.PI;
          if (hOrig >= 25 && hOrig <= 62) {
            const hNew = (Math.atan2(lab[2], lab[1]) * 180) / Math.PI;
            let dh = Math.abs(hNew - hOrig);
            if (dh > 180) dh = 360 - dh;
            skinDriftSum += dh;
            skinCount++;
          }
        }
      } else {
        rgbToOklab(r, g, b, lab);
      }

      sumL += lab[0];
      sumA += lab[1];
      sumB += lab[2];
      count++;
    }

    if (count === 0) return null;
    return {
      L: sumL / count,
      a: sumA / count,
      b: sumB / count,
      avgSkinHueDrift: skinCount > 0 ? skinDriftSum / skinCount : 0,
    };
  };

  const refMean = sampleMeanOklab(refBuf, null, false, false);
  if (!refMean) return { deltaE: null, skinSafe: true };

  const prep = usePostGrade ? prepareGrade(effectiveParams || DEFAULT_PARAMS) : null;
  const hasLog = isLogProfileActive(logProfile);

  if (tgtBuf?.data && tgtBuf.numPixels > 0) {
    const tgtMean = sampleMeanOklab(tgtBuf, prep, hasLog, true);
    if (!tgtMean) return { deltaE: null, skinSafe: true };
    const dL = refMean.L - tgtMean.L;
    const da = refMean.a - tgtMean.a;
    const db = refMean.b - tgtMean.b;
    // Perceptual OKLab distance mapped to standard ~0..20 Delta-E scale
    const rawDe = Math.sqrt(dL * dL + da * da * 2.2 + db * db * 2.2) * 35.0;
    const deltaE = Number(clamp(rawDe, 0.15, 25.0).toFixed(2));
    const skinSafe = skinProtectPct >= 35 && tgtMean.avgSkinHueDrift <= 14.0;
    return { deltaE, skinSafe };
  }

  // Reference-only mode: evaluate perceptual distance of graded neutral mid-gray vs reference signature
  const neutralOut = [0, 0, 0];
  evalPixel(prep, 0.45, 0.45, 0.45, neutralOut);
  const labN = [0, 0, 0];
  rgbToOklab(neutralOut[0], neutralOut[1], neutralOut[2], labN);
  const dL = refMean.L - labN[0];
  const da = refMean.a - labN[1];
  const db = refMean.b - labN[2];
  const rawDe = Math.sqrt(dL * dL + da * da * 2.0 + db * db * 2.0) * 28.0;
  return {
    deltaE: Number(clamp(rawDe, 0.25, 18.0).toFixed(2)),
    skinSafe: skinProtectPct >= 35,
  };
}
