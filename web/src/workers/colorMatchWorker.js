import { analyzeImagePixels } from "../utils/colorGrading.js";
import { parseLutText, fitParamsToLut } from "../utils/presetImporter.js";

self.onmessage = function (e) {
  const data = e.data || {};
  const {
    type,
    jobId,
    rgbaData,
    numPixels,
    targetRgbaData,
    targetNumPixels,
    mediaType,
    lutText,
  } = data;

  if (type === "analyze") {
    try {
      if (!rgbaData || !numPixels || numPixels < 1) {
        throw new Error("Invalid pixel buffer received by worker.");
      }

      self.postMessage({
        type: "stage",
        jobId,
        stage: "Analyzing colors & luminance...",
      });

      const params = analyzeImagePixels(
        rgbaData,
        numPixels,
        (stageText) => {
          self.postMessage({ type: "stage", jobId, stage: stageText });
        },
        targetRgbaData || null,
        targetNumPixels || 0,
        mediaType || "image"
      );

      self.postMessage({
        type: "stage",
        jobId,
        stage: "Finalizing grading parameters...",
      });
      self.postMessage({ type: "success", jobId, params });
    } catch (err) {
      self.postMessage({
        type: "error",
        jobId,
        error: (err && err.message) || "Failed to analyze image",
      });
    }
    return;
  }

  if (type === "fitLut") {
    try {
      if (typeof lutText !== "string" || !lutText) {
        throw new Error("Empty LUT data received by worker.");
      }
      const lut = parseLutText(lutText);
      const { params, rms } = fitParamsToLut(lut);
      self.postMessage({
        type: "fitLutSuccess",
        jobId,
        params,
        rms,
        kind: lut.kind === "3d" ? `3D LUT ${lut.size}^3` : `1D LUT ${lut.size}`,
        title: lut.title,
      });
    } catch (err) {
      self.postMessage({
        type: "error",
        jobId,
        error: (err && err.message) || "Failed to fit LUT parameters",
      });
    }
  }
};
