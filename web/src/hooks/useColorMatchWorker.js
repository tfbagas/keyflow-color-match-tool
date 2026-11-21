import { useRef, useCallback, useEffect } from "react";
import { DEFAULT_ENGINE_ID } from "../utils/engineMetadata";

function buildLut32Object(data, options = {}) {
  return {
    title: options.title || "Keyflow_Altair_Refresh",
    kind: "3d",
    size: 32,
    dMin: [0, 0, 0],
    dMax: [1, 1, 1],
    data,
    sourceEngine: options.sourceEngine,
    applyPostGrade: Boolean(options.applyPostGrade),
  };
}

const ANALYSIS_TIMEOUT_MS = 6000;
const LUT_FIT_TIMEOUT_MS = 15000;
const FALLBACK_MAX_DIM = 320;

function toTransferableBuffer(uint8Clamped, clone = false) {
  if (!uint8Clamped) return null;
  if (
    !clone &&
    uint8Clamped.byteOffset === 0 &&
    uint8Clamped.byteLength === uint8Clamped.buffer.byteLength
  ) {
    return uint8Clamped.buffer;
  }
  return uint8Clamped.slice().buffer;
}

export function useColorMatchWorker({
  referenceRef,
  targetRef,
  captureRgba,
  setIsAnalyzing,
  setStatusText,
  setReferenceError,
  setGradingParams,
  setLastMatchedParams,
  setActiveLut,
}) {
  const workerRef = useRef(null);
  const analysisTimeoutRef = useRef(null);
  const analysisJobIdRef = useRef(0);
  const pendingAnalysisRef = useRef(null);
  const pendingLutFitRef = useRef(null);

  const clearAnalysisTimeout = useCallback(() => {
    if (analysisTimeoutRef.current) {
      clearTimeout(analysisTimeoutRef.current);
      analysisTimeoutRef.current = null;
    }
  }, []);

  const runFallbackAnalysisOrReset = useCallback(
    async (reasonMsg) => {
      clearAnalysisTimeout();
      const pending = pendingAnalysisRef.current;
      pendingAnalysisRef.current = null;

      // Re-sample small (<= 320px) buffers on-demand instead of retaining large pixel buffers in RAM.
      const refSource = referenceRef.current?.imgElement;
      const recRef =
        referenceRef.current?.sampledPixels ||
        (refSource ? captureRgba(refSource, FALLBACK_MAX_DIM) : null);

      let recTgt = null;
      const tgtInfo = targetRef.current;
      if (tgtInfo?.kind === "video" && tgtInfo.videoEl?.readyState >= 2) {
        recTgt = captureRgba(tgtInfo.videoEl, FALLBACK_MAX_DIM);
      } else if (tgtInfo?.imgElement) {
        recTgt = captureRgba(tgtInfo.imgElement, FALLBACK_MAX_DIM);
      }

      if (recRef && recRef.numPixels > 0) {
        try {
          const { runEngineAnalysis } = await import("../utils/engineRegistry");
          const { params: fallbackParams, lut32, lutMeta } = runEngineAnalysis(
            pending?.engineId || DEFAULT_ENGINE_ID,
            recRef.data,
            recTgt ? recTgt.data : null,
            {
              numPixels: recRef.numPixels,
              targetNumPixels: recTgt ? recTgt.numPixels : 0,
              mediaType: pending?.mediaType || "image",
              autoNormalizeTarget: Boolean(pending?.autoNormalizeTarget),
              inputProfile: pending?.inputProfile || "rec709",
              normalizeWeight: pending?.normalizeWeight ?? 1.0,
              sigmaWeight: pending?.sigmaWeight ?? 1.0,
              skinProtect: pending?.skinProtect ?? 0.75,
            }
          );
          const nextLut =
            lut32 instanceof Float32Array
              ? buildLut32Object(lut32, {
                  title: lutMeta?.title || "Keyflow_Altair_Refresh",
                  sourceEngine: lutMeta?.sourceEngine,
                  applyPostGrade: Boolean(lutMeta?.applyPostGrade),
                })
              : null;
          setActiveLut?.(nextLut);
          setIsAnalyzing(false);
          setGradingParams({ ...fallbackParams });
          setLastMatchedParams({ ...fallbackParams });
          setStatusText("Matched");
          return;
        } catch (err) {
          setReferenceError(
            (err && err.message) || reasonMsg || "Failed to analyze reference image."
          );
        }
      } else if (reasonMsg) {
        setReferenceError(reasonMsg);
      }

      setIsAnalyzing(false);
      setStatusText("Error");
    },
    [
      clearAnalysisTimeout,
      captureRgba,
      referenceRef,
      targetRef,
      setIsAnalyzing,
      setGradingParams,
      setLastMatchedParams,
      setActiveLut,
      setReferenceError,
      setStatusText,
    ]
  );

  const initWorker = useCallback(() => {
    if (workerRef.current) {
      workerRef.current.terminate();
    }

    const worker = new Worker(
      new URL("../workers/colorMatchWorker.js", import.meta.url),
      { type: "module" }
    );

    worker.onmessage = (e) => {
      const {
        type,
        jobId,
        params,
        lutBuffer,
        lutMeta,
        bakeMs,
        stage,
        error,
        rms,
        kind,
        title,
        lut,
      } = e.data || {};
      if (jobId !== undefined && jobId !== analysisJobIdRef.current) {
        return;
      }
      if (type === "stage") {
        setStatusText(stage || "Analyzing...");
      } else if (type === "fitLutSuccess" && params) {
        const pendingLut = pendingLutFitRef.current;
        if (pendingLut && pendingLut.jobId === jobId) {
          clearTimeout(pendingLut.timer);
          pendingLutFitRef.current = null;
          pendingLut.resolve({ params, rms, kind, title, lut });
        }
      } else if (type === "success" && params) {
        clearAnalysisTimeout();
        pendingAnalysisRef.current = null;
        const nextLut =
          lutBuffer instanceof ArrayBuffer
            ? buildLut32Object(new Float32Array(lutBuffer), {
                title: lutMeta?.title || "Keyflow_Altair_Refresh",
                sourceEngine: lutMeta?.sourceEngine,
                applyPostGrade: Boolean(lutMeta?.applyPostGrade),
              })
            : null;
        setActiveLut?.(nextLut);
        setIsAnalyzing(false);
        setGradingParams({ ...params });
        setLastMatchedParams({ ...params });
        const bakeLabel =
          nextLut && Number.isFinite(bakeMs) && bakeMs > 0
            ? `Matched · 32³ (${bakeMs.toFixed(1)}ms)`
            : "Matched";
        setStatusText(bakeLabel);
      } else if (type === "error") {
        const pendingLut = pendingLutFitRef.current;
        if (pendingLut && pendingLut.jobId === jobId) {
          clearTimeout(pendingLut.timer);
          pendingLutFitRef.current = null;
          pendingLut.reject(new Error(error || "Failed to fit LUT."));
          return;
        }
        clearAnalysisTimeout();
        pendingAnalysisRef.current = null;
        setIsAnalyzing(false);
        setReferenceError(error || "Failed to analyze image.");
        setStatusText("Error");
      }
    };

    worker.onerror = (err) => {
      if (err && typeof err.preventDefault === "function") {
        err.preventDefault();
      }
      const pendingLut = pendingLutFitRef.current;
      if (pendingLut) {
        clearTimeout(pendingLut.timer);
        pendingLutFitRef.current = null;
        pendingLut.fallback();
      }
      runFallbackAnalysisOrReset(
        "Background worker encountered an error; recovered on main thread."
      );
    };

    worker.onmessageerror = () => {
      const pendingLut = pendingLutFitRef.current;
      if (pendingLut) {
        clearTimeout(pendingLut.timer);
        pendingLutFitRef.current = null;
        pendingLut.fallback();
      }
      runFallbackAnalysisOrReset(
        "Worker message serialization error; recovered on main thread."
      );
    };

    workerRef.current = worker;
    return worker;
  }, [
    clearAnalysisTimeout,
    runFallbackAnalysisOrReset,
    setGradingParams,
    setIsAnalyzing,
    setLastMatchedParams,
    setActiveLut,
    setReferenceError,
    setStatusText,
  ]);

  // Defer Web Worker spawn until first analysis or LUT fit request so initial mobile boot stays lean.
  const ensureWorker = useCallback(() => {
    if (workerRef.current) return workerRef.current;
    return initWorker();
  }, [initWorker]);

  useEffect(() => {
    return () => {
      clearAnalysisTimeout();
      if (workerRef.current) {
        workerRef.current.terminate();
        workerRef.current = null;
      }
    };
  }, [clearAnalysisTimeout]);

  const beginAnalysisJob = useCallback(() => {
    return ++analysisJobIdRef.current;
  }, []);

  const isCurrentJob = useCallback((jobId) => {
    return jobId === analysisJobIdRef.current;
  }, []);

  const dispatchAnalysis = useCallback(
    ({
      jobId,
      ref,
      tgt,
      mediaType = "image",
      engineId = DEFAULT_ENGINE_ID,
      autoNormalizeTarget = false,
      inputProfile = "rec709",
      normalizeWeight = 1.0,
      sigmaWeight = 1.0,
      skinProtect = 0.75,
      preserveBuffers = true,
    }) => {
      if (!ref || !ref.data || !ref.numPixels) return;

      pendingAnalysisRef.current = {
        jobId,
        mediaType,
        engineId,
        autoNormalizeTarget: Boolean(autoNormalizeTarget),
        inputProfile: inputProfile || "rec709",
        normalizeWeight,
        sigmaWeight,
        skinProtect,
      };

      clearAnalysisTimeout();
      analysisTimeoutRef.current = setTimeout(() => {
        analysisJobIdRef.current += 1;
        workerRef.current?.terminate();
        workerRef.current = null;
        initWorker();
        runFallbackAnalysisOrReset(
          "Worker analysis timed out; recovered on main thread."
        );
      }, ANALYSIS_TIMEOUT_MS);

      try {
        const refBuffer = toTransferableBuffer(ref.data, preserveBuffers);
        const tgtBuffer = tgt?.data ? toTransferableBuffer(tgt.data, preserveBuffers) : null;
        const transferables = [refBuffer];
        if (tgtBuffer && tgtBuffer !== refBuffer) {
          transferables.push(tgtBuffer);
        }

        const worker = ensureWorker();
        if (!worker) {
          throw new Error("Worker not initialized.");
        }

        worker.postMessage(
          {
            type: "analyze",
            jobId,
            engineId,
            refBuffer,
            numPixels: ref.numPixels,
            tgtBuffer,
            targetNumPixels: tgt ? tgt.numPixels : 0,
            mediaType,
            autoNormalizeTarget: Boolean(autoNormalizeTarget),
            inputProfile: inputProfile || "rec709",
            normalizeWeight,
            sigmaWeight,
            skinProtect,
          },
          transferables
        );
      } catch {
        runFallbackAnalysisOrReset(
          "Worker unavailable; analyzed on main thread."
        );
      }
    },
    [clearAnalysisTimeout, ensureWorker, initWorker, runFallbackAnalysisOrReset]
  );

  const fitLutInWorker = useCallback((lutText, tgt = null) => {
    return new Promise((resolve, reject) => {
      if (pendingLutFitRef.current) {
        clearTimeout(pendingLutFitRef.current.timer);
        pendingLutFitRef.current.reject(new Error("Superseded by a newer LUT import."));
        pendingLutFitRef.current = null;
      }

      const jobId = ++analysisJobIdRef.current;
      const runMainThreadFallback = async () => {
        try {
          const [{ parseLutText }, { fitPolarisV3ToLut }] = await Promise.all([
            import("../utils/presetImporter"),
            import("../utils/polarisV3Engine"),
          ]);
          const lut = parseLutText(lutText);
          const { params, rms } = fitPolarisV3ToLut(
            lut,
            tgt?.data || null,
            tgt?.numPixels || 0
          );
          resolve({
            params,
            rms,
            lut,
            kind: lut.kind === "3d" ? `3D LUT ${lut.size}^3` : `1D LUT ${lut.size}`,
            title: lut.title,
          });
        } catch (err) {
          reject(err);
        }
      };

      const timer = setTimeout(() => {
        if (pendingLutFitRef.current?.jobId === jobId) {
          pendingLutFitRef.current = null;
          runMainThreadFallback();
        }
      }, LUT_FIT_TIMEOUT_MS);

      pendingLutFitRef.current = {
        jobId,
        timer,
        resolve,
        reject,
        fallback: runMainThreadFallback,
      };

      try {
        const worker = ensureWorker();
        if (!worker) {
          clearTimeout(timer);
          pendingLutFitRef.current = null;
          runMainThreadFallback();
          return;
        }
        const tgtBuffer = tgt?.data ? toTransferableBuffer(tgt.data, true) : null;
        const transferables = tgtBuffer ? [tgtBuffer] : [];
        worker.postMessage(
          {
            type: "fitLut",
            jobId,
            lutText,
            tgtBuffer,
            targetNumPixels: tgt ? tgt.numPixels : 0,
          },
          transferables
        );
      } catch {
        clearTimeout(timer);
        pendingLutFitRef.current = null;
        runMainThreadFallback();
      }
    });
  }, [ensureWorker]);

  return {
    beginAnalysisJob,
    isCurrentJob,
    dispatchAnalysis,
    fitLutInWorker,
    restartWorker: initWorker,
  };
}
