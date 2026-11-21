import { analyzeImagePixels } from "./colorGrading.js";
import { sanitizeParams } from "./gradeEngine.js";
import { checkAllowedHost } from "./hostGuard.js";
import {
  autoNormalizeTargetPixels,
  applyTargetAutoNormalizeOffsets,
} from "./colorMatcher.js";
import { applyLogProfileToRgba, isLogProfileActive } from "./logProfiles.js";
import { analyzeEngineV3 } from "./polarisV3Engine.js";
import { analyzeEngineAltairV4 } from "./altairV4Engine.js";
import { bakeParamsToLut32 } from "../engine/lut3d.ts";
import { solveTwoStageLut32 } from "../engine/twoStageSolver.ts";

import {
  DEFAULT_ENGINE_ID,
  ENGINE_ALIASES,
  ENGINE_CODENAME_MAP,
  ENGINE_METADATA,
  resolveEngineId,
  getEngineCodename,
  formatEngineLabel,
  resetV3TemporalState,
} from "./engineMetadata.js";

export {
  DEFAULT_ENGINE_ID,
  ENGINE_ALIASES,
  ENGINE_CODENAME_MAP,
  resolveEngineId,
  getEngineCodename,
  formatEngineLabel,
  resetV3TemporalState,
};

function prepareTargetForAnalysis(tgtData, targetNumPixels, options = {}) {
  const tgtN = targetNumPixels || (tgtData ? Math.floor(tgtData.length / 4) : 0);
  if (!tgtData || tgtN < 1) {
    return { data: null, numPixels: 0, normStats: null };
  }
  let working = tgtData;
  if (isLogProfileActive(options.inputProfile)) {
    working = applyLogProfileToRgba(working, tgtN, options.inputProfile);
  }
  if (options.autoNormalizeTarget) {
    const norm = autoNormalizeTargetPixels(working, tgtN);
    return { data: norm.data, numPixels: norm.numPixels, normStats: norm.normStats };
  }
  return { data: working, numPixels: tgtN, normStats: null };
}

export const ENGINE_REGISTRY = {
  v2: {
    ...ENGINE_METADATA.v2,
    analyze(refData, tgtData, options = {}) {
      if (!checkAllowedHost()) {
        throw new Error("Unauthorized host environment.");
      }
      const {
        numPixels = 0,
        targetNumPixels = 0,
        mediaType = "image",
        onStage,
      } = options;
      const refPixels = numPixels || (refData ? Math.floor(refData.length / 4) : 0);
      const prep = prepareTargetForAnalysis(tgtData, targetNumPixels, options);
      const v2Out = analyzeImagePixels(
        refData,
        refPixels,
        onStage,
        prep.data,
        prep.numPixels,
        mediaType
      );
      const merged = { ...v2Out, autoGradeMix: 0.0, filmicShoulder: 0.0 };
      return sanitizeParams(
        prep.normStats ? applyTargetAutoNormalizeOffsets(merged, prep.normStats) : merged
      );
    },
  },
  v3: {
    ...ENGINE_METADATA.v3,
    analyze(refData, tgtData, options = {}) {
      if (!checkAllowedHost()) {
        throw new Error("Unauthorized host environment.");
      }
      const refPixels = options.numPixels || (refData ? Math.floor(refData.length / 4) : 0);
      const tgtPixels =
        options.targetNumPixels || (tgtData ? Math.floor(tgtData.length / 4) : 0);
      return analyzeEngineV3(refData, tgtData, {
        ...options,
        numPixels: refPixels,
        targetNumPixels: tgtPixels,
      });
    },
  },
  altair: {
    ...ENGINE_METADATA.altair,
    analyze(refData, tgtData, options = {}) {
      if (!checkAllowedHost()) {
        throw new Error("Unauthorized host environment.");
      }
      const refPixels = options.numPixels || (refData ? Math.floor(refData.length / 4) : 0);
      const tgtPixels =
        options.targetNumPixels || (tgtData ? Math.floor(tgtData.length / 4) : 0);
      return analyzeEngineAltairV4(refData, tgtData, {
        ...options,
        numPixels: refPixels,
        targetNumPixels: tgtPixels,
      });
    },
  },
  altair_refresh: {
    ...ENGINE_METADATA.altair_refresh,
    analyze(refData, tgtData, options = {}) {
      if (!checkAllowedHost()) {
        throw new Error("Unauthorized host environment.");
      }
      const refPixels = options.numPixels || (refData ? Math.floor(refData.length / 4) : 0);
      const tgtPixels =
        options.targetNumPixels || (tgtData ? Math.floor(tgtData.length / 4) : 0);
      const res = solveTwoStageLut32(refData, refPixels, tgtData, tgtPixels, {
        normalizeWeight: options.normalizeWeight ?? 1.0,
        sigmaWeight: options.sigmaWeight ?? 1.0,
        skinProtect: options.skinProtect ?? 0.75,
        inputProfile: options.inputProfile || "rec709",
        onStage: options.onStage,
      });
      return res.params;
    },
  },
};

