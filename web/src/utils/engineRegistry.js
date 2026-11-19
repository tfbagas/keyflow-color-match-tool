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

export const DEFAULT_ENGINE_ID = "altair";

export const ENGINE_ALIASES = Object.freeze({
  // Legacy Vega 1.0 / v1 migration -> Altair 4.0 ULTRA
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
});

export const ENGINE_CODENAME_MAP = Object.freeze({
  v2: "sirius",
  v3: "polaris",
  altair: "altair",
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
    badge: "2.5",
    subtitle: "Balanced",
    shortTag: "Balanced",
    shortcutKey: "1",
    bestFor: "Clean everyday grades & natural lighting",
    summary:
      "Multi-zone tonal & contrast matching while keeping whites clean and highlights soft.",
    pipelineBadges: ["Clean Whites", "Soft Highlights", "Natural Tone"],
    description:
      "Multi-zone tonal & contrast matching while keeping whites clean and highlights soft.",
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
    versionBadge: "3.5 PRO",
    badge: "3.5 PRO",
    subtitle: "Cinema Pro",
    shortTag: "Cinema Pro",
    shortcutKey: "2",
    bestFor: "Cinematic looks, skin tones & tricky lighting",
    summary:
      "Deep perceptual spectral & LUT matching while protecting skin tones, deep blacks, and bright skies.",
    pipelineBadges: ["Skin-Safe", "Deep Blacks", "Film Color", "Gamut Safe"],
    description:
      "Deep perceptual spectral & LUT matching while protecting skin tones, deep blacks, and bright skies.",
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
    versionBadge: "4.0 ULTRA",
    badge: "4.0 ULTRA",
    subtitle: "Scene-Linear Pro",
    shortTag: "Scene-Linear Pro",
    shortcutKey: "3",
    isFlagship: true,
    bestFor: "Flagship color accuracy, film/anime looks & skin-safe grading",
    summary:
      "Flagship scene-linear solver with 3D OKLab distribution transfer, multi-zone tonal curve fitting, skin-tone lock, and filmic highlight roll-off — 100% deterministic for Web, .kfplug, and After Effects.",
    pipelineBadges: [
      "Scene-Linear",
      "3D OKLab Transfer",
      "Skin-Safe",
      "Filmic Roll-Off",
      ".kfplug Ready",
    ],
    description:
      "Flagship scene-linear solver with 3D OKLab distribution transfer, multi-zone tonal curve fitting, skin-tone lock, and filmic highlight roll-off — 100% deterministic for Web, .kfplug, and After Effects.",
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
};

export function getEngine(engineId = DEFAULT_ENGINE_ID) {
  const resolved = resolveEngineId(engineId);
  return ENGINE_REGISTRY[resolved] || ENGINE_REGISTRY[DEFAULT_ENGINE_ID];
}

export function listEngines() {
  return [ENGINE_REGISTRY.v2, ENGINE_REGISTRY.v3, ENGINE_REGISTRY.altair];
}
