function clamp(val, min, max) {
  return Math.min(max, Math.max(min, val));
}

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

    let r = origR * expMultiplier;
    let g = origG * expMultiplier;
    let b = origB * expMultiplier;

    r += pTemp * 0.12 + pTint * 0.06;
    g -= pTint * 0.12;
    b -= pTemp * 0.12 - pTint * 0.06;
    r = Math.max(0.0, r);
    g = Math.max(0.0, g);
    b = Math.max(0.0, b);

    const lum = 0.2126 * r + 0.7152 * g + 0.0722 * b;

    const wShadow = clamp(1.0 - lum * 2.5, 0.0, 1.0);
    const wHigh = clamp((lum - 0.5) * 2.0, 0.0, 1.0);
    const wMid = clamp(1.0 - Math.abs(lum - 0.45) * 2.5, 0.0, 1.0);

    r += liftR * wShadow * 0.35 + gammaR * wMid * 0.35 + gainR * wHigh * 0.35;
    g += liftG * wShadow * 0.35 + gammaG * wMid * 0.35 + gainG * wHigh * 0.35;
    b += liftB * wShadow * 0.35 + gammaB * wMid * 0.35 + gainB * wHigh * 0.35;

    r += pShadows * wShadow * 0.25 + pHighlights * wHigh * 0.25;
    g += pShadows * wShadow * 0.25 + pHighlights * wHigh * 0.25;
    b += pShadows * wShadow * 0.25 + pHighlights * wHigh * 0.25;

    r = (r - pPivot) * pContrast + pPivot;
    g = (g - pPivot) * pContrast + pPivot;
    b = (b - pPivot) * pContrast + pPivot;

    const lumPost = 0.2126 * r + 0.7152 * g + 0.0722 * b;
    const maxC = Math.max(r, g, b);
    const minC = Math.min(r, g, b);
    const curSat = (maxC - minC) / Math.max(maxC, 1e-4);

    const vibBonus = pVib * (1.0 - curSat);
    const satTotal = clamp(pSat + vibBonus, 0.0, 3.0);

    r = lumPost + satTotal * (r - lumPost);
    g = lumPost + satTotal * (g - lumPost);
    b = lumPost + satTotal * (b - lumPost);

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
