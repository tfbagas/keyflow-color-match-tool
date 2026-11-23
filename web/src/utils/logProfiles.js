// Mathematical Camera Log-to-Linear -> Rec.709 Input Profiles
// Shared across CPU grading, 3D LUT (.cube / .lut) baking, WebGL preview,
// .kfplug GLSL ES 1.00 shader export, and .ffx preset export.

export const DEFAULT_LOG_PROFILE = "rec709";

export const LOG_PROFILES = Object.freeze([
  {
    id: "rec709",
    code: 0,
    label: "Rec.709 (Standard)",
    shortLabel: "Rec.709",
    description: "Standard display-referred Rec.709 / sRGB footage (no input transform).",
  },
  {
    id: "slog3",
    code: 1,
    label: "Sony S-Log3 / S-Gamut3.Cine",
    shortLabel: "S-Log3",
    description: "Sony S-Log3 OETF linearization with S-Gamut3.Cine to Rec.709 matrix.",
  },
  {
    id: "clog3",
    code: 2,
    label: "Canon C-Log3",
    shortLabel: "C-Log3",
    description: "Canon Log 3 piecewise linearization with Cinema Gamut to Rec.709 matrix.",
  },
  {
    id: "dlogm",
    code: 3,
    label: "DJI D-Log M",
    shortLabel: "D-Log M",
    description: "DJI D-Log M 10-bit curve linearization with D-Gamut to Rec.709 matrix.",
  },
  {
    id: "applelog",
    code: 4,
    label: "Apple Log",
    shortLabel: "Apple Log",
    description: "Apple Log piecewise curve linearization with BT.2020 to Rec.709 matrix.",
  },
]);

const PROFILE_BY_ID = Object.fromEntries(LOG_PROFILES.map((p) => [p.id, p]));
const PROFILE_BY_CODE = Object.fromEntries(LOG_PROFILES.map((p) => [p.code, p]));

function clamp01(v) {
  return v < 0.0 ? 0.0 : v > 1.0 ? 1.0 : v;
}

export function resolveLogProfileId(profileOrBool) {
  if (typeof profileOrBool === "boolean") {
    return profileOrBool ? "slog3" : "rec709";
  }
  if (typeof profileOrBool === "number") {
    const found = PROFILE_BY_CODE[Math.round(profileOrBool)];
    return found ? found.id : "rec709";
  }
  if (typeof profileOrBool === "string") {
    const key = profileOrBool.trim().toLowerCase();
    if (PROFILE_BY_ID[key]) return key;
  }
  return "rec709";
}

export function getLogProfile(profileOrBool) {
  const id = resolveLogProfileId(profileOrBool);
  return PROFILE_BY_ID[id] || PROFILE_BY_ID.rec709;
}

export function getLogProfileCode(profileOrBool) {
  return getLogProfile(profileOrBool).code;
}

export function isLogProfileActive(profileOrBool) {
  return getLogProfileCode(profileOrBool) > 0;
}

// ---------------------------------------------------------------------------
// 1. Curve Linearization Functions (Log [0..1] -> Scene Linear)
// ---------------------------------------------------------------------------

// Sony S-Log3 -> Scene Linear
export function slog3ToLinear(x) {
  const v = clamp01(x);
  const cut = 171.2102946929 / 1023.0; // ~0.16736099
  if (v >= cut) {
    return Math.pow(10.0, (v * 1023.0 - 420.0) / 261.5) * 0.19 - 0.01;
  }
  return (v * 1023.0 - 95.0) * 0.0002498736 - 0.01;
}

// Canon C-Log3 -> Scene Linear
export function clog3ToLinear(x) {
  const v = clamp01(x);
  if (v < 0.09746547) {
    return -(Math.pow(10.0, (0.12512219 - v) / 0.36726845) - 1.0) / 14.98325;
  }
  if (v <= 0.15277891) {
    return (v - 0.12512219) / 1.9754798;
  }
  return (Math.pow(10.0, (v - 0.12512219) / 0.36726845) - 1.0) / 14.98325;
}

