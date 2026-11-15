/**
 * Color Grading Math Engine (JavaScript Port)
 * -------------------------------------------
 * Rec. 709 Luminance, 256-bin Histogram Percentiles,
 * Neutral Mask White Balance, 3-Way Color Wheels, and GLSL pass0.frag Simulation.
 */

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

function clamp(val, min, max) {
  return Math.min(max, Math.max(min, val));
}

function round2(val) {
  return Math.round(val * 100) / 100;
}

/**
 * Analyzes pixel data from a raw ImageData buffer (RGBA).
 */
export function analyzeImagePixels(rgbaArray, numPixels, onStage) {
  if (onStage) onStage("Analyzing colors & luminance...");

  const rArr = new Float32Array(numPixels);
  const gArr = new Float32Array(numPixels);
  const bArr = new Float32Array(numPixels);
  const lumArr = new Float32Array(numPixels);

  // 1. Rec. 709 Perceptual Luminance & 256-bin Histogram
  const hist = new Uint32Array(256);

  for (let i = 0, p = 0; i < rgbaArray.length; i += 4, p++) {
    const r = rgbaArray[i] / 255.0;
    const g = rgbaArray[i + 1] / 255.0;
    const b = rgbaArray[i + 2] / 255.0;

    rArr[p] = r;
    gArr[p] = g;
    bArr[p] = b;

    const lum = 0.2126 * r + 0.7152 * g + 0.0722 * b;
    lumArr[p] = lum;

    const bin = clamp(Math.round(lum * 255), 0, 255);
    hist[bin]++;
  }

  if (onStage) onStage("Extracting grading characteristics...");

  // 2. Percentiles from Histogram (O(1) lookup over 256 bins)
  function getPercentile(targetPct) {
    const targetCount = (targetPct / 100.0) * numPixels;
    let accumulated = 0;
    for (let b = 0; b < 256; b++) {
      accumulated += hist[b];
      if (accumulated >= targetCount) {
        return b / 255.0;
      }
    }
    return 1.0;
  }

  const p5 = getPercentile(5);
  const p50 = getPercentile(50);
  const p95 = getPercentile(95);

  const exposure = clamp(Math.log2(Math.max(p50, 0.02) / 0.435), -1.5, 1.5);
  const dynRange = p95 - p5;
  const contrast = clamp(dynRange / 0.65, 0.5, 1.8);
  const pivot = clamp((p5 + p95) / 2.0, 0.2, 0.8);

  const shadows = clamp((p5 - 0.04) * 2.5, -0.5, 0.5);
  const highlights = clamp((0.96 - p95) * -2.5, -0.5, 0.5);

  // 3. White Balance (Temperature & Tint)
  let neutRSum = 0, neutGSum = 0, neutBSum = 0, neutCount = 0;
  let allRSum = 0, allGSum = 0, allBSum = 0;

  for (let i = 0; i < numPixels; i++) {
    const r = rArr[i], g = gArr[i], b = bArr[i], l = lumArr[i];
    allRSum += r;
    allGSum += g;
    allBSum += b;

    const chromaDiff = Math.abs(r - g) + Math.abs(g - b);
    if (chromaDiff < 0.18 && l > 0.2 && l < 0.8) {
      neutRSum += r;
      neutGSum += g;
      neutBSum += b;
      neutCount++;
    }
  }

  const neutR = neutCount > 100 ? neutRSum / neutCount : allRSum / numPixels;
  const neutG = neutCount > 100 ? neutGSum / neutCount : allGSum / numPixels;
  const neutB = neutCount > 100 ? neutBSum / neutCount : allBSum / numPixels;

  const temp = clamp((neutR - neutB) * 2.2, -1.0, 1.0);
  const tint = clamp(((neutR + neutB) * 0.5 - neutG) * 2.5, -1.0, 1.0);

  if (onStage) onStage("Calculating grading parameters...");

  // 4. 3-Way Split Toning (Lift, Gamma, Gain)
  let shadowR = 0, shadowG = 0, shadowB = 0, shadowL = 0, shadowCount = 0;
  let midR = 0, midG = 0, midB = 0, midL = 0, midCount = 0;
  let highR = 0, highG = 0, highB = 0, highL = 0, highCount = 0;

  for (let i = 0; i < numPixels; i++) {
    const r = rArr[i], g = gArr[i], b = bArr[i], l = lumArr[i];
    if (l < 0.33) {
      shadowR += r; shadowG += g; shadowB += b; shadowL += l; shadowCount++;
    } else if (l <= 0.66) {
      midR += r; midG += g; midB += b; midL += l; midCount++;
    } else {
      highR += r; highG += g; highB += b; highL += l; highCount++;
    }
  }

  function getSwatchTint(sr, sg, sb, sl, sc) {
    if (sc > 64) {
      const mr = sr / sc, mg = sg / sc, mb = sb / sc, ml = sl / sc;
      const tr = clamp(0.5 + (mr - ml) * 1.6, 0.05, 0.95);
      const tg = clamp(0.5 + (mg - ml) * 1.6, 0.05, 0.95);
      const tb = clamp(0.5 + (mb - ml) * 1.6, 0.05, 0.95);
      return [tr, tg, tb];
    }
    return [0.5, 0.5, 0.5];
  }

  const [liftR, liftG, liftB] = getSwatchTint(shadowR, shadowG, shadowB, shadowL, shadowCount);
  const [gammaR, gammaG, gammaB] = getSwatchTint(midR, midG, midB, midL, midCount);
  const [gainR, gainG, gainB] = getSwatchTint(highR, highG, highB, highL, highCount);

  // 5. Saturation & Vibrance Analysis
  let satSum = 0;
  const satArr = new Float32Array(numPixels);
  for (let i = 0; i < numPixels; i++) {
    const r = rArr[i], g = gArr[i], b = bArr[i];
    const maxC = Math.max(r, g, b);
    const minC = Math.min(r, g, b);
    const s = (maxC - minC) / Math.max(maxC, 1e-4);
    satArr[i] = s;
    satSum += s;
  }

  const meanSat = satSum / numPixels;
  let satVarSum = 0;
  for (let i = 0; i < numPixels; i++) {
    const diff = satArr[i] - meanSat;
    satVarSum += diff * diff;
  }
  const stdSat = Math.sqrt(satVarSum / numPixels);
  const sat = clamp(meanSat / 0.32, 0.1, 2.0);
  const vib = clamp((stdSat - 0.15) * 2.0, -0.8, 0.8);

  return {
    gradeMix: 1.0,
    exposure: round2(exposure),
    contrast: round2(contrast),
    pivot: round2(pivot),
    shadows: round2(shadows),
    highlights: round2(highlights),
    temp: round2(temp),
    tint: round2(tint),
    sat: round2(sat),
    vib: round2(vib),
    liftR: round2(liftR),
    liftG: round2(liftG),
    liftB: round2(liftB),
    gammaR: round2(gammaR),
    gammaG: round2(gammaG),
    gammaB: round2(gammaB),
    gainR: round2(gainR),
    gainG: round2(gainG),
    gainB: round2(gainB),
  };
}

