import { checkAllowedHost } from "./hostGuard.js";
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

export const ENGINE_REGISTRY = {
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
 * Polaris 3.5 runs its existing parametric shader (lut32 = null). Legacy "sirius"/"v2" IDs resolve to Altair 4.5 Refresh.
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
    ENGINE_REGISTRY.altair_refresh,
    ENGINE_REGISTRY.altair,
    ENGINE_REGISTRY.v3,
  ];
}
