import { simulateGradePixels } from "./previewRenderer.js";

export { simulateGradePixels };

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

function checkRuntimeHost() {
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

export function analyzeImagePixels(rgbaArray, numPixels, onStage) {
  if (!checkRuntimeHost()) {
    throw new Error("Unauthorized host environment.");
  }

  if (onStage) onStage("Analyzing colors & luminance...");

  const rArr = new Float32Array(numPixels);
  const gArr = new Float32Array(numPixels);
  const bArr = new Float32Array(numPixels);
  const lumArr = new Float32Array(numPixels);

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

  let neutRSum = 0,
    neutGSum = 0,
    neutBSum = 0,
    neutCount = 0;
  let allRSum = 0,
    allGSum = 0,
    allBSum = 0;

  for (let i = 0; i < numPixels; i++) {
    const r = rArr[i],
      g = gArr[i],
      b = bArr[i],
      l = lumArr[i];
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

  let shadowR = 0,
    shadowG = 0,
    shadowB = 0,
    shadowL = 0,
    shadowCount = 0;
  let midR = 0,
    midG = 0,
    midB = 0,
    midL = 0,
    midCount = 0;
  let highR = 0,
    highG = 0,
    highB = 0,
    highL = 0,
    highCount = 0;

  for (let i = 0; i < numPixels; i++) {
    const r = rArr[i],
      g = gArr[i],
      b = bArr[i],
      l = lumArr[i];
    if (l < 0.33) {
      shadowR += r;
      shadowG += g;
      shadowB += b;
      shadowL += l;
      shadowCount++;
    } else if (l <= 0.66) {
      midR += r;
      midG += g;
      midB += b;
      midL += l;
      midCount++;
    } else {
      highR += r;
      highG += g;
      highB += b;
      highL += l;
      highCount++;
    }
  }

  function getSwatchTint(sr, sg, sb, sl, sc) {
    if (sc > 64) {
      const mr = sr / sc,
        mg = sg / sc,
        mb = sb / sc,
        ml = sl / sc;
      const tr = clamp(0.5 + (mr - ml) * 1.6, 0.05, 0.95);
      const tg = clamp(0.5 + (mg - ml) * 1.6, 0.05, 0.95);
      const tb = clamp(0.5 + (mb - ml) * 1.6, 0.05, 0.95);
      return [tr, tg, tb];
    }
    return [0.5, 0.5, 0.5];
  }

  const [liftR, liftG, liftB] = getSwatchTint(
    shadowR,
    shadowG,
    shadowB,
    shadowL,
    shadowCount
  );
  const [gammaR, gammaG, gammaB] = getSwatchTint(
    midR,
    midG,
    midB,
    midL,
    midCount
  );
  const [gainR, gainG, gainB] = getSwatchTint(
    highR,
    highG,
    highB,
    highL,
    highCount
  );

  let satSum = 0;
  const satArr = new Float32Array(numPixels);
  for (let i = 0; i < numPixels; i++) {
    const r = rArr[i],
      g = gArr[i],
      b = bArr[i];
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