// DJI D-Log M -> Scene Linear
export function dlogmToLinear(x) {
  const v = clamp01(x);
  if (v > 0.14) {
    return (Math.pow(10.0, 3.89616 * v - 2.27752) - 0.0108) / 0.9892;
  }
  return (v - 0.0929) / 6.025;
}

// Apple Log -> Scene Linear
export function appleLogToLinear(x) {
  const P = clamp01(x);
  const R0 = -0.05641088;
  const Pt = 0.20848688;
  const c = 47.28711236;
  const beta = 0.00964052;
  const gamma = 0.08550479;
  const delta = 0.69336945;
  if (P >= Pt) {
    return Math.pow(2.0, (P - delta) / gamma) - beta;
  }
  if (P >= 0.0) {
    return Math.sqrt(P / c) + R0;
  }
  return R0;
}

// ---------------------------------------------------------------------------
// 2. Scene Linear -> Rec.709 Tone-Mapping + Display Encoding (1:1 with GLSL)
// ---------------------------------------------------------------------------

function toneMapSceneLinearChannel(linVal) {
  const c = Math.max(0.0, linVal);
  const gain = 1.18;
  const whitePt2 = 20.25; // 4.5^2
  const x = c * gain;
  const mapped = (x * (1.0 + x / whitePt2)) / Math.max(1.0 + x, 1e-5);
  return clamp01(mapped);
}

function linearToRec709Display(linVal) {
  const c = clamp01(linVal);
  return c <= 0.0031308 ? c * 12.92 : 1.055 * Math.pow(c, 1.0 / 2.4) - 0.055;
}

// Transforms a normalized RGB triplet [0..1] from the selected Camera Log profile
// into normalized display-referred Rec.709 [0..1].
export function applyLogProfileRGB(r, g, b, profileOrBool, out) {
  const code = getLogProfileCode(profileOrBool);
  if (code <= 0) {
    out[0] = clamp01(r);
    out[1] = clamp01(g);
    out[2] = clamp01(b);
    return;
  }

  let lr = 0.0;
  let lg = 0.0;
  let lb = 0.0;
  let mr = 0.0;
  let mg = 0.0;
  let mb = 0.0;

  if (code === 1) {
    // Sony S-Log3 / S-Gamut3.Cine -> Rec.709
    lr = slog3ToLinear(r);
    lg = slog3ToLinear(g);
    lb = slog3ToLinear(b);
    mr = 1.626947 * lr - 0.540138 * lg - 0.086809 * lb;
    mg = -0.178516 * lr + 1.417940 * lg - 0.239424 * lb;
    mb = -0.044436 * lr - 0.508378 * lg + 1.552814 * lb;
  } else if (code === 2) {
    // Canon C-Log3 -> Rec.709
    lr = clog3ToLinear(r);
    lg = clog3ToLinear(g);
    lb = clog3ToLinear(b);
    mr = 1.489804 * lr - 0.402059 * lg - 0.087745 * lb;
    mg = -0.158868 * lr + 1.384969 * lg - 0.226101 * lb;
    mb = -0.034516 * lr - 0.455206 * lg + 1.489722 * lb;
  } else if (code === 3) {
    // DJI D-Log M -> Rec.709
    lr = dlogmToLinear(r);
    lg = dlogmToLinear(g);
    lb = dlogmToLinear(b);
    mr = 1.328500 * lr - 0.268200 * lg - 0.060300 * lb;
    mg = -0.109600 * lr + 1.258400 * lg - 0.148800 * lb;
    mb = -0.021400 * lr - 0.324600 * lg + 1.346000 * lb;
  } else {
    // Apple Log (BT.2020) -> Rec.709
    lr = appleLogToLinear(r);
    lg = appleLogToLinear(g);
    lb = appleLogToLinear(b);
    mr = 1.660491 * lr - 0.587641 * lg - 0.072850 * lb;
    mg = -0.124550 * lr + 1.132900 * lg - 0.008349 * lb;
    mb = -0.018151 * lr - 0.100579 * lg + 1.118730 * lb;
  }

  out[0] = linearToRec709Display(toneMapSceneLinearChannel(mr));
  out[1] = linearToRec709Display(toneMapSceneLinearChannel(mg));
  out[2] = linearToRec709Display(toneMapSceneLinearChannel(mb));
}

