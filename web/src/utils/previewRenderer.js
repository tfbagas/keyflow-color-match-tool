import { prepareGrade, evaluateGradeRGB } from "./gradeEngine.js";

// CPU preview for still images. Uses the exact same equation as the GLSL
// shader (WebGL video preview and .kfplug output) via evaluateGradeRGB().
export function simulateGradePixels(sourceData, targetData, params, simulateLogInput = false) {
  const G = prepareGrade(params);
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

    evaluateGradeRGB(G, rawR, rawG, rawB, out, simulateLogInput);

    targetData[i] = Math.round(out[0] * 255.0);
    targetData[i + 1] = Math.round(out[1] * 255.0);
    targetData[i + 2] = Math.round(out[2] * 255.0);
    targetData[i + 3] = sourceData[i + 3];
  }
}
