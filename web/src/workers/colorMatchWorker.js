import { analyzeImagePixels } from "../utils/colorGrading.js";

self.onmessage = function (e) {
  const { type, rgbaData, numPixels } = e.data;

  if (type === "analyze") {
    try {
      self.postMessage({ type: "stage", stage: "Analyzing colors & luminance..." });

      const params = analyzeImagePixels(rgbaData, numPixels, (stageText) => {
        self.postMessage({ type: "stage", stage: stageText });
      });

      self.postMessage({ type: "stage", stage: "Finalizing grading parameters..." });
      self.postMessage({ type: "success", params });
    } catch (err) {
      self.postMessage({ type: "error", error: err.message || "Failed to analyze image" });
    }
  }
};
