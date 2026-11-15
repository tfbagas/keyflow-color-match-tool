import { analyzeImagePixels } from "../utils/colorGrading.js";

self.onmessage = function (e) {
  const data = e.data || {};
  const { type, rgbaData, numPixels } = data;

  if (type === "analyze") {
    try {
      if (!rgbaData || !numPixels || numPixels < 1) {
        throw new Error("Invalid pixel buffer received by worker.");
      }

      self.postMessage({
        type: "stage",
        stage: "Analyzing colors & luminance...",
      });

      const params = analyzeImagePixels(rgbaData, numPixels, (stageText) => {
        self.postMessage({ type: "stage", stage: stageText });
      });

      self.postMessage({
        type: "stage",
        stage: "Finalizing grading parameters...",
      });
      self.postMessage({ type: "success", params });
    } catch (err) {
      self.postMessage({
        type: "error",
        error: (err && err.message) || "Failed to analyze image",
      });
    }
  }
};
