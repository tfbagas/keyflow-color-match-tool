import { DEFAULT_PARAMS } from "./paramSchema";

// ---------------------------------------------------------------------------
// Built-in Looks library (14 calibrated looks across the 3 active engines).
//
// Every look explicitly declares:
//   engine       -> 'altair45' | 'altair4' | 'polaris35'   (public lineup key)
//   engineId     -> internal registry id resolved from `engine`
//   category / description
//   primary      -> Tone, White Balance & Color Balance sliders
//   wheels       -> Lift / Gamma / Gain RGB triplets (0.5 = neutral)
//   hue6v        -> Hue-vs-Hue / Hue-vs-Sat / Hue-vs-Luma, sectors [R, Y, G, C, B, M]
//   sigma        -> Style Sigma % (0..100)
//   skinProtect  -> Skin Protect % (0..100)
//   blackFloor   -> Lifted-black offset (0 = true black, +0.05 = matte, <0 = crushed),
//                   folded into liftR/G/B so it exports 1:1 to .kfplug / .cube / .ffx
//
// `params` is generated from the fields above and is what gets applied.
// ---------------------------------------------------------------------------

export const LOOK_ENGINE_KEYS = Object.freeze({
  altair45: "altair_refresh",
  altair4: "altair",
  polaris35: "v3",
});

export const LOOK_ENGINE_BADGES = Object.freeze({
  altair45: "ALTAIR 4.5",
  altair4: "ALTAIR 4.0",
  polaris35: "POLARIS 3.5",
});

export const LOOK_ENGINE_FILTERS = Object.freeze([
  { id: "all", label: "All" },
  { id: "altair45", label: "Altair 4.5" },
  { id: "altair4", label: "Altair 4.0" },
  { id: "polaris35", label: "Polaris 3.5" },
]);

const NEUTRAL_WHEEL = [0.5, 0.5, 0.5];
const ZERO6 = [0, 0, 0, 0, 0, 0];

function clamp(v, lo, hi) {
  return Math.min(hi, Math.max(lo, v));
}

function round4(v) {
  return Math.round(v * 10000) / 10000;
}

// Lift offset per unit of blackFloor (0.04 floor -> +0.08 on liftR/G/B).
const BLACK_FLOOR_LIFT_GAIN = 2.0;

function buildParams({ primary, wheels = {}, hue6v = {}, blackFloor = 0 }) {
  const lift = wheels.lift || NEUTRAL_WHEEL;
  const gamma = wheels.gamma || NEUTRAL_WHEEL;
  const gain = wheels.gain || NEUTRAL_WHEEL;
  const floorOffset = blackFloor * BLACK_FLOOR_LIFT_GAIN;
  const shift = hue6v.shift || ZERO6;
  const sat = hue6v.sat || ZERO6;
  const luma = hue6v.luma || ZERO6;
  const hasHue = [...shift, ...sat, ...luma].some((v) => Math.abs(v) > 1e-6);

  return {
    ...DEFAULT_PARAMS,
    ...primary,
    liftR: round4(clamp(lift[0] + floorOffset, 0, 1)),
    liftG: round4(clamp(lift[1] + floorOffset, 0, 1)),
    liftB: round4(clamp(lift[2] + floorOffset, 0, 1)),
    gammaR: gamma[0],
    gammaG: gamma[1],
    gammaB: gamma[2],
    gainR: gain[0],
    gainG: gain[1],
    gainB: gain[2],
    // Hue 6V is evaluated inside the hybrid residual layer, so it needs autoGradeMix on.
    autoGradeMix: hasHue ? 1.0 : 0.0,
    hueShift: shift.slice(),
    hueSat: sat.slice(),
    hueLuma: luma.slice(),
  };
}

function defineLook(spec) {
  const {
    primary,
    wheels,
    hue6v,
    blackFloor = 0,
    sigma = 100,
    skinProtect = 75,
    engine,
    ...rest
  } = spec;
  return {
    ...rest,
    engine,
    engineId: LOOK_ENGINE_KEYS[engine],
    logProfile: "rec709",
    matchStrength: 100,
    sigma,
    skinProtect,
    blackFloor,
    primary,
    wheels,
    hue6v,
    params: buildParams({ primary, wheels, hue6v, blackFloor }),
  };
}

