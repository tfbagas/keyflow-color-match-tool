import { analyzeImagePixels } from "./colorGrading.js";

export const DEFAULT_ENGINE_ID = "v2";

export const ENGINE_REGISTRY = {
  v2: {
    id: "v2",
    name: "Keyflow Match v2",
    badge: "DEFAULT",
    description:
      "Rec. 709 percentile tone matching, white balance neutrality, and 3-way split toning.",
    analyze(refData, tgtData, options = {}) {
      const {
        numPixels = 0,
        targetNumPixels = 0,
        mediaType = "image",
        onStage,
      } = options;
      const refPixels = numPixels || (refData ? Math.floor(refData.length / 4) : 0);
      const tgtPixels = targetNumPixels || (tgtData ? Math.floor(tgtData.length / 4) : 0);
      return analyzeImagePixels(
        refData,
        refPixels,
        onStage,
        tgtData || null,
        tgtPixels,
        mediaType
      );
    },
  },
};

export function getEngine(engineId = DEFAULT_ENGINE_ID) {
  return ENGINE_REGISTRY[engineId] || ENGINE_REGISTRY[DEFAULT_ENGINE_ID];
}

export function listEngines() {
  return Object.values(ENGINE_REGISTRY);
}