// Applies the active Log-to-Rec.709 input transform to an RGBA pixel buffer
// so CPU target analysis operates on the properly linearized & normalized image.
export function applyLogProfileToRgba(rgba, numPixels, profileOrBool) {
  const code = getLogProfileCode(profileOrBool);
  if (code <= 0 || !rgba || numPixels <= 0) {
    return rgba;
  }
  const outBuf = new Uint8ClampedArray(rgba.length);
  const tmp = [0, 0, 0];
  const limit = Math.min(rgba.length, numPixels * 4);
  for (let i = 0; i < limit; i += 4) {
    applyLogProfileRGB(
      rgba[i] / 255.0,
      rgba[i + 1] / 255.0,
      rgba[i + 2] / 255.0,
      code,
      tmp
    );
    outBuf[i] = Math.round(tmp[0] * 255.0);
    outBuf[i + 1] = Math.round(tmp[1] * 255.0);
    outBuf[i + 2] = Math.round(tmp[2] * 255.0);
    outBuf[i + 3] = rgba[i + 3];
  }
  return outBuf;
}

// Adjusts parametric Lumetri values when exporting .ffx with an active Camera Log profile.
export function bakeLogProfileIntoLumetriParams(params, profileOrBool) {
  const code = getLogProfileCode(profileOrBool);
  if (code <= 0 || !params) return params;

  const LOG_PARAM_DELTAS = {
    1: { exposure: 0.12, contrast: 1.32, shadows: -0.14, highlights: -0.12, sat: 1.24, vib: 0.12, pivot: 0.43 },
    2: { exposure: 0.10, contrast: 1.28, shadows: -0.12, highlights: -0.10, sat: 1.20, vib: 0.10, pivot: 0.43 },
    3: { exposure: 0.08, contrast: 1.24, shadows: -0.10, highlights: -0.08, sat: 1.18, vib: 0.08, pivot: 0.44 },
    4: { exposure: 0.14, contrast: 1.30, shadows: -0.14, highlights: -0.10, sat: 1.22, vib: 0.12, pivot: 0.43 },
  };
  const d = LOG_PARAM_DELTAS[code] || LOG_PARAM_DELTAS[1];
  return {
    ...params,
    exposure: (params.exposure ?? 0.0) + d.exposure,
    contrast: (params.contrast ?? 1.0) * d.contrast,
    shadows: (params.shadows ?? 0.0) + d.shadows,
    highlights: (params.highlights ?? 0.0) + d.highlights,
    sat: (params.sat ?? 1.0) * d.sat,
    vib: (params.vib ?? 0.0) + d.vib,
    pivot: d.pivot,
  };
}