export const BUILT_IN_LOOKS = [
  // ───────────────────────── Altair 4.5 Refresh (CINEMA 32³) ─────────────────────────
  defineLook({
    id: "kodak-2383-print",
    name: "Kodak 2383 Print",
    category: "Film",
    engine: "altair45",
    description:
      "Projection-print emulation: warm rolled-off highlights, teal-leaning shadows, and gently compressed greens.",
    swatches: ["#1B2A30", "#3F5A5C", "#8A7A62", "#D2A878", "#F3E3C6"],
    sigma: 85,
    skinProtect: 80,
    blackFloor: 0.025,
    primary: {
      exposure: 0.02,
      contrast: 1.12,
      pivot: 0.46,
      shadows: 0.04,
      highlights: -0.22,
      temp: 0.07,
      tint: 0.02,
      sat: 0.94,
      vib: 0.06,
    },
    wheels: {
      lift: [0.49, 0.5, 0.53],
      gamma: [0.51, 0.5, 0.48],
      gain: [0.53, 0.5, 0.45],
    },
    hue6v: {
      shift: [0.02, 0, -0.03, 0.03, 0.02, 0],
      sat: [0.04, 0.06, -0.12, -0.06, -0.04, 0.02],
      luma: [0, 0.04, -0.05, -0.04, -0.05, 0],
    },
  }),
  defineLook({
    id: "bleach-bypass",
    name: "Bleach Bypass",
    category: "Film",
    engine: "altair45",
    description:
      "Silver-retention process: crushed blacks, hard contrast, and desaturated steel-blue skin and foliage.",
    swatches: ["#0C0E12", "#2B313A", "#59616D", "#979FAB", "#DADFE6"],
    sigma: 90,
    skinProtect: 85,
    blackFloor: -0.01,
    primary: {
      exposure: -0.06,
      contrast: 1.28,
      pivot: 0.5,
      shadows: -0.12,
      highlights: -0.08,
      temp: -0.04,
      tint: -0.01,
      sat: 0.48,
      vib: -0.18,
    },
    wheels: {
      lift: [0.48, 0.49, 0.51],
      gamma: [0.49, 0.5, 0.51],
      gain: [0.5, 0.5, 0.52],
    },
    hue6v: {
      shift: [0, 0, 0, 0, 0, 0],
      sat: [-0.05, -0.06, -0.18, -0.16, -0.14, -0.14],
      luma: [-0.02, 0, -0.04, -0.02, -0.04, -0.02],
    },
  }),
  defineLook({
    id: "desert-amber",
    name: "Desert Amber",
    category: "Cinema",
    engine: "altair45",
    description:
      "Sun-baked amber highlights, burnt-orange midtones, and muted cool shadows for arid landscapes.",
    swatches: ["#2A1E18", "#6B4A32", "#B07A44", "#E0A862", "#F6DDB0"],
    sigma: 100,
    skinProtect: 85,
    blackFloor: 0.02,
    primary: {
      exposure: 0.03,
      contrast: 1.1,
      pivot: 0.48,
      shadows: 0.02,
      highlights: -0.16,
      temp: 0.24,
      tint: 0.05,
      sat: 1.04,
      vib: 0.14,
    },
    wheels: {
      lift: [0.52, 0.5, 0.46],
      gamma: [0.54, 0.5, 0.45],
      gain: [0.56, 0.5, 0.42],
    },
    hue6v: {
      shift: [0, -0.05, 0.06, 0.04, 0, 0],
      sat: [0.1, 0.14, -0.2, -0.12, -0.25, -0.1],
      luma: [0.02, 0.06, -0.06, -0.04, -0.1, 0],
    },
  }),
  defineLook({
    id: "tungsten-nocturne",
    name: "Tungsten Nocturne",
    category: "Night",
    engine: "altair45",
    description:
      "Warm practical-lamp highlights against deep indigo shadows with controlled, low-key contrast.",
    swatches: ["#0A0D1C", "#1D2A52", "#5A4A5C", "#C98A4A", "#F2C98A"],
    sigma: 95,
    skinProtect: 80,
    blackFloor: 0.015,
    primary: {
      exposure: -0.1,
      contrast: 1.16,
      pivot: 0.42,
      shadows: -0.04,
      highlights: -0.2,
      temp: 0.2,
      tint: -0.04,
      sat: 1.02,
      vib: 0.1,
    },
    wheels: {
      lift: [0.46, 0.5, 0.58],
      gamma: [0.52, 0.5, 0.47],
      gain: [0.57, 0.5, 0.4],
    },
    hue6v: {
      shift: [0.03, -0.02, 0, 0.02, -0.03, 0],
      sat: [0.08, 0.12, -0.2, -0.04, 0.12, -0.08],
      luma: [0, 0.05, -0.08, -0.04, -0.1, -0.04],
    },
  }),
  defineLook({
    id: "crisp-commercial",
    name: "Crisp Commercial",
    category: "Commercial",
    engine: "altair45",
    description:
      "Clean neutral whites, punchy micro-contrast, and true-to-life color for brand and product work.",
    swatches: ["#1C1F24", "#4A525D", "#8B939E", "#C6CCD4", "#F2F4F7"],
    sigma: 70,
    skinProtect: 90,
    blackFloor: 0,
    primary: {
      exposure: 0.03,
      contrast: 1.1,
      pivot: 0.5,
      shadows: 0.05,
      highlights: -0.12,
      temp: 0.01,
      tint: 0,
      sat: 1.06,
      vib: 0.12,
    },
    wheels: {
      lift: [0.5, 0.5, 0.51],
      gamma: [0.5, 0.5, 0.5],
      gain: [0.5, 0.5, 0.5],
    },
    hue6v: {
      shift: [0, 0, 0, 0, 0, 0],
      sat: [0.03, 0.04, 0.02, 0.04, 0.06, -0.02],
      luma: [0, 0, 0, 0, 0, 0],
    },
  }),

  // ───────────────────────── Altair 4.0 (CREATIVE) ─────────────────────────
  defineLook({
    id: "cyberpunk-2099",
    name: "Cyberpunk 2099",
    category: "Stylized",
    engine: "altair4",
    description:
      "Electric magenta highlights over cyan-violet shadows with neon-saturated signage and glossy contrast.",
    swatches: ["#120B26", "#283E6B", "#7F2A7C", "#E048A6", "#7BF2F5"],
    sigma: 100,
    skinProtect: 70,
    blackFloor: 0.01,
    primary: {
      exposure: -0.04,
      contrast: 1.2,
      pivot: 0.46,
      shadows: -0.04,
      highlights: -0.14,
      temp: -0.12,
      tint: 0.28,
      sat: 1.2,
      vib: 0.24,
    },
    wheels: {
      lift: [0.43, 0.46, 0.6],
      gamma: [0.53, 0.46, 0.55],
      gain: [0.58, 0.43, 0.54],
    },
    hue6v: {
      shift: [0.04, 0, -0.05, 0.04, -0.05, 0.06],
      sat: [-0.1, 0, -0.1, 0.2, 0.2, 0.3],
      luma: [0, 0.04, -0.08, 0.08, -0.08, 0.06],
    },
  }),
  defineLook({
    id: "hyper-pop-pastel",
    name: "Hyper-Pop Pastel",
    category: "Stylized",
    engine: "altair4",
    description:
      "Bright, airy candy tones: lifted shadows, luminous pinks and aquas, and soft low-contrast glow.",
    swatches: ["#5B4B6E", "#B79AD6", "#F2A8D2", "#9FE3E8", "#FFF0F6"],
    sigma: 100,
    skinProtect: 65,
    blackFloor: 0.05,
    primary: {
      exposure: 0.1,
      contrast: 0.92,
      pivot: 0.54,
      shadows: 0.12,
      highlights: -0.1,
      temp: 0.04,
      tint: 0.1,
      sat: 1.14,
      vib: 0.3,
    },
    wheels: {
      lift: [0.54, 0.52, 0.56],
      gamma: [0.52, 0.5, 0.52],
      gain: [0.52, 0.49, 0.52],
    },
    hue6v: {
      shift: [0, 0.02, 0, 0, 0, -0.02],
      sat: [0.05, 0.1, 0.1, 0.12, 0.1, 0.15],
      luma: [0.1, 0.12, 0.08, 0.1, 0.08, 0.1],
    },
  }),
  defineLook({
    id: "golden-hour-halation",
    name: "Golden Hour Halation",
    category: "Cinema",
    engine: "altair4",
    description:
      "Glowing honey highlights with warm red halation bloom, soft shadows, and flattering skin warmth.",
    swatches: ["#2B1D1A", "#7A4A34", "#C9833E", "#F0B866", "#FFE7B8"],
    sigma: 100,
    skinProtect: 90,
    blackFloor: 0.03,
    primary: {
      exposure: 0.05,
      contrast: 1.06,
      pivot: 0.5,
      shadows: 0.06,
      highlights: -0.2,
      temp: 0.26,
      tint: 0.06,
      sat: 1.06,
      vib: 0.18,
    },
    wheels: {
      lift: [0.52, 0.5, 0.47],
      gamma: [0.54, 0.5, 0.45],
      gain: [0.57, 0.51, 0.42],
    },
    hue6v: {
      shift: [-0.03, -0.04, 0.04, 0, 0, 0.02],
      sat: [0.14, 0.14, -0.12, -0.1, -0.2, 0.04],
      luma: [0.04, 0.08, -0.04, -0.02, -0.08, 0],
    },
  }),
  defineLook({
    id: "tokyo-midnight-rain",
    name: "Tokyo Midnight Rain",
    category: "Night",
    engine: "altair4",
    description:
      "Rain-slicked cobalt streets with cyan-pink neon reflections and deep, moody blacks.",
    swatches: ["#080C1E", "#1C2E66", "#4C4F8C", "#5CCBE0", "#F0A0CC"],
    sigma: 95,
    skinProtect: 75,
    blackFloor: 0.015,
    primary: {
      exposure: -0.12,
      contrast: 1.18,
      pivot: 0.44,
      shadows: -0.02,
      highlights: -0.16,
      temp: -0.2,
      tint: 0.1,
      sat: 1.08,
      vib: 0.2,
    },
    wheels: {
      lift: [0.44, 0.48, 0.58],
      gamma: [0.48, 0.5, 0.54],
      gain: [0.49, 0.5, 0.55],
    },
    hue6v: {
      shift: [0.02, 0, 0, 0.03, -0.03, 0.04],
      sat: [0.1, 0.06, -0.15, 0.15, 0.1, 0.14],
      luma: [0.02, 0.05, -0.05, 0.05, -0.08, 0.04],
    },
  }),
  defineLook({
    id: "90s-city-pop",
    name: "90s City Pop",
    category: "Retro",
    engine: "altair4",
    description:
      "Sunset-gradient nostalgia: hazy lifted blacks, pink-orange skies, and turquoise pool-blue accents.",
    swatches: ["#3A2B4A", "#8A5C9A", "#EE7FA0", "#F6B778", "#5FD1D0"],
    sigma: 100,
    skinProtect: 70,
    blackFloor: 0.045,
    primary: {
      exposure: 0.06,
      contrast: 0.98,
      pivot: 0.52,
      shadows: 0.1,
      highlights: -0.12,
      temp: -0.02,
      tint: 0.12,
      sat: 1.18,
      vib: 0.26,
    },
    wheels: {
      lift: [0.52, 0.48, 0.57],
      gamma: [0.53, 0.49, 0.51],
      gain: [0.56, 0.5, 0.5],
    },
    hue6v: {
      shift: [0, 0.03, 0.02, -0.03, 0, -0.03],
      sat: [0.12, 0.1, -0.04, 0.18, 0.12, 0.2],
      luma: [0.04, 0.08, 0, 0.1, -0.04, 0.06],
    },
  }),

  // ───────────────────────── Polaris 3.5 (ANIME) ─────────────────────────
  defineLook({
    id: "makoto-sky-dusk",
    name: "Makoto Sky Dusk",
    category: "Anime",
    engine: "polaris35",
    description:
      "Luminous gradient skies, saturated cyan-to-magenta dusk clouds, and crisp painterly highlights.",
    swatches: ["#13204A", "#2F6BB5", "#6FC3E8", "#F4A6C0", "#FFE2B0"],
    sigma: 100,
    skinProtect: 60,
    blackFloor: 0.01,
    primary: {
      exposure: 0.04,
      contrast: 1.14,
      pivot: 0.48,
      shadows: 0,
      highlights: -0.1,
      temp: -0.06,
      tint: 0.08,
      sat: 1.22,
      vib: 0.3,
    },
    wheels: {
      lift: [0.46, 0.48, 0.56],
      gamma: [0.5, 0.49, 0.53],
      gain: [0.56, 0.5, 0.46],
    },
    hue6v: {
      shift: [0.02, -0.02, 0, 0.03, -0.02, 0.04],
      sat: [0.1, 0.1, 0.06, 0.2, 0.18, 0.14],
      luma: [0.02, 0.05, 0, 0.08, -0.06, 0.04],
    },
  }),
  defineLook({
    id: "kyoani-soft-daylight",
    name: "KyoAni Soft Daylight",
    category: "Anime",
    engine: "polaris35",
    description:
      "Gentle backlit daylight with creamy highlights, airy shadows, and tender pastel skin and foliage.",
    swatches: ["#4A4F5E", "#8E9CB0", "#C8D4C4", "#F2D8B8", "#FFF6E6"],
    sigma: 100,
    skinProtect: 70,
    blackFloor: 0.03,
    primary: {
      exposure: 0.08,
      contrast: 0.96,
      pivot: 0.52,
      shadows: 0.1,
      highlights: -0.1,
      temp: 0.08,
      tint: 0.02,
      sat: 1.06,
      vib: 0.22,
    },
    wheels: {
      lift: [0.52, 0.51, 0.54],
      gamma: [0.51, 0.5, 0.49],
      gain: [0.52, 0.5, 0.48],
    },
    hue6v: {
      shift: [0, 0.01, 0.01, 0, 0, 0],
      sat: [0.04, 0.06, 0.08, 0.06, 0.04, 0.02],
      luma: [0.04, 0.06, 0.04, 0.04, 0.02, 0.04],
    },
  }),
  defineLook({
    id: "90s-cel-archive",
    name: "90s Cel Archive",
    category: "Anime",
    engine: "polaris35",
    description:
      "Hand-painted cel nostalgia: flat matte color fields, slightly faded inks, and warm broadcast-era balance.",
    swatches: ["#2A2E36", "#5B6A74", "#8F9A7C", "#CDB48A", "#EDE0C4"],
    sigma: 90,
    skinProtect: 70,
    blackFloor: 0.035,
    primary: {
      exposure: -0.02,
      contrast: 1.1,
      pivot: 0.5,
      shadows: -0.02,
      highlights: -0.14,
      temp: 0.04,
      tint: -0.04,
      sat: 0.9,
      vib: 0,
    },
    wheels: {
      lift: [0.5, 0.5, 0.52],
      gamma: [0.51, 0.5, 0.48],
      gain: [0.53, 0.5, 0.47],
    },
    hue6v: {
      shift: [0, 0, 0, 0, 0, 0],
      sat: [-0.02, 0, -0.08, -0.06, -0.06, -0.06],
      luma: [0, 0.02, -0.04, -0.02, -0.04, 0],
    },
  }),
  defineLook({
    id: "mappa-dark-action",
    name: "MAPPA Dark Action",
    category: "Anime",
    engine: "polaris35",
    description:
      "Gritty high-contrast action grade: deep crushed blacks, punchy reds, and cold desaturated greens and blues.",
    swatches: ["#08090C", "#1E2630", "#4A5560", "#B8424A", "#E6E2DA"],
    sigma: 100,
    skinProtect: 75,
    blackFloor: -0.01,
    primary: {
      exposure: -0.08,
      contrast: 1.26,
      pivot: 0.44,
      shadows: -0.1,
      highlights: -0.14,
      temp: -0.04,
      tint: 0.04,
      sat: 1.04,
      vib: 0.12,
    },
    wheels: {
      lift: [0.47, 0.48, 0.52],
      gamma: [0.49, 0.49, 0.5],
      gain: [0.52, 0.49, 0.5],
    },
    hue6v: {
      shift: [-0.02, 0, 0, 0, 0, 0.02],
      sat: [0.16, -0.04, -0.14, -0.04, 0.04, 0.1],
      luma: [-0.06, 0.02, -0.08, -0.04, -0.1, -0.06],
    },
  }),
];