/**
 * Unified engine runner returning { params, lut32, lutMeta, bakeMs }.
 * Sirius 2.5 & Polaris 3.5 run their existing parametric shaders (lut32 = null).
 * Altair 4.0 bakes its 1-stage OKLab grade into a 32^3 tetrahedral LUT.
 * Altair 4.5 Refresh runs the deterministic Two-Stage solver + Primary/Wheels/Hue 6V decomposition into 32^3.
 */
export function runEngineAnalysis(engineId, refData, tgtData, options = {}) {
  if (!checkAllowedHost()) {
    throw new Error("Unauthorized host environment.");
  }
  const resolved = resolveEngineId(engineId || DEFAULT_ENGINE_ID);
  const refPixels = options.numPixels || (refData ? Math.floor(refData.length / 4) : 0);
  const tgtPixels =
    options.targetNumPixels || (tgtData ? Math.floor(tgtData.length / 4) : 0);

  if (resolved === "altair_refresh") {
    const res = solveTwoStageLut32(refData, refPixels, tgtData, tgtPixels, {
      normalizeWeight: options.normalizeWeight ?? 1.0,
      sigmaWeight: options.sigmaWeight ?? 1.0,
      skinProtect: options.skinProtect ?? 0.75,
      inputProfile: options.inputProfile || "rec709",
      onStage: options.onStage,
    });
    return {
      params: res.params,
      lut32: res.lut32,
      lutMeta: {
        title: "Keyflow_Altair_Refresh",
        sourceEngine: "altair_refresh",
        applyPostGrade: false,
        stage1Stats: res.stage1Stats,
        stage2Stats: res.stage2Stats,
      },
      bakeMs: res.bakeMs,
    };
  }

  const engine = getEngine(resolved);
  const params = engine.analyze(refData, tgtData, {
    ...options,
    numPixels: refPixels,
    targetNumPixels: tgtPixels,
  });

  if (resolved === "altair") {
    const t0 = typeof performance !== "undefined" ? performance.now() : Date.now();
    const lut32 = bakeParamsToLut32(params, "rec709");
    const t1 = typeof performance !== "undefined" ? performance.now() : Date.now();
    return {
      params,
      lut32,
      lutMeta: {
        title: "Keyflow_Altair_4_Creative",
        sourceEngine: "altair",
        applyPostGrade: false,
      },
      bakeMs: t1 - t0,
    };
  }

  return {
    params,
    lut32: null,
    lutMeta: null,
    bakeMs: 0,
  };
}

export function getEngine(engineId = DEFAULT_ENGINE_ID) {
  const resolved = resolveEngineId(engineId);
  return ENGINE_REGISTRY[resolved] || ENGINE_REGISTRY[DEFAULT_ENGINE_ID];
}

export function listEngines() {
  return [
    ENGINE_REGISTRY.v2,
    ENGINE_REGISTRY.v3,
    ENGINE_REGISTRY.altair,
    ENGINE_REGISTRY.altair_refresh,
  ];
}
