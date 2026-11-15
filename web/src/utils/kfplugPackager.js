import JSZip from "jszip";

const SHADER_PASS0 = `#ifdef GL_FRAGMENT_PRECISION_HIGH
precision highp float;
#else
precision mediump float;
#endif

// Built-in Keyflow Engine Uniforms
uniform sampler2D uTexture;
varying vec2 vTex;

// Parameters (otomatis diinjeksi oleh engine Keyflow sesuai schema effect.json)
// Format penamaan Keyflow: u<CapitalizedId> (Alphanumeric only, tanpa underscore)
uniform float uGradeMix;
uniform float uExposure;
uniform float uContrast;
uniform float uPivot;
uniform float uHighlights;
uniform float uShadows;
uniform float uTemp;
uniform float uTint;
uniform float uSat;
uniform float uVib;

// 3-Way Split Toning (Lift = Shadows, Gamma = Midtones, Gain = Highlights)
uniform float uLiftR;
uniform float uLiftG;
uniform float uLiftB;

uniform float uGammaR;
uniform float uGammaG;
uniform float uGammaB;

uniform float uGainR;
uniform float uGainG;
uniform float uGainB;

void main() {
    vec4 c = texture2D(uTexture, vTex);
    float a = c.a;
    if (a <= 1e-4) {
        gl_FragColor = vec4(0.0);
        return;
    }

    // 1. Un-premultiply alpha (Standar Pipeline Keyflow)
    vec3 origRgb = c.rgb / a;
    vec3 rgb = origRgb;

    // 2. Exposure adjustment (Exposure Value EV dalam skala 2^EV)
    rgb *= pow(2.0, uExposure);

    // 3. White Balance (Temperature: Kelvin warm/cool & Tint: Magenta/Green)
    rgb.r += uTemp * 0.12 + uTint * 0.06;
    rgb.g -= uTint * 0.12;
    rgb.b -= uTemp * 0.12 - uTint * 0.06;
    rgb = max(rgb, vec3(0.0));

    // 4. Hitung luminansi perceptual (Rec. 709)
    float lum = dot(rgb, vec3(0.2126, 0.7152, 0.0722));

    // 5. 3-Way Color Wheels (Lift, Gamma, Gain)
    vec3 liftDelta  = (vec3(uLiftR, uLiftG, uLiftB) - 0.5) * 2.0;
    vec3 gammaDelta = (vec3(uGammaR, uGammaG, uGammaB) - 0.5) * 2.0;
    vec3 gainDelta  = (vec3(uGainR, uGainG, uGainB) - 0.5) * 2.0;

    // Bobot zona tonal halus (smooth tonal rolloff)
    float wShadow = clamp(1.0 - lum * 2.5, 0.0, 1.0);
    float wHigh   = clamp((lum - 0.5) * 2.0, 0.0, 1.0);
    float wMid    = clamp(1.0 - abs(lum - 0.45) * 2.5, 0.0, 1.0);

    rgb += liftDelta * wShadow * 0.35;
    rgb += gammaDelta * wMid * 0.35;
    rgb += gainDelta * wHigh * 0.35;

    // Koreksi tone level (Shadows crush/lift & Highlights roll/boost)
    rgb += vec3(uShadows) * wShadow * 0.25;
    rgb += vec3(uHighlights) * wHigh * 0.25;

    // 6. Kontras dengan titik tumpu (Pivot-centered Contrast)
    rgb = (rgb - uPivot) * uContrast + uPivot;

    // 7. Saturation & Smart Vibrance
    float lumaPost = dot(rgb, vec3(0.2126, 0.7152, 0.0722));
    float maxC = max(rgb.r, max(rgb.g, rgb.b));
    float minC = min(rgb.r, min(rgb.g, rgb.b));
    float currentSat = (maxC - minC) / max(maxC, 1e-4);
    
    float vibBonus = uVib * (1.0 - currentSat);
    float satTotal = clamp(uSat + vibBonus, 0.0, 3.0);
    rgb = mix(vec3(lumaPost), rgb, satTotal);

    // 8. Re-premultiply alpha & Blend Grade Mix
    rgb = clamp(rgb, 0.0, 1.0);
    vec3 finalRgb = mix(origRgb, rgb, clamp(uGradeMix, 0.0, 1.0));
    gl_FragColor = vec4(finalRgb * a, a);
}
`;

