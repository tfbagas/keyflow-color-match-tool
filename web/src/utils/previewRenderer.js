import { prepareGrade, gradeRGB, applyLogInputRGB } from "./gradeEngine.js";

// CPU preview for still images. Uses the exact same equation as the GLSL
// shader (WebGL video preview and .kfplug output) via gradeRGB().
export function simulateGradePixels(sourceData, targetData, params, simulateLogInput = false) {
  const G = prepareGrade(params);
  const logBuf = [0, 0, 0];
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

    const rawR = sourceData[i] / 255.0;
    const rawG = sourceData[i + 1] / 255.0;
    const rawB = sourceData[i + 2] / 255.0;
    const srcLuma = 0.2126 * rawR + 0.7152 * rawG + 0.0722 * rawB;

    let inR = rawR;
    let inG = rawG;
    let inB = rawB;
    if (simulateLogInput) {
      applyLogInputRGB(inR, inG, inB, logBuf);
      inR = logBuf[0];
      inG = logBuf[1];
      inB = logBuf[2];
    }

    gradeRGB(G, inR, inG, inB, out);

    // Protect pure blacks / letterbox bars from milky lift
    const t = Math.max(0.0, Math.min(1.0, srcLuma / 0.06));
    const blackProtect = t * t * (3.0 - 2.0 * t);
    const finR = rawR * (1.0 - blackProtect) + out[0] * blackProtect;
    const finG = rawG * (1.0 - blackProtect) + out[1] * blackProtect;
    const finB = rawB * (1.0 - blackProtect) + out[2] * blackProtect;

    targetData[i] = Math.round(finR * 255.0);
    targetData[i + 1] = Math.round(finG * 255.0);
    targetData[i + 2] = Math.round(finB * 255.0);
    targetData[i + 3] = sourceData[i + 3];
  }
}
