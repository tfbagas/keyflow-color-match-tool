export const DEFAULT_ENGINE_ID = "altair_refresh";

export const ENGINE_ALIASES = Object.freeze({
  // Legacy Vega 1.0 / v1 migration -> Altair 4.0 CREATIVE
  v1: "altair",
  vega: "altair",
  vega1: "altair",
  "vega-1": "altair",
  vega_1: "altair",
  // Canonical & friendly aliases
  // Retired Sirius 2.5 (v2) -> silently mapped to Altair 4.5 Refresh
  v2: "altair_refresh",
  sirius: "altair_refresh",
  "sirius2.5": "altair_refresh",
  sirius25: "altair_refresh",
  v3: "v3",
  polaris: "v3",
  polaris35: "v3",
  "polaris3.5": "v3",
  "polaris-3.5": "v3",
  "polaris-35": "v3",
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
  v3: "polaris",
  altair: "altair",
  altair_refresh: "altair45",
});

export const ENGINE_METADATA = {
  v3: {
    id: "v3",
    name: "Polaris",
    codename: "polaris",
    versionBadge: "3.5",
    functionalTag: "ANIME",
    badge: "3.5 · ANIME",
    subtitle: "Flat / cel-shaded palette anchor",
    shortTag: "ANIME",
    shortcutKey: "3",
    usesLut32: false,
    bestFor: "Anime, stylized illustrations & flat/cel-shaded palette anchoring",
    summary:
      "Flat/cel-shaded palette anchor with perceptual gamut protection and AgX highlight roll-off.",
    pipelineBadges: ["ANIME", "Palette Anchor", "Deep Blacks", "Gamut Safe"],
    description:
      "Flat/cel-shaded palette anchor with perceptual gamut protection and AgX highlight roll-off.",
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
    shortcutKey: "2",
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
  },
  altair_refresh: {
    id: "altair_refresh",
    name: "Altair",
    codename: "altair45",
    versionBadge: "4.5 Refresh",
    functionalTag: "CINEMA 32³",
    badge: "4.5 Refresh · CINEMA 32³",
    subtitle: "Two-stage Source Normalize to Sigma Style",
    shortTag: "CINEMA 32³",
    shortcutKey: "1",
    isFlagship: true,
    usesLut32: true,
    bestFor: "Mismatched lighting, cinema color matching & 1:1 C++ .aex / .kfplug parity",
    summary:
      "Deterministic Two-Stage solver (Source Normalize to Halton 3D OKLab SOT + Sigma Style Transfer) baked into a universal 32³ tetrahedral LUT (< 8ms).",
    pipelineBadges: [
      "CINEMA 32³",
      "Two-Stage D65",
      "Halton 2·3·5 SOT",
      "Tetrahedral LUT",
      "C++ .aex Parity",
    ],
    description:
      "Deterministic Two-Stage solver (Source Normalize to Halton 3D OKLab SOT + Sigma Style Transfer) baked into a universal 32³ tetrahedral LUT (< 8ms).",
  },
};

export function resolveEngineId(engineId = DEFAULT_ENGINE_ID) {
  if (typeof engineId !== "string") return DEFAULT_ENGINE_ID;
  const key = engineId.trim().toLowerCase();
  if (key in ENGINE_METADATA) return key;
  return ENGINE_ALIASES[key] || DEFAULT_ENGINE_ID;
}

export function getEngineCodename(engineId = DEFAULT_ENGINE_ID) {
  const resolved = resolveEngineId(engineId);
  return ENGINE_CODENAME_MAP[resolved] || ENGINE_CODENAME_MAP[DEFAULT_ENGINE_ID];
}

export function getEngine(engineId = DEFAULT_ENGINE_ID) {
  const resolved = resolveEngineId(engineId);
  return ENGINE_METADATA[resolved] || ENGINE_METADATA[DEFAULT_ENGINE_ID];
}

export function formatEngineLabel(engineId = DEFAULT_ENGINE_ID) {
  const eng = getEngine(engineId);
  return `${eng.name} ${eng.versionBadge}`;
}

export function listEngines() {
  return [
    ENGINE_METADATA.altair_refresh,
    ENGINE_METADATA.altair,
    ENGINE_METADATA.v3,
  ];
}

export function resetV3TemporalState() {
  // Retained as a safe no-op export for legacy callers.
}
