// GLSL ES 1.00 twin of gradeEngine.js gradeRGB(). Used verbatim by both the
// .kfplug pass0.frag and the WebGL video/photo preview so output is 1:1.
// Pure GLSL ES 1.00: no sampler3D, no dynamic loops, no ES 3.00 syntax.
// Every division / pow() is wrapped with max(..., 1e-5) and results clamped.
import { UNIFORM_MAP } from "./paramSchema.js";
import { GLSL_OKLAB_GAMUT_COMPRESS_FUNCTIONS } from "./colorMatcher.js";
import { GLSL_LOG_PROFILE_FUNCTIONS } from "./logProfiles.js";

export { UNIFORM_MAP };

export const PRECISION_HEADER = `#ifdef GL_FRAGMENT_PRECISION_HIGH
precision highp float;
#else
precision mediump float;
#endif
`;

export const GRADE_UNIFORMS = `uniform float uGradeMix;
uniform float uAutoGradeMix;
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

uniform vec4 uPolyR[5];
uniform vec4 uPolyG[5];
uniform vec4 uPolyB[5];
uniform vec4 uHueShiftA;
uniform vec2 uHueShiftB;
uniform vec4 uHueSatA;
uniform vec2 uHueSatB;
uniform vec4 uHueLumaA;
uniform vec2 uHueLumaB;
`;