/**
 * Simulates Keyflow pass0.frag shader on raw ImageData buffer in-place.
 */
export function simulateGradePixels(sourceData, targetData, params) {
  const pExposure = params.exposure ?? 0.0;
  const pTemp = params.temp ?? 0.0;
  const pTint = params.tint ?? 0.0;
  const pContrast = params.contrast ?? 1.0;
  const pPivot = params.pivot ?? 0.435;
  const pShadows = params.shadows ?? 0.0;
  const pHighlights = params.highlights ?? 0.0;
  const pSat = params.sat ?? 1.0;
  const pVib = params.vib ?? 0.0;
  const pMix = params.gradeMix ?? 1.0;

  const expMultiplier = Math.pow(2.0, pExposure);

  const liftR = ((params.liftR ?? 0.5) - 0.5) * 2.0;
  const liftG = ((params.liftG ?? 0.5) - 0.5) * 2.0;
  const liftB = ((params.liftB ?? 0.5) - 0.5) * 2.0;

  const gammaR = ((params.gammaR ?? 0.5) - 0.5) * 2.0;
  const gammaG = ((params.gammaG ?? 0.5) - 0.5) * 2.0;
  const gammaB = ((params.gammaB ?? 0.5) - 0.5) * 2.0;

  const gainR = ((params.gainR ?? 0.5) - 0.5) * 2.0;
  const gainG = ((params.gainG ?? 0.5) - 0.5) * 2.0;
  const gainB = ((params.gainB ?? 0.5) - 0.5) * 2.0;

  const len = sourceData.length;

  for (let i = 0; i < len; i += 4) {
    const a = sourceData[i + 3] / 255.0;
    if (a <= 1e-4) {
      targetData[i] = 0;
      targetData[i + 1] = 0;
      targetData[i + 2] = 0;
      targetData[i + 3] = 0;
      continue;
    }

    const origR = sourceData[i] / 255.0;
    const origG = sourceData[i + 1] / 255.0;
    const origB = sourceData[i + 2] / 255.0;

    // 1. Exposure
    let r = origR * expMultiplier;
    let g = origG * expMultiplier;
    let b = origB * expMultiplier;

    // 2. White Balance
    r += pTemp * 0.12 + pTint * 0.06;
    g -= pTint * 0.12;
    b -= pTemp * 0.12 - pTint * 0.06;
    r = Math.max(0.0, r);
    g = Math.max(0.0, g);
    b = Math.max(0.0, b);

    // 3. Luminance (Rec. 709)
    const lum = 0.2126 * r + 0.7152 * g + 0.0722 * b;

    // 4. 3-Way Split Toning
    const wShadow = clamp(1.0 - lum * 2.5, 0.0, 1.0);
    const wHigh = clamp((lum - 0.5) * 2.0, 0.0, 1.0);
    const wMid = clamp(1.0 - Math.abs(lum - 0.45) * 2.5, 0.0, 1.0);

    r += liftR * wShadow * 0.35 + gammaR * wMid * 0.35 + gainR * wHigh * 0.35;
    g += liftG * wShadow * 0.35 + gammaG * wMid * 0.35 + gainG * wHigh * 0.35;
    b += liftB * wShadow * 0.35 + gammaB * wMid * 0.35 + gainB * wHigh * 0.35;

    r += pShadows * wShadow * 0.25 + pHighlights * wHigh * 0.25;
    g += pShadows * wShadow * 0.25 + pHighlights * wHigh * 0.25;
    b += pShadows * wShadow * 0.25 + pHighlights * wHigh * 0.25;

    // 5. Contrast with Pivot
    r = (r - pPivot) * pContrast + pPivot;
    g = (g - pPivot) * pContrast + pPivot;
    b = (b - pPivot) * pContrast + pPivot;

    // 6. Saturation & Vibrance
    const lumPost = 0.2126 * r + 0.7152 * g + 0.0722 * b;
    const maxC = Math.max(r, g, b);
    const minC = Math.min(r, g, b);
    const curSat = (maxC - minC) / Math.max(maxC, 1e-4);

    const vibBonus = pVib * (1.0 - curSat);
    const satTotal = clamp(pSat + vibBonus, 0.0, 3.0);

    r = lumPost + satTotal * (r - lumPost);
    g = lumPost + satTotal * (g - lumPost);
    b = lumPost + satTotal * (b - lumPost);

    // 7. Blend Mix
    r = clamp(r, 0.0, 1.0);
    g = clamp(g, 0.0, 1.0);
    b = clamp(b, 0.0, 1.0);

    const finalR = origR * (1.0 - pMix) + r * pMix;
    const finalG = origG * (1.0 - pMix) + g * pMix;
    const finalB = origB * (1.0 - pMix) + b * pMix;

    targetData[i] = Math.round(clamp(finalR, 0.0, 1.0) * 255.0);
    targetData[i + 1] = Math.round(clamp(finalG, 0.0, 1.0) * 255.0);
    targetData[i + 2] = Math.round(clamp(finalB, 0.0, 1.0) * 255.0);
    targetData[i + 3] = sourceData[i + 3];
  }
}