const BASE_PARAMS = [
  { id: "gradeMix", label: "Grade Mix / Blend", type: "scalar", default: 1.0, min: 0.0, max: 1.0, displayScale: 100.0, decimals: 0, group: "Master" },
  { id: "exposure", label: "Exposure (EV)", type: "scalar", default: 0.0, min: -2.0, max: 2.0, displayScale: 1.0, decimals: 2, group: "Tone & Contrast" },
  { id: "contrast", label: "Contrast", type: "scalar", default: 1.0, min: 0.2, max: 2.0, displayScale: 1.0, decimals: 2, group: "Tone & Contrast" },
  { id: "pivot", label: "Contrast Pivot", type: "scalar", default: 0.435, min: 0.1, max: 0.9, displayScale: 1.0, decimals: 2, group: "Tone & Contrast" },
  { id: "shadows", label: "Shadows Lift/Crush", type: "scalar", default: 0.0, min: -1.0, max: 1.0, displayScale: 100.0, decimals: 0, group: "Tone & Contrast" },
  { id: "highlights", label: "Highlights Boost/Roll", type: "scalar", default: 0.0, min: -1.0, max: 1.0, displayScale: 100.0, decimals: 0, group: "Tone & Contrast" },
  { id: "temp", label: "Color Temperature", type: "scalar", default: 0.0, min: -1.0, max: 1.0, displayScale: 100.0, decimals: 0, group: "White Balance" },
  { id: "tint", label: "Color Tint", type: "scalar", default: 0.0, min: -1.0, max: 1.0, displayScale: 100.0, decimals: 0, group: "White Balance" },
  { id: "sat", label: "Saturation", type: "scalar", default: 1.0, min: 0.0, max: 2.0, displayScale: 100.0, decimals: 0, group: "Color Balance" },
  { id: "vib", label: "Vibrance", type: "scalar", default: 0.0, min: -1.0, max: 1.0, displayScale: 100.0, decimals: 0, group: "Color Balance" },
  { id: "liftR", label: "Shadows Red", type: "scalar", default: 0.5, min: 0.0, max: 1.0, displayScale: 1.0, decimals: 2, group: "3-Way Toning" },
  { id: "liftG", label: "Shadows Green", type: "scalar", default: 0.5, min: 0.0, max: 1.0, displayScale: 1.0, decimals: 2, group: "3-Way Toning" },
  { id: "liftB", label: "Shadows Blue", type: "scalar", default: 0.5, min: 0.0, max: 1.0, displayScale: 1.0, decimals: 2, group: "3-Way Toning" },
  { id: "gammaR", label: "Midtones Red", type: "scalar", default: 0.5, min: 0.0, max: 1.0, displayScale: 1.0, decimals: 2, group: "3-Way Toning" },
  { id: "gammaG", label: "Midtones Green", type: "scalar", default: 0.5, min: 0.0, max: 1.0, displayScale: 1.0, decimals: 2, group: "3-Way Toning" },
  { id: "gammaB", label: "Midtones Blue", type: "scalar", default: 0.5, min: 0.0, max: 1.0, displayScale: 1.0, decimals: 2, group: "3-Way Toning" },
  { id: "gainR", label: "Highlights Red", type: "scalar", default: 0.5, min: 0.0, max: 1.0, displayScale: 1.0, decimals: 2, group: "3-Way Toning" },
  { id: "gainG", label: "Highlights Green", type: "scalar", default: 0.5, min: 0.0, max: 1.0, displayScale: 1.0, decimals: 2, group: "3-Way Toning" },
  { id: "gainB", label: "Highlights Blue", type: "scalar", default: 0.5, min: 0.0, max: 1.0, displayScale: 1.0, decimals: 2, group: "3-Way Toning" },
];