export const GRADE_FUNCTION = `float safePow(float b, float e) {
    return pow(max(b, 1e-5), e);
}

float kfTanh(float x) {
    float cx = clamp(x, -8.0, 8.0);
    float e2x = exp(2.0 * cx);
    return (e2x - 1.0) / max(e2x + 1.0, 1e-5);
}

float kfHueSector(float h, float center) {
    float d = atan(sin(h - center), cos(h - center));
    float w = clamp(1.0 - abs(d) / 1.04719755, 0.0, 1.0);
    return w * w * (3.0 - 2.0 * w);
}

float kfAgxChannel(float x) {
    float v = max(x, 0.0);
    float k = 0.72;
    if (v <= k) return v;
    float over = v - k;
    float room = 1.0 - k;
    return k + (room * over) / max(room + over * 0.88, 1e-5);
}

${GLSL_OKLAB_GAMUT_COMPRESS_FUNCTIONS}

vec3 kfHybridLayer(vec3 baseColor) {
    float autoMix = clamp(uAutoGradeMix, 0.0, 1.5);
    if (autoMix <= 1e-5) {
        return baseColor;
    }

    vec3 c = clamp(baseColor, 0.0, 1.0);
    float r = c.r;
    float g = c.g;
    float b = c.b;
    float baseLuma = dot(c, vec3(0.2126, 0.7152, 0.0722));
    float shadowMask = smoothstep(0.015, 0.16, baseLuma);
    float r2 = r * r;
    float g2 = g * g;
    float b2 = b * b;

    vec4 b0 = vec4(0.0, r, g, b);
    vec4 b1 = vec4(r2, g2, b2, r * g);
    vec4 b2v = vec4(r * b, g * b, r2 * r, g2 * g);
    vec4 b3 = vec4(b2 * b, r2 * g, r2 * b, g2 * r);
    vec4 b4 = vec4(g2 * b, b2 * r, b2 * g, r * g * b);

    float pr = dot(uPolyR[0], b0) + dot(uPolyR[1], b1) + dot(uPolyR[2], b2v) + dot(uPolyR[3], b3) + dot(uPolyR[4], b4);
    float pg = dot(uPolyG[0], b0) + dot(uPolyG[1], b1) + dot(uPolyG[2], b2v) + dot(uPolyG[3], b3) + dot(uPolyG[4], b4);
    float pb = dot(uPolyB[0], b0) + dot(uPolyB[1], b1) + dot(uPolyB[2], b2v) + dot(uPolyB[3], b3) + dot(uPolyB[4], b4);
    vec3 p = clamp(vec3(pr, pg, pb), 0.0, 1.15);

    float y0 = dot(p, vec3(0.2126, 0.7152, 0.0722));
    float c1 = p.r - y0;
    float c2 = p.b - y0;
    float chr = sqrt(c1 * c1 + c2 * c2 + 1e-10);
    float hueGate = smoothstep(0.015, 0.08, chr) * smoothstep(0.03, 0.14, y0) * (1.0 - smoothstep(0.86, 0.99, y0));
    float hAngle = atan(c2, c1);

    float w0 = kfHueSector(hAngle, 0.0);
    float w1 = kfHueSector(hAngle, 1.04719755);
    float w2 = kfHueSector(hAngle, 2.09439510);
    float w3 = kfHueSector(hAngle, 3.14159265);
    float w4 = kfHueSector(hAngle, -2.09439510);
    float w5 = kfHueSector(hAngle, -1.04719755);

    vec4 wA = vec4(w0, w1, w2, w3);
    vec2 wB = vec2(w4, w5);

    float dHue = (dot(wA, uHueShiftA) + dot(wB, uHueShiftB)) * hueGate;
    float dSat = (dot(wA, uHueSatA) + dot(wB, uHueSatB)) * hueGate;
    float dLum = (dot(wA, uHueLumaA) + dot(wB, uHueLumaB)) * hueGate;

    float cs = cos(dHue);
    float sn = sin(dHue);
    float rc1 = c1 * cs - c2 * sn;
    float rc2 = c1 * sn + c2 * cs;
    float satScale = clamp(1.0 + dSat, 0.25, 1.85);
    float nc1 = rc1 * satScale;
    float nc2 = rc2 * satScale;
    float ny = clamp(y0 + dLum * 0.24, 0.0, 1.15);
    float ng = ny - (0.2126 * nc1 + 0.0722 * nc2) / 0.7152;
    p = vec3(ny + nc1, ng, ny + nc2);

    float y1 = dot(p, vec3(0.2126, 0.7152, 0.0722));
    float endRoll = 0.75 + 0.25 * (smoothstep(0.0, 0.10, y1) * (1.0 - smoothstep(0.85, 1.0, y1)));
    p = vec3(y1) + (p - vec3(y1)) * endRoll;

    float maxC = max(p.r, max(p.g, p.b));
    float minC = min(p.r, min(p.g, p.b));
    float satEst = clamp((maxC - minC) / max(maxC, 1e-4), 0.0, 1.0);
    float midMask = smoothstep(0.08, 0.30, y1) * (1.0 - smoothstep(0.68, 0.92, y1));
    float density = 1.0 - satEst * midMask * 0.065;
    p *= density;

    float y2 = clamp(dot(p, vec3(0.2126, 0.7152, 0.0722)), 0.0, 1.0);
    vec3 d = p - vec3(y2);
    float maxSpan = max(abs(d.r), max(abs(d.g), max(abs(d.b), 1e-4)));
    float softSpan = kfTanh(maxSpan * 1.35) / 1.35;
    p = max(vec3(y2) + d * (softSpan / maxSpan), vec3(0.0));
    p = kfOklabGamutCompress(p);

    float ir = 0.856 * p.r + 0.095 * p.g + 0.049 * p.b;
    float ig = 0.070 * p.r + 0.875 * p.g + 0.055 * p.b;
    float ib = 0.048 * p.r + 0.102 * p.g + 0.850 * p.b;
    float ar = kfAgxChannel(ir);
    float ag = kfAgxChannel(ig);
    float ab = kfAgxChannel(ib);
    vec3 outAgx = clamp(vec3(
        1.182 * ar - 0.128 * ag - 0.054 * ab,
        -0.094 * ar + 1.158 * ag - 0.064 * ab,
        -0.055 * ar - 0.125 * ag + 1.180 * ab
    ), 0.0, 1.0);

    vec3 hybridDelta = (outAgx - baseColor) * autoMix;
    return clamp(baseColor + shadowMask * hybridDelta, 0.0, 1.0);
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

    vec3 baseColor = clamp(rgb, 0.0, 1.0);
    vec3 finalRgb = kfHybridLayer(baseColor);
    return mix(origRgb, finalRgb, clamp(uGradeMix, 0.0, 1.0));
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
    float baseLuma = dot(origRgb, vec3(0.2126, 0.7152, 0.0722));
    float shadowMask = smoothstep(0.015, 0.16, baseLuma);
    float blackProtect = smoothstep(0.0, 0.06, baseLuma) * (0.15 + 0.85 * shadowMask);
    vec3 graded = mix(origRgb, kfGrade(origRgb), blackProtect);
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

// Unified vertex shader supporting both photo (uFlipY = 1.0) and video (uFlipY = 0.0)
// without recompiling the shader program when switching media types.
export const UNIFIED_PREVIEW_VERTEX = `attribute vec2 aPos;
uniform float uFlipY;
varying vec2 vTex;
void main() {
    vec2 uv = aPos * 0.5 + 0.5;
    vTex = vec2(uv.x, uFlipY > 0.5 ? 1.0 - uv.y : uv.y);
    gl_Position = vec4(aPos, 0.0, 1.0);
}
`;

// u_viewMode: 0 = Split Slider, 1 = Side by Side, 2 = Graded Only
// uMonitorMode: 0 = Off, 1 = Zebra/Clipping (>0.98 or <0.02), 2 = False Color IRE
export const PREVIEW_FRAGMENT = `${PRECISION_HEADER}
uniform sampler2D uTexture;
uniform float u_viewMode;
uniform vec2 u_resolution;
uniform float uSplit;
uniform float uSplitAxis;
uniform float uHold;
uniform float uLogInput;
uniform float uMonitorMode;
varying vec2 vTex;

