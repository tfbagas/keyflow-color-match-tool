// GLSL ES 1.00 twin of gradeEngine.js gradeRGB(). Used verbatim by both the
// .kfplug pass0.frag and the WebGL video preview so output is 1:1.
// Every division / pow() is wrapped with max(..., 1e-5) and results clamped.

export const UNIFORM_MAP = [
  ["gradeMix", "uGradeMix"],
  ["exposure", "uExposure"],
  ["contrast", "uContrast"],
  ["pivot", "uPivot"],
  ["shadows", "uShadows"],
  ["highlights", "uHighlights"],
  ["temp", "uTemp"],
  ["tint", "uTint"],
  ["sat", "uSat"],
  ["vib", "uVib"],
  ["liftR", "uLiftR"],
  ["liftG", "uLiftG"],
  ["liftB", "uLiftB"],
  ["gammaR", "uGammaR"],
  ["gammaG", "uGammaG"],
  ["gammaB", "uGammaB"],
  ["gainR", "uGainR"],
  ["gainG", "uGainG"],
  ["gainB", "uGainB"],
];

export const PRECISION_HEADER = `#ifdef GL_FRAGMENT_PRECISION_HIGH
precision highp float;
#else
precision mediump float;
#endif
`;

export const GRADE_UNIFORMS = `uniform float uGradeMix;
uniform float uExposure;
uniform float uContrast;
uniform float uPivot;
uniform float uHighlights;
uniform float uShadows;
uniform float uTemp;
uniform float uTint;
uniform float uSat;
uniform float uVib;

uniform float uLiftR;
uniform float uLiftG;
uniform float uLiftB;

uniform float uGammaR;
uniform float uGammaG;
uniform float uGammaB;

uniform float uGainR;
uniform float uGainG;
uniform float uGainB;
`;

export const GRADE_FUNCTION = `float safePow(float b, float e) {
    return pow(max(b, 1e-5), e);
}

vec3 kfGrade(vec3 origRgb) {
    float origLum = dot(origRgb, vec3(0.2126, 0.7152, 0.0722));
    float shadowChromaMask = smoothstep(0.015, 0.13, origLum);
    float highlightChromaMask = 1.0 - smoothstep(0.86, 1.0, origLum);
    float chromaMask = shadowChromaMask * highlightChromaMask;

    float em = safePow(2.0, clamp(uExposure, -2.0, 2.0));
    vec3 wbGain = vec3(
        max(1.0 + uTemp * 0.28 + uTint * 0.14, 0.25),
        max(1.0 - uTint * 0.24, 0.25),
        max(1.0 - uTemp * 0.28 + uTint * 0.14, 0.25)
    );
    vec3 effWbGain = mix(vec3(1.0), wbGain, chromaMask);
    vec3 rgb = max(origRgb * em * effWbGain, vec3(0.0));

    float lum = dot(rgb, vec3(0.2126, 0.7152, 0.0722));
    float shadowFloorMask = smoothstep(0.04, 0.32, lum);
    float contrastBlackMask = smoothstep(0.0, 0.35, lum);

    vec3 liftDelta  = (vec3(uLiftR, uLiftG, uLiftB) - 0.5) * 2.0;
    vec3 gammaDelta = (vec3(uGammaR, uGammaG, uGammaB) - 0.5) * 2.0;
    vec3 gainDelta  = (vec3(uGainR, uGainG, uGainB) - 0.5) * 2.0;

    float wShadow       = clamp(1.0 - lum * 2.5, 0.0, 1.0);
    float wShadowChroma = wShadow * shadowFloorMask * chromaMask;
    float wMid          = clamp(1.0 - abs(lum - 0.45) * 2.2, 0.0, 1.0) * chromaMask;
    float wHigh         = clamp((lum - 0.48) * 2.0, 0.0, 1.0);

    rgb += liftDelta * wShadowChroma * 0.48;
    rgb += gammaDelta * wMid * 0.52;
    rgb += gainDelta * (wHigh * chromaMask) * 0.48;

    float shadowsEff = uShadows > 0.0 ? uShadows * shadowFloorMask : uShadows;
    rgb += vec3(shadowsEff * wShadow * 0.30 + uHighlights * wHigh * 0.30);

    float contrast = clamp(uContrast, 0.5, 2.0);
    vec3 contrasted = max((rgb - uPivot) * contrast + uPivot, vec3(0.0));
    rgb = contrast < 1.0 ? mix(rgb, contrasted, contrastBlackMask) : contrasted;

    float lumaPost = dot(rgb, vec3(0.2126, 0.7152, 0.0722));
    float maxC = max(rgb.r, max(rgb.g, rgb.b));
    float minC = min(rgb.r, min(rgb.g, rgb.b));
    float currentSat = clamp((maxC - minC) / max(maxC, 1e-5), 0.0, 1.0);

    float postChromaMask = smoothstep(0.015, 0.13, lumaPost) * (1.0 - smoothstep(0.86, 1.0, lumaPost));
    float vibBonus = uVib * postChromaMask * (1.0 - currentSat * 0.75) * 1.25;
    float satTotal = clamp(uSat + vibBonus, 0.0, 3.0);
    rgb = vec3(lumaPost) + satTotal * (rgb - vec3(lumaPost));

    float knee = 0.82;
    float room = 0.18;
    vec3 over = max(rgb - vec3(knee), vec3(0.0));
    vec3 rolled = vec3(knee) + (room * over) / max(vec3(room) + over, vec3(1e-5));
    float shoulderMix = clamp(
        max(em - 1.0, 0.0) * 1.6 +
        max(contrast - 1.0, 0.0) * 1.2 +
        max(uHighlights, 0.0) * 1.5,
        0.0,
        1.0
    );
    rgb = mix(rgb, rolled, shoulderMix);

    rgb = clamp(rgb, 0.0, 1.0);
    return mix(origRgb, rgb, clamp(uGradeMix, 0.0, 1.0));
}
`;