const BASE_COLORS = [
  { label: "Shadows Tint", r: "liftR", g: "liftG", b: "liftB" },
  { label: "Midtones Tint", r: "gammaR", g: "gammaG", b: "gammaB" },
  { label: "Highlights Tint", r: "gainR", g: "gainG", b: "gainB" },
];

const PRESETS = [
  {
    id: "tealOrange",
    label: "Teal & Orange Cinema",
    values: { contrast: 1.25, exposure: 0.1, sat: 1.15, vib: 0.2, liftR: 0.35, liftG: 0.52, liftB: 0.65, gammaR: 0.52, gammaG: 0.50, gammaB: 0.48, gainR: 0.65, gainG: 0.55, gainB: 0.40 }
  },
  {
    id: "moodyVintage",
    label: "Moody Vintage Film",
    values: { contrast: 0.85, exposure: -0.1, shadows: 0.15, highlights: -0.1, temp: 0.15, sat: 0.8, vib: -0.1, liftR: 0.52, liftG: 0.54, liftB: 0.48, gainR: 0.58, gainG: 0.52, gainB: 0.45 }
  },
  {
    id: "bleachBypass",
    label: "Bleach Bypass",
    values: { contrast: 1.45, exposure: 0.05, sat: 0.55, vib: -0.3, shadows: -0.15, highlights: 0.1, liftR: 0.48, liftG: 0.50, liftB: 0.52 }
  },
  {
    id: "cyberpunkNeon",
    label: "Cyberpunk Magenta/Cyan",
    values: { contrast: 1.3, exposure: 0.1, sat: 1.3, temp: -0.2, tint: 0.3, liftR: 0.38, liftG: 0.48, liftB: 0.68, gainR: 0.68, gainG: 0.38, gainB: 0.58 }
  }
];

export async function generateKfplug(params, presetName, author, description) {
  const cleanName = (presetName || "Custom Grade").trim();
  const cleanSlug = cleanName.replace(/[^a-zA-Z0-9]/g, "").toLowerCase().slice(0, 16) || "grade";
  const pkgId = `com.keyflow.matchgrade.${cleanSlug}`;
  const effectId = `matchgrade_${cleanSlug}`;
  const displayName = `Match Grade (${cleanName})`;

  const words = cleanName.match(/[a-zA-Z0-9]+/g) || [];
  const cleanPresetId = "preset" + (words.map(w => w.charAt(0).toUpperCase() + w.slice(1)).join("").slice(0, 24) || "Match");

  const effectData = {
    id: effectId,
    name: displayName,
    category: "Warna",
    thumbnailStyle: "split",
    thumbnailInset: 0.05,
    params: BASE_PARAMS,
    colors: BASE_COLORS,
    presets: [
      {
        id: cleanPresetId,
        label: cleanName.slice(0, 32),
        values: { ...params }
      },
      ...PRESETS
    ],
    newInstanceValues: { ...params },
    thumbnailValues: { ...params },
    passes: [{ shader: "pass0.frag", scale: 1.0 }]
  };

  const manifestData = {
    format: 1,
    api: 1,
    id: pkgId,
    name: displayName,
    version: "1.0.0",
    versionCode: 1,
    author: (author || "TFBAGAS").trim(),
    description: (description || `Grading preset matched from reference '${cleanName}'.`).trim(),
    license: "MIT",
    effects: [effectId]
  };

  const zip = new JSZip();
  zip.file("manifest.json", JSON.stringify(manifestData, null, 2));
  zip.file(`effects/${effectId}/effect.json`, JSON.stringify(effectData, null, 2));
  zip.file(`effects/${effectId}/pass0.frag`, SHADER_PASS0);

  const blob = await zip.generateAsync({ type: "blob", compression: "DEFLATE" });
  const safeFileName = cleanName.replace(/[^a-zA-Z0-9_-]/g, "_");
  const fileName = `Match_Grade_${safeFileName}.kfplug`;

  return { blob, fileName, displayName };
}

export function downloadBlob(blob, fileName) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  setTimeout(() => {
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }, 100);
}
