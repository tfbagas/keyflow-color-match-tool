import { analyzeImagePixels } from "../utils/colorGrading.js";

self.onmessage = function (e) {
  const data = e.data || {};
  const { type, jobId, rgbaData, numPixels, targetRgbaData, targetNumPixels, mediaType } = data;

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
  }
};