${GRADE_UNIFORMS}
${GRADE_FUNCTION}
${GLSL_LOG_PROFILE_FUNCTIONS}

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
        if (uSplitAxis > 0.5) {
            float screenY = u_resolution.y > 0.0 ? (1.0 - (gl_FragCoord.y / u_resolution.y)) : vTex.y;
            graded = screenY >= uSplit;
        } else {
            graded = vTex.x >= uSplit;
        }
    }

    if (uHold > 0.5) {
        graded = false;
    }

    vec3 src = clamp(texture2D(uTexture, uv).rgb, 0.0, 1.0);
    vec3 inputRgb = uLogInput > 0.5 ? kfApplyLogProfile(src, uLogInput) : src;
    float baseLuma = dot(inputRgb, vec3(0.2126, 0.7152, 0.0722));
    vec3 outRgb = graded ? kfGrade(inputRgb) : src;
    if (graded) {
        float shadowMask = smoothstep(0.015, 0.16, baseLuma);
        float blackProtect = smoothstep(0.0, 0.06, baseLuma) * (0.15 + 0.85 * shadowMask);
        outRgb = mix(inputRgb, outRgb, blackProtect);
    }
    if (uMonitorMode > 0.5) {
        float monLuma = dot(outRgb, vec3(0.2126, 0.7152, 0.0722));
        if (uMonitorMode < 1.5) {
            float stripe = step(0.5, fract((gl_FragCoord.x + gl_FragCoord.y) * 0.125));
            if (monLuma > 0.98 || outRgb.r > 0.985 || outRgb.g > 0.985 || outRgb.b > 0.985) {
                outRgb = mix(outRgb, vec3(1.0, 0.28, 0.22), 0.75 * stripe);
            } else if (monLuma < 0.02) {
                outRgb = mix(outRgb, vec3(0.22, 0.55, 1.0), 0.75 * stripe);
            }
        } else {
            vec3 fc;
            if (monLuma < 0.04) {
                fc = vec3(0.32, 0.14, 0.65);
            } else if (monLuma < 0.15) {
                fc = vec3(0.16, 0.42, 0.92);
            } else if (monLuma < 0.35) {
                fc = vec3(0.14, 0.72, 0.72);
            } else if (monLuma < 0.52) {
                fc = vec3(0.24, 0.78, 0.38);
            } else if (monLuma < 0.68) {
                fc = vec3(0.92, 0.52, 0.72);
            } else if (monLuma < 0.85) {
                fc = vec3(0.95, 0.82, 0.22);
            } else if (monLuma < 0.96) {
                fc = vec3(0.96, 0.48, 0.14);
            } else {
                fc = vec3(0.95, 0.16, 0.16);
            }
            outRgb = fc;
        }
    }
    gl_FragColor = vec4(outRgb, 1.0);
}
`;

// Queries and caches hybrid uniform locations on a compiled WebGLProgram.
export function getHybridUniformLocations(gl, program) {
  return {
    uAutoGradeMix: gl.getUniformLocation(program, "uAutoGradeMix"),
    uPolyR: gl.getUniformLocation(program, "uPolyR[0]"),
    uPolyG: gl.getUniformLocation(program, "uPolyG[0]"),
    uPolyB: gl.getUniformLocation(program, "uPolyB[0]"),
    uHueShiftA: gl.getUniformLocation(program, "uHueShiftA"),
    uHueShiftB: gl.getUniformLocation(program, "uHueShiftB"),
    uHueSatA: gl.getUniformLocation(program, "uHueSatA"),
    uHueSatB: gl.getUniformLocation(program, "uHueSatB"),
    uHueLumaA: gl.getUniformLocation(program, "uHueLumaA"),
    uHueLumaB: gl.getUniformLocation(program, "uHueLumaB"),
  };
}

// Uploads packed vec4 hybrid uniforms to WebGL (identity when v1/v2 is active).
export function bindHybridUniforms(gl, hybridLoc, safeParams) {
  if (!hybridLoc) return;
  if (hybridLoc.uAutoGradeMix !== null) {
    gl.uniform1f(hybridLoc.uAutoGradeMix, safeParams.autoGradeMix ?? 0.0);
  }
  if (hybridLoc.uPolyR !== null) {
    gl.uniform4fv(hybridLoc.uPolyR, new Float32Array(safeParams.polyR));
  }
  if (hybridLoc.uPolyG !== null) {
    gl.uniform4fv(hybridLoc.uPolyG, new Float32Array(safeParams.polyG));
  }
  if (hybridLoc.uPolyB !== null) {
    gl.uniform4fv(hybridLoc.uPolyB, new Float32Array(safeParams.polyB));
  }
  const hs = safeParams.hueShift;
  const hsat = safeParams.hueSat;
  const hl = safeParams.hueLuma;
  if (hybridLoc.uHueShiftA !== null) {
    gl.uniform4f(hybridLoc.uHueShiftA, hs[0], hs[1], hs[2], hs[3]);
  }
  if (hybridLoc.uHueShiftB !== null) {
    gl.uniform2f(hybridLoc.uHueShiftB, hs[4], hs[5]);
  }
  if (hybridLoc.uHueSatA !== null) {
    gl.uniform4f(hybridLoc.uHueSatA, hsat[0], hsat[1], hsat[2], hsat[3]);
  }
  if (hybridLoc.uHueSatB !== null) {
    gl.uniform2f(hybridLoc.uHueSatB, hsat[4], hsat[5]);
  }
  if (hybridLoc.uHueLumaA !== null) {
    gl.uniform4f(hybridLoc.uHueLumaA, hl[0], hl[1], hl[2], hl[3]);
  }
  if (hybridLoc.uHueLumaB !== null) {
    gl.uniform2f(hybridLoc.uHueLumaB, hl[4], hl[5]);
  }
}
