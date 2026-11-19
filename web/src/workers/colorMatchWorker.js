import { getEngine, resolveEngineId, DEFAULT_ENGINE_ID } from "../utils/engineRegistry.js";
import { parseLutText } from "../utils/presetImporter.js";
import { fitPolarisV3ToLut } from "../utils/polarisV3Engine.js";

self.onmessage = function (e) {
  const data = e.data || {};
  const {
    type,
    jobId,
    engineId,
    refBuffer,
    rgbaData,
    numPixels,
    tgtBuffer,
    targetRgbaData,
    targetNumPixels,
    mediaType,
    autoNormalizeTarget,
    inputProfile,
    lutText,
  } = data;

  if (type === "analyze") {
    try {
      const refView =
        refBuffer instanceof ArrayBuffer ? new Uint8ClampedArray(refBuffer) : rgbaData;
      const tgtView =
        tgtBuffer instanceof ArrayBuffer
          ? new Uint8ClampedArray(tgtBuffer)
          : targetRgbaData || null;

      if (!refView || !numPixels || !Number.isFinite(numPixels) || numPixels < 1) {
        throw new Error("Invalid pixel buffer received by worker.");
      }

      self.postMessage({
        type: "stage",
        jobId,
        stage: "Analyzing colors & luminance...",
      });

      const resolvedEngineId = resolveEngineId(engineId || DEFAULT_ENGINE_ID);
      const stageOpts = {
        numPixels,
        targetNumPixels: targetNumPixels || 0,
        mediaType: mediaType || "image",
        autoNormalizeTarget: Boolean(autoNormalizeTarget),
        inputProfile: inputProfile || "rec709",
        onStage: (stageText) => {
          self.postMessage({ type: "stage", jobId, stage: stageText });
        },
      };

      const params = getEngine(resolvedEngineId).analyze(refView, tgtView, stageOpts);

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
      const tgtView =
        tgtBuffer instanceof ArrayBuffer
          ? new Uint8ClampedArray(tgtBuffer)
          : targetRgbaData || null;
      const lut = parseLutText(lutText);
      const { params, rms } = fitPolarisV3ToLut(
        lut,
        tgtView,
        targetNumPixels || 0,
        (stageText) => {
          self.postMessage({ type: "stage", jobId, stage: stageText });
        }
      );
      self.postMessage({
        type: "fitLutSuccess",
        jobId,
        params,
        rms,
        lut,
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
