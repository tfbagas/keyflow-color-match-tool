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

export const DEFAULT_ENGINE_ID = "altair_refresh";

export const ENGINE_ALIASES = Object.freeze({
  // Legacy Vega 1.0 / v1 migration -> Altair 4.0 CREATIVE
  v1: "altair",
  vega: "altair",
  vega1: "altair",
  "vega-1": "altair",
  vega_1: "altair",
  // Canonical & friendly aliases
  v2: "v2",
  sirius: "v2",
  v3: "v3",
  polaris: "v3",
  v4: "altair",
  altair: "altair",
  altair4: "altair",
  "altair-4": "altair",
  v45: "altair_refresh",
  "v4.5": "altair_refresh",
  altair45: "altair_refresh",
  "altair4.5": "altair_refresh",
  "altair-4.5": "altair_refresh",
  "altair-45": "altair_refresh",
  altair_45: "altair_refresh",
  altair_refresh: "altair_refresh",
  "altair-refresh": "altair_refresh",
  refresh: "altair_refresh",
});

export const ENGINE_CODENAME_MAP = Object.freeze({
  v2: "sirius",
  v3: "polaris",
  altair: "altair",
  altair_refresh: "altair45",
});

export function resolveEngineId(engineId = DEFAULT_ENGINE_ID) {
  if (typeof engineId !== "string") return DEFAULT_ENGINE_ID;
  const key = engineId.trim().toLowerCase();
  if (key in ENGINE_REGISTRY) return key;
  return ENGINE_ALIASES[key] || DEFAULT_ENGINE_ID;
}

export function getEngineCodename(engineId = DEFAULT_ENGINE_ID) {
  const resolved = resolveEngineId(engineId);
  return ENGINE_CODENAME_MAP[resolved] || ENGINE_CODENAME_MAP[DEFAULT_ENGINE_ID];
}

export function formatEngineLabel(engineId = DEFAULT_ENGINE_ID) {
  const eng = getEngine(engineId);
  return `${eng.name} ${eng.versionBadge}`;
}

export function resetV3TemporalState() {
  // Retained as a safe no-op export for legacy callers.
}

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
    id: "v2",
    name: "Sirius",
    codename: "sirius",
    versionBadge: "2.5",
    functionalTag: "FAST",
    badge: "2.5 · FAST",
    subtitle: "Lightweight moment shift",
    shortTag: "FAST",
    shortcutKey: "1",
    usesLut32: false,
    bestFor: "Fast everyday Rec.709 matching with lightweight moment shift",
    summary:
      "Lightweight moment-shift solver for rapid balanced contrast and clean whites.",
    pipelineBadges: ["FAST", "Moment Shift", "Clean Whites"],
    description:
      "Lightweight moment-shift solver for rapid balanced contrast and clean whites.",
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
    id: "v3",
    name: "Polaris",
    codename: "polaris",
    versionBadge: "3.5",
    functionalTag: "ANIME",
    badge: "3.5 · ANIME",
    subtitle: "Flat / cel-shaded palette anchor",
    shortTag: "ANIME",
    shortcutKey: "2",
    usesLut32: false,
    bestFor: "Anime, stylized illustrations & flat/cel-shaded palette anchoring",
    summary:
      "Flat/cel-shaded palette anchor with perceptual gamut protection and AgX highlight roll-off.",
    pipelineBadges: ["ANIME", "Palette Anchor", "Deep Blacks", "Gamut Safe"],
    description:
      "Flat/cel-shaded palette anchor with perceptual gamut protection and AgX highlight roll-off.",
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
    id: "altair",
    name: "Altair",
    codename: "altair",
    versionBadge: "4.0",
    functionalTag: "CREATIVE",
    badge: "4.0 · CREATIVE",
    subtitle: "1-stage mood-preserving OKLab (32³ LUT)",
    shortTag: "CREATIVE",
    shortcutKey: "3",
    usesLut32: true,
    bestFor: "1-stage mood-preserving stylized looks baked into 32³ tetrahedral LUT",
    summary:
      "1-stage mood-preserving OKLab distribution transfer & multi-zone tonal curve baked into a 32³ tetrahedral LUT.",
    pipelineBadges: [
      "CREATIVE",
      "1-Stage OKLab",
      "32³ Tetrahedral LUT",
      "Skin-Safe",
      ".kfplug Ready",
    ],
    description:
      "1-stage mood-preserving OKLab distribution transfer & multi-zone tonal curve baked into a 32³ tetrahedral LUT.",
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
    id: "altair_refresh",
    name: "Altair",
    codename: "altair45",
    versionBadge: "4.5 Refresh",
    functionalTag: "CINEMA 32³",
    badge: "4.5 Refresh · CINEMA 32³",
    subtitle: "Two-stage Source Normalize → Sigma Style",
    shortTag: "CINEMA 32³",
    shortcutKey: "4",
    isFlagship: true,
    usesLut32: true,
    bestFor: "Mismatched lighting, cinema color matching & 1:1 C++ .aex / .kfplug parity",
    summary:
      "Deterministic Two-Stage solver (Source Normalize → Halton 3D OKLab SOT + Sigma Style Transfer) baked into a universal 32³ tetrahedral LUT (< 8ms).",
    pipelineBadges: [
      "CINEMA 32³",
      "Two-Stage D65",
      "Halton 2·3·5 SOT",
      "Tetrahedral LUT",
      "C++ .aex Parity",
    ],
    description:
      "Deterministic Two-Stage solver (Source Normalize → Halton 3D OKLab SOT + Sigma Style Transfer) baked into a universal 32³ tetrahedral LUT (< 8ms).",
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