// Pure GLSL ES 1.00 helper functions for WebGL preview and .kfplug shader exports.
export const GLSL_LOG_PROFILE_FUNCTIONS = `float kfPow10(float x) {
    return exp(clamp(x, -10.0, 10.0) * 2.30258509);
}

float kfSlog3ToLin(float x) {
    float v = clamp(x, 0.0, 1.0);
    float cut = 0.16736099;
    if (v >= cut) {
        return kfPow10((v * 1023.0 - 420.0) / 261.5) * 0.19 - 0.01;
    }
    return (v * 1023.0 - 95.0) * 0.0002498736 - 0.01;
}

float kfClog3ToLin(float x) {
    float v = clamp(x, 0.0, 1.0);
    if (v < 0.09746547) {
        return -(kfPow10((0.12512219 - v) / 0.36726845) - 1.0) / 14.98325;
    }
    if (v <= 0.15277891) {
        return (v - 0.12512219) / 1.9754798;
    }
    return (kfPow10((v - 0.12512219) / 0.36726845) - 1.0) / 14.98325;
}

float kfDlogmToLin(float x) {
    float v = clamp(x, 0.0, 1.0);
    if (v > 0.14) {
        return (kfPow10(3.89616 * v - 2.27752) - 0.0108) / 0.9892;
    }
    return (v - 0.0929) / 6.025;
}

float kfAppleLogToLin(float x) {
    float P = clamp(x, 0.0, 1.0);
    float R0 = -0.05641088;
    float Pt = 0.20848688;
    if (P >= Pt) {
        return exp(clamp((P - 0.69336945) / 0.08550479, -12.0, 12.0) * 0.69314718) - 0.00964052;
    }
    return sqrt(max(P / 47.28711236, 0.0)) + R0;
}

float kfToneMapLin(float linVal) {
    float c = max(linVal, 0.0);
    float x = c * 1.18;
    float mapped = (x * (1.0 + x / 20.25)) / max(1.0 + x, 1e-5);
    return clamp(mapped, 0.0, 1.0);
}

float kfLinToRec709(float linVal) {
    float c = clamp(linVal, 0.0, 1.0);
    if (c <= 0.0031308) {
        return c * 12.92;
    }
    return 1.055 * pow(max(c, 1e-5), 1.0 / 2.4) - 0.055;
}

vec3 kfApplyLogProfile(vec3 rgb, float profileCode) {
    if (profileCode < 0.5) {
        return clamp(rgb, 0.0, 1.0);
    }
    vec3 lin;
    vec3 recLin;
    if (profileCode < 1.5) {
        lin = vec3(kfSlog3ToLin(rgb.r), kfSlog3ToLin(rgb.g), kfSlog3ToLin(rgb.b));
        recLin = vec3(
            1.626947 * lin.r - 0.540138 * lin.g - 0.086809 * lin.b,
            -0.178516 * lin.r + 1.417940 * lin.g - 0.239424 * lin.b,
            -0.044436 * lin.r - 0.508378 * lin.g + 1.552814 * lin.b
        );
    } else if (profileCode < 2.5) {
        lin = vec3(kfClog3ToLin(rgb.r), kfClog3ToLin(rgb.g), kfClog3ToLin(rgb.b));
        recLin = vec3(
            1.489804 * lin.r - 0.402059 * lin.g - 0.087745 * lin.b,
            -0.158868 * lin.r + 1.384969 * lin.g - 0.226101 * lin.b,
            -0.034516 * lin.r - 0.455206 * lin.g + 1.489722 * lin.b
        );
    } else if (profileCode < 3.5) {
        lin = vec3(kfDlogmToLin(rgb.r), kfDlogmToLin(rgb.g), kfDlogmToLin(rgb.b));
        recLin = vec3(
            1.328500 * lin.r - 0.268200 * lin.g - 0.060300 * lin.b,
            -0.109600 * lin.r + 1.258400 * lin.g - 0.148800 * lin.b,
            -0.021400 * lin.r - 0.324600 * lin.g + 1.346000 * lin.b
        );
    } else {
        lin = vec3(kfAppleLogToLin(rgb.r), kfAppleLogToLin(rgb.g), kfAppleLogToLin(rgb.b));
        recLin = vec3(
            1.660491 * lin.r - 0.587641 * lin.g - 0.072850 * lin.b,
            -0.124550 * lin.r + 1.132900 * lin.g - 0.008349 * lin.b,
            -0.018151 * lin.r - 0.100579 * lin.g + 1.118730 * lin.b
        );
    }
    return clamp(vec3(
        kfLinToRec709(kfToneMapLin(recLin.r)),
        kfLinToRec709(kfToneMapLin(recLin.g)),
        kfLinToRec709(kfToneMapLin(recLin.b))
    ), 0.0, 1.0);
}
`;