export const KFPLUG_FRAGMENT = `${PRECISION_HEADER}
uniform sampler2D uTexture;
varying vec2 vTex;

${GRADE_UNIFORMS}
${GRADE_FUNCTION}
void main() {
    vec4 c = texture2D(uTexture, vTex);
    float a = clamp(c.a, 0.0, 1.0);
    if (a <= 1e-5) {
        gl_FragColor = vec4(0.0);
        return;
    }

    vec3 origRgb = clamp(c.rgb / max(a, 1e-5), 0.0, 1.0);
    vec3 graded = kfGrade(origRgb);
    gl_FragColor = vec4(graded * a, a);
}
`;

export const PREVIEW_VERTEX = `attribute vec2 aPos;
varying vec2 vTex;
void main() {
    vTex = vec2(aPos.x * 0.5 + 0.5, aPos.y * 0.5 + 0.5);
    gl_Position = vec4(aPos, 0.0, 1.0);
}
`;

// Static image vertex shader: flips Y in shader so UNPACK_FLIP_Y_WEBGL=false works
// consistently across ImageBitmap, HTMLCanvasElement, and HTMLImageElement.
export const IMAGE_PREVIEW_VERTEX = `attribute vec2 aPos;
varying vec2 vTex;
void main() {
    vec2 a_texCoord = aPos * 0.5 + 0.5;
    vTex = vec2(a_texCoord.x, 1.0 - a_texCoord.y);
    gl_Position = vec4(aPos, 0.0, 1.0);
}
`;

// u_viewMode: 0 = Split Slider, 1 = Side by Side, 2 = Split Result
export const PREVIEW_FRAGMENT = `${PRECISION_HEADER}
uniform sampler2D uTexture;
uniform float u_viewMode;
uniform vec2 u_resolution;
uniform float uSplit;
uniform float uHold;
uniform float uLogInput;
varying vec2 vTex;

${GRADE_UNIFORMS}
${GRADE_FUNCTION}
vec3 kfApplyLogInput(vec3 rgb) {
    float lumaIn = dot(rgb, vec3(0.2126, 0.7152, 0.0722));
    vec3 damped = mix(vec3(lumaIn), rgb, 0.82);
    vec3 curved = pow(clamp(damped, 0.0, 1.0), vec3(0.84));
    float toe = 0.04 * smoothstep(0.0, 0.08, lumaIn);
    return clamp(vec3(toe) + curved * 0.88, 0.0, 0.92);
}

void main() {
    vec2 uv = vTex;
    bool graded = true;

    if (u_viewMode > 1.5) {
        graded = true;
    } else if (u_viewMode > 0.5) {
        if (u_resolution.x > 0.0 && abs(floor(gl_FragCoord.x) - floor(u_resolution.x * 0.5)) < 0.5) {
            gl_FragColor = vec4(0.42, 0.43, 0.47, 1.0);
            return;
        }
        if (vTex.x < 0.5) {
            uv.x = vTex.x * 2.0;
            graded = false;
        } else {
            uv.x = (vTex.x - 0.5) * 2.0;
        }
    } else {
        graded = vTex.x >= uSplit;
    }

    if (uHold > 0.5) {
        graded = false;
    }

    vec3 src = clamp(texture2D(uTexture, uv).rgb, 0.0, 1.0);
    float srcLuma = dot(src, vec3(0.2126, 0.7152, 0.0722));
    vec3 inputRgb = uLogInput > 0.5 ? kfApplyLogInput(src) : src;
    vec3 outRgb = graded ? kfGrade(inputRgb) : inputRgb;
    if (graded) {
        float blackProtect = smoothstep(0.0, 0.06, srcLuma);
        outRgb = mix(src, outRgb, blackProtect);
    }
    gl_FragColor = vec4(outRgb, 1.0);
}
`;
