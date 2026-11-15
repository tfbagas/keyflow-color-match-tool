#ifdef GL_FRAGMENT_PRECISION_HIGH
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
    // Nilai netral ada di 0.5 (offset = 0.0)
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
    
    // Vibrance melindungi warna yang sudah sangat jenuh agar tidak clipping
    float vibBonus = uVib * (1.0 - currentSat);
    float satTotal = clamp(uSat + vibBonus, 0.0, 3.0);
    rgb = mix(vec3(lumaPost), rgb, satTotal);

    // 8. Re-premultiply alpha & Blend Grade Mix
    rgb = clamp(rgb, 0.0, 1.0);
    vec3 finalRgb = mix(origRgb, rgb, clamp(uGradeMix, 0.0, 1.0));
    gl_FragColor = vec4(finalRgb * a, a);
}
