import {
  PREVIEW_VERTEX,
  PREVIEW_FRAGMENT,
  UNIFORM_MAP,
  getHybridUniformLocations,
  bindHybridUniforms,
  getLutUniformLocations,
  createLutGLState,
  cleanupLutGLState,
  bindLutTextureAndUniforms,
} from "./gradeShader";
import { DEFAULT_PARAMS, sanitizeParams } from "./gradeEngine";
import { simulateGradePixels } from "./colorGrading";
import { getLogProfileCode, getLogProfile } from "./logProfiles";
import { encodeGradeToHash, generateQrMatrix } from "./shareCodec";
import {
  DEFAULT_ENGINE_ID,
  resolveEngineId,
} from "./engineMetadata";
import { extractPaletteSwatches } from "./paletteSwatches";

export { extractPaletteSwatches };

function compileShader(gl, type, source) {
  const shader = gl.createShader(type);
  if (!shader) return null;
  gl.shaderSource(shader, source);
  gl.compileShader(shader);
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    gl.deleteShader(shader);
    return null;
  }
  return shader;
}

export function createWebGLFrameGrader({
  width,
  height,
  params,
  activeLut = null,
  lutMix = 1.0,
  layout = "graded",
  splitPos = 50,
  simulateLogInput = false,
  alpha = true,
}) {
  const glCanvas = document.createElement("canvas");
  glCanvas.width = width;
  glCanvas.height = height;

  const gl = glCanvas.getContext("webgl", {
    alpha,
    antialias: false,
    depth: false,
    stencil: false,
    preserveDrawingBuffer: true,
    premultipliedAlpha: false,
    powerPreference: "high-performance",
  });

  if (!gl) return null;

  const maxTex = gl.getParameter(gl.MAX_TEXTURE_SIZE) || 4096;
  if (width > maxTex || height > maxTex) {
    gl.getExtension("WEBGL_lose_context")?.loseContext();
    return null;
  }

  let vs = null;
  let fs = null;
  let program = null;
  let buffer = null;
  let texture = null;

  try {
    vs = compileShader(gl, gl.VERTEX_SHADER, PREVIEW_VERTEX);
    fs = compileShader(gl, gl.FRAGMENT_SHADER, PREVIEW_FRAGMENT);
    if (!vs || !fs) throw new Error("Shader compile failed.");

    program = gl.createProgram();
    gl.attachShader(program, vs);
    gl.attachShader(program, fs);
    gl.linkProgram(program);
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
      throw new Error("Shader link failed.");
    }

    gl.useProgram(program);

    buffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
    gl.bufferData(
      gl.ARRAY_BUFFER,
      new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]),
      gl.STATIC_DRAW
    );

    const aPos = gl.getAttribLocation(program, "aPos");
    gl.enableVertexAttribArray(aPos);
    gl.vertexAttribPointer(aPos, 2, gl.FLOAT, false, 0, 0);

    texture = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, texture);
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);
    gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);

    gl.uniform1i(gl.getUniformLocation(program, "uTexture"), 0);
    gl.uniform1f(
      gl.getUniformLocation(program, "u_viewMode"),
      layout === "split" ? 0.0 : 2.0
    );
    const uResolution = gl.getUniformLocation(program, "u_resolution");
    if (uResolution !== null) {
      gl.uniform2f(uResolution, width, height);
    }
    gl.uniform1f(
      gl.getUniformLocation(program, "uSplit"),
      Math.max(0, Math.min(1, splitPos / 100))
    );
    gl.uniform1f(gl.getUniformLocation(program, "uHold"), 0.0);
    const uLogInput = gl.getUniformLocation(program, "uLogInput");
    if (uLogInput !== null) {
      gl.uniform1f(uLogInput, getLogProfileCode(simulateLogInput));
    }
    const uMonitorMode = gl.getUniformLocation(program, "uMonitorMode");
    if (uMonitorMode !== null) {
      gl.uniform1f(uMonitorMode, 0.0);
    }

    const safe = sanitizeParams(params);
    for (const [key, uniform] of UNIFORM_MAP) {
      const loc = gl.getUniformLocation(program, uniform);
      if (loc !== null) {
        gl.uniform1f(loc, safe[key] ?? DEFAULT_PARAMS[key] ?? 0);
      }
    }
    bindHybridUniforms(gl, getHybridUniformLocations(gl, program), safe);
    const lutLoc = getLutUniformLocations(gl, program);
    const lutState = createLutGLState(gl);
    bindLutTextureAndUniforms(gl, lutLoc, lutState, activeLut, lutMix, 1);
    gl.viewport(0, 0, width, height);

    return {
      canvas: glCanvas,
      render(source) {
        gl.activeTexture(gl.TEXTURE0);
        gl.bindTexture(gl.TEXTURE_2D, texture);
        // bindLutTextureAndUniforms sets UNPACK_FLIP_Y_WEBGL=false when uploading a 32³ LUT;
        // restore true before uploading the source frame so PREVIEW_VERTEX stays upright.
        gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);
        gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false);
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, source);
        if (alpha) {
          gl.clearColor(0, 0, 0, 0);
          gl.clear(gl.COLOR_BUFFER_BIT);
        }
        gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
        gl.finish();
      },
      cleanup: () => {
        try {
          cleanupLutGLState(gl, lutState);
          if (texture) gl.deleteTexture(texture);
          if (buffer) gl.deleteBuffer(buffer);
          if (program) gl.deleteProgram(program);
          if (vs) gl.deleteShader(vs);
          if (fs) gl.deleteShader(fs);
          gl.getExtension("WEBGL_lose_context")?.loseContext();
        } catch {
          // ignore WebGL teardown errors
        }
      },
    };
  } catch {
    try {
      if (texture) gl.deleteTexture(texture);
      if (buffer) gl.deleteBuffer(buffer);
      if (program) gl.deleteProgram(program);
      if (vs) gl.deleteShader(vs);
      if (fs) gl.deleteShader(fs);
      gl.getExtension("WEBGL_lose_context")?.loseContext();
    } catch {
      // ignore
    }
    return null;
  }
}

function renderViaWebGL(
  source,
  width,
  height,
  params,
  layout,
  splitPos,
  simulateLogInput,
  activeLut = null,
  lutMix = 1.0
) {
  const grader = createWebGLFrameGrader({
    width,
    height,
    params,
    activeLut,
    lutMix,
    layout,
    splitPos,
    simulateLogInput,
    alpha: true,
  });
  if (!grader) return null;
  try {
    grader.render(source);
    return grader;
  } catch {
    grader.cleanup();
    return null;
  }
}

function renderViaCPU(source, width, height, params, layout, splitPos, simulateLogInput) {
  const outCanvas = document.createElement("canvas");
  outCanvas.width = width;
  outCanvas.height = height;
  const ctx = outCanvas.getContext("2d");
  ctx.drawImage(source, 0, 0, width, height);
  const srcData = ctx.getImageData(0, 0, width, height);
  const gradedBuf = new Uint8ClampedArray(srcData.data.length);
  simulateGradePixels(srcData.data, gradedBuf, params, simulateLogInput);

  if (layout === "split") {
    const splitX = Math.round((Math.max(0, Math.min(100, splitPos)) / 100) * width);
    for (let y = 0; y < height; y++) {
      const rowStart = y * width * 4;
      for (let x = 0; x < splitX; x++) {
        const idx = rowStart + x * 4;
        gradedBuf[idx] = srcData.data[idx];
        gradedBuf[idx + 1] = srcData.data[idx + 1];
        gradedBuf[idx + 2] = srcData.data[idx + 2];
        gradedBuf[idx + 3] = srcData.data[idx + 3];
      }
    }
  }

  ctx.putImageData(new ImageData(gradedBuf, width, height), 0, 0);
  return outCanvas;
}

const FONT_SANS =
  'Inter, -apple-system, BlinkMacSystemFont, "SF Pro Display", system-ui, sans-serif';
const FONT_MONO =
  '"JetBrains Mono", ui-monospace, SFMono-Regular, Menlo, Consolas, monospace';

const REC709_COLORIMETER_8STEP = [
  "#1E212B", // 0 IRE Obsidian
  "#C44E58", // Rec.709 Red
  "#C4A854", // Rec.709 Yellow
  "#4FA377", // Rec.709 Green
  "#4F96AA", // Rec.709 Cyan
  "#5476B4", // Rec.709 Blue
  "#9E6091", // Rec.709 Magenta
  "#E6E9F0", // 100 IRE D65 White
];

function getEngineTelemetrySpec(engineId) {
  const resolved = resolveEngineId(engineId);
  if (resolved === "v3") {
    return {
      tierLabel: "POLARIS 3.5 ANIME",
      pipelineTag: "OKLAB PRO",
    };
  }
  if (resolved === "altair") {
    return {
      tierLabel: "ALTAIR 4.0 CREATIVE",
      pipelineTag: "3D OKLAB",
    };
  }
  return {
    tierLabel: "ALTAIR 4.5 REFRESH",
    pipelineTag: "3D OKLAB · 32³ LUT",
  };
}

function drawRoundedRectPath(ctx, x, y, w, h, r) {
  const rad = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + rad, y);
  ctx.lineTo(x + w - rad, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + rad);
  ctx.lineTo(x + w, y + h - rad);
  ctx.quadraticCurveTo(x + w, y + h, x + w - rad, y + h);
  ctx.lineTo(x + rad, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - rad);
  ctx.lineTo(x, y + rad);
  ctx.quadraticCurveTo(x, y, x + rad, y);
  ctx.closePath();
}

function measureTrackedText(ctx, text, tracking = 0) {
  if (!text) return 0;
  let width = 0;
  for (let i = 0; i < text.length; i += 1) {
    width += ctx.measureText(text[i]).width;
    if (i < text.length - 1) width += tracking;
  }
  return width;
}

function drawTrackedText(ctx, text, x, y, tracking = 0) {
  let cursorX = x;
  for (let i = 0; i < text.length; i += 1) {
    const ch = text[i];
    ctx.fillText(ch, cursorX, y);
    cursorX += ctx.measureText(ch).width + tracking;
  }
}

function truncateTrackedTextWithEllipsis(ctx, text, maxWidth, tracking = 0) {
  if (measureTrackedText(ctx, text, tracking) <= maxWidth) return text;
  const ellipsis = "…";
  const ellipsisW = measureTrackedText(ctx, ellipsis, tracking);
  if (maxWidth <= ellipsisW) return ellipsis;
  let lo = 0;
  let hi = text.length;
  while (lo < hi) {
    const mid = Math.ceil((lo + hi) / 2);
    const candidate = text.slice(0, mid);
    if (measureTrackedText(ctx, candidate, tracking) + ellipsisW <= maxWidth) {
      lo = mid;
    } else {
      hi = mid - 1;
    }
  }
  return `${text.slice(0, lo).trimEnd()}${ellipsis}`;
}

function drawViewfinderRegistrationMarks(ctx, cardW, cardH, inset, armLen) {
  const x0 = Math.floor(inset) + 0.5;
  const y0 = Math.floor(inset) + 0.5;
  const x1 = Math.floor(cardW - inset) - 0.5;
  const y1 = Math.floor(cardH - inset) - 0.5;

  ctx.save();
  ctx.strokeStyle = "rgba(255, 255, 255, 0.28)";
  ctx.lineWidth = 1;
  ctx.lineCap = "square";
  ctx.lineJoin = "miter";
  ctx.shadowColor = "rgba(0, 0, 0, 0.42)";
  ctx.shadowBlur = 3;

  // Top-Left L-bracket
  ctx.beginPath();
  ctx.moveTo(x0, y0 + armLen);
  ctx.lineTo(x0, y0);
  ctx.lineTo(x0 + armLen, y0);
  ctx.stroke();

  // Top-Right L-bracket
  ctx.beginPath();
  ctx.moveTo(x1 - armLen, y0);
  ctx.lineTo(x1, y0);
  ctx.lineTo(x1, y0 + armLen);
  ctx.stroke();

  // Bottom-Left L-bracket
  ctx.beginPath();
  ctx.moveTo(x0, y1 - armLen);
  ctx.lineTo(x0, y1);
  ctx.lineTo(x0 + armLen, y1);
  ctx.stroke();

  // Bottom-Right L-bracket
  ctx.beginPath();
  ctx.moveTo(x1 - armLen, y1);
  ctx.lineTo(x1, y1);
  ctx.lineTo(x1, y1 - armLen);
  ctx.stroke();
  ctx.restore();
}

function createPaddedBlurSource(bgCanvas, pad = 48) {
  const w = bgCanvas.width;
  const h = bgCanvas.height;
  const padded = document.createElement("canvas");
  padded.width = w + pad * 2;
  padded.height = h + pad * 2;
  const pCtx = padded.getContext("2d");

  // Center image
  pCtx.drawImage(bgCanvas, pad, pad);
  // Clamp-extend 1px border strips outward so blur(22px) never pulls transparent edge pixels
  pCtx.drawImage(bgCanvas, 0, 0, w, 1, pad, 0, w, pad);
  pCtx.drawImage(bgCanvas, 0, h - 1, w, 1, pad, pad + h, w, pad);
  pCtx.drawImage(bgCanvas, 0, 0, 1, h, 0, pad, pad, h);
  pCtx.drawImage(bgCanvas, w - 1, 0, 1, h, pad + w, pad, pad, h);
  // Corners
  pCtx.drawImage(bgCanvas, 0, 0, 1, 1, 0, 0, pad, pad);
  pCtx.drawImage(bgCanvas, w - 1, 0, 1, 1, pad + w, 0, pad, pad);
  pCtx.drawImage(bgCanvas, 0, h - 1, 1, 1, 0, pad + h, pad, pad);
  pCtx.drawImage(bgCanvas, w - 1, h - 1, 1, 1, pad + w, pad + h, pad, pad);

  return { canvas: padded, pad };
}

function drawFrostedGlassCard(ctx, blurSource, x, y, w, h, radius = 14, options = {}) {
  const {
    blurPx = 22,
    tint = "rgba(9, 10, 13, 0.64)",
    borderColor = "rgba(255, 255, 255, 0.16)",
    topRimColor = "rgba(255, 255, 255, 0.22)",
    shadowBlur = 24,
    shadowOffsetY = 8,
    shadowColor = "rgba(0, 0, 0, 0.44)",
  } = options;

  const srcCanvas = blurSource?.canvas || blurSource;
  const pad = blurSource?.pad || 0;

  // 1. Subtle elevation shadow so floating HUD modules lift cleanly off any frame
  ctx.save();
  ctx.shadowColor = shadowColor;
  ctx.shadowBlur = shadowBlur;
  ctx.shadowOffsetY = shadowOffsetY;
  drawRoundedRectPath(ctx, x, y, w, h, radius);
  ctx.fillStyle = "rgba(0, 0, 0, 0.01)";
  ctx.fill();
  ctx.restore();

  // 2. Real optical backdrop blur clipped to the rounded card + smoked obsidian tint + top specular rim
  ctx.save();
  drawRoundedRectPath(ctx, x, y, w, h, radius);
  ctx.clip();

  ctx.filter = `blur(${blurPx}px)`;
  ctx.drawImage(srcCanvas, -pad, -pad);
  ctx.filter = "none";

  // Rich smoked-obsidian glass tint
  ctx.fillStyle = tint;
  ctx.fillRect(x, y, w, h);

  // Crisp 1px top specular rim highlight (feathered gracefully into rounded corners)
  if (topRimColor && w > radius * 2) {
    const rimStart = x + Math.max(4, radius * 0.55);
    const rimEnd = x + w - Math.max(4, radius * 0.55);
    const rimGrad = ctx.createLinearGradient(rimStart, y, rimEnd, y);
    rimGrad.addColorStop(0, "rgba(255, 255, 255, 0.02)");
    rimGrad.addColorStop(0.12, topRimColor);
    rimGrad.addColorStop(0.88, topRimColor);
    rimGrad.addColorStop(1, "rgba(255, 255, 255, 0.02)");
    ctx.strokeStyle = rimGrad;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(rimStart, y + 1.5);
    ctx.lineTo(rimEnd, y + 1.5);
    ctx.stroke();
  }
  ctx.restore();

  // 3. Crisp 1px outer glass border
  ctx.save();
  drawRoundedRectPath(ctx, x + 0.5, y + 0.5, w - 1, h - 1, Math.max(0, radius - 0.5));
  ctx.strokeStyle = borderColor;
  ctx.lineWidth = 1;
  ctx.stroke();
  ctx.restore();
}

function drawSplitWiper(ctx, blurSource, splitX, cardW, cardH, isWide) {
  const lineX = Math.floor(splitX) + 0.5;

  // Crisp 1.5px center split hairline
  ctx.save();
  ctx.shadowColor = "rgba(0, 0, 0, 0.42)";
  ctx.shadowBlur = 5;
  ctx.strokeStyle = "rgba(255, 255, 255, 0.68)";
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.moveTo(lineX, 0);
  ctx.lineTo(lineX, cardH);
  ctx.stroke();
  ctx.restore();

  // Minimal frosted glass wiper handle at true vertical midpoint
  const gripW = isWide ? 14 : 12;
  const gripH = isWide ? 48 : 40;
  const gripRad = gripW / 2;
  const gripX = Math.max(4, Math.min(cardW - gripW - 4, Math.round(splitX - gripW / 2)));
  const gripY = Math.round(cardH * 0.5 - gripH / 2);

  drawFrostedGlassCard(ctx, blurSource, gripX, gripY, gripW, gripH, gripRad, {
    blurPx: 14,
    tint: "rgba(9, 10, 13, 0.64)",
    borderColor: "rgba(255, 255, 255, 0.36)",
    topRimColor: null,
    shadowBlur: 12,
    shadowOffsetY: 2,
  });

  // Precision centered brushed-silver vertical indicator bar
  ctx.save();
  const ridgeW = 1.5;
  const ridgeH = Math.round(gripH * 0.44);
  const ridgeX = gripX + (gripW - ridgeW) / 2;
  const ridgeY = gripY + (gripH - ridgeH) / 2;
  drawRoundedRectPath(ctx, ridgeX, ridgeY, ridgeW, ridgeH, 0.75);
  ctx.fillStyle = "rgba(255, 255, 255, 0.88)";
  ctx.fill();
  ctx.restore();
}

function drawTelemetryGlassBadge(
  ctx,
  blurSource,
  { x, y, alignRight = false, segments, showEmeraldDot = false, isWide = true }
) {
  const fontSize = isWide ? 12.5 : 11;
  const tracking = isWide ? 1.25 : 0.95;
  const padX = isWide ? 15 : 12;
  const pillH = isWide ? 32 : 28;
  const dotRadius = isWide ? 3.1 : 2.7;
  const dotSpace = showEmeraldDot ? (isWide ? 14 : 12) : 0;

  ctx.save();
  ctx.font = `600 ${fontSize}px ${FONT_MONO}`;
  let contentW = 0;
  segments.forEach((seg, idx) => {
    contentW += measureTrackedText(ctx, seg.text, tracking);
    if (idx < segments.length - 1) contentW += tracking;
  });
  ctx.restore();

  const pillW = Math.round(contentW + padX * 2 + dotSpace);
  const px = alignRight ? Math.round(x - pillW) : Math.round(x);
  const py = Math.round(y);
  const rad = pillH / 2;

  drawFrostedGlassCard(ctx, blurSource, px, py, pillW, pillH, rad, {
    blurPx: 18,
    tint: "rgba(9, 10, 13, 0.62)",
    borderColor: "rgba(255, 255, 255, 0.16)",
    topRimColor: "rgba(255, 255, 255, 0.22)",
    shadowBlur: 14,
    shadowOffsetY: 3,
    shadowColor: "rgba(0, 0, 0, 0.36)",
  });

  ctx.save();
  let cursorX = px + padX;
  const centerY = py + pillH / 2;

  if (showEmeraldDot) {
    ctx.save();
    ctx.shadowColor = "rgba(52, 211, 153, 0.70)";
    ctx.shadowBlur = 7;
    ctx.beginPath();
    ctx.arc(cursorX + dotRadius, centerY, dotRadius, 0, Math.PI * 2);
    ctx.fillStyle = "#34D399";
    ctx.fill();
    ctx.restore();
    cursorX += dotSpace;
  }

  ctx.font = `600 ${fontSize}px ${FONT_MONO}`;
  ctx.textBaseline = "middle";
  segments.forEach((seg) => {
    ctx.fillStyle = seg.color;
    drawTrackedText(ctx, seg.text, cursorX, centerY + 0.5, tracking);
    cursorX += measureTrackedText(ctx, seg.text, tracking) + tracking;
  });
  ctx.restore();

  return { x: px, y: py, w: pillW, h: pillH };
}

function drawColorimeterStrip(ctx, x, y, stripW, stripH = 6) {
  const stepCount = REC709_COLORIMETER_8STEP.length;
  const gap = 3;
  const chipW = (stripW - gap * (stepCount - 1)) / stepCount;
  const chipRad = 2; // rounded-sm

  ctx.save();
  REC709_COLORIMETER_8STEP.forEach((hex, idx) => {
    const cx = x + idx * (chipW + gap);
    drawRoundedRectPath(ctx, cx, y, chipW, stripH, chipRad);
    ctx.fillStyle = hex;
    ctx.fill();

    // Subtle crisp hairline so dark obsidian chip reads cleanly on smoked glass
    drawRoundedRectPath(ctx, cx + 0.5, y + 0.5, Math.max(1, chipW - 1), Math.max(1, stripH - 1), Math.max(0.5, chipRad - 0.5));
    ctx.strokeStyle = "rgba(255, 255, 255, 0.14)";
    ctx.lineWidth = 0.75;
    ctx.stroke();
  });
  ctx.restore();
}

function drawKeyflowPrismMark(ctx, x, y, size) {
  ctx.save();
  // Recessed obsidian squircle
  drawRoundedRectPath(ctx, x, y, size, size, Math.round(size * 0.24));
  ctx.fillStyle = "rgba(255, 255, 255, 0.06)";
  ctx.fill();
  ctx.strokeStyle = "rgba(255, 255, 255, 0.18)";
  ctx.lineWidth = 1;
  ctx.stroke();

  // Precision optical prism triangle matching Keyflow emblem
  const cx = x + size * 0.5;
  const topY = y + size * 0.2;
  const botY = y + size * 0.78;
  const halfBase = size * 0.31;

  ctx.beginPath();
  ctx.moveTo(cx, topY);
  ctx.lineTo(cx + halfBase, botY);
  ctx.lineTo(cx - halfBase, botY);
  ctx.closePath();
  ctx.fillStyle = "rgba(255, 255, 255, 0.09)";
  ctx.fill();
  ctx.strokeStyle = "rgba(244, 244, 245, 0.88)";
  ctx.lineWidth = 1.25;
  ctx.lineJoin = "round";
  ctx.stroke();

  // Internal refractive axis
  ctx.beginPath();
  ctx.moveTo(cx, topY + 1);
  ctx.lineTo(cx, botY);
  ctx.strokeStyle = "rgba(255, 255, 255, 0.32)";
  ctx.lineWidth = 1;
  ctx.stroke();

  // Emerald dispersed caustic ray
  ctx.beginPath();
  ctx.moveTo(cx - halfBase * 0.62, y + size * 0.54);
  ctx.lineTo(cx, y + size * 0.45);
  ctx.lineTo(cx + halfBase * 0.68, y + size * 0.56);
  ctx.strokeStyle = "rgba(110, 231, 183, 0.92)";
  ctx.lineWidth = 1.2;
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  ctx.stroke();
  ctx.restore();
}

function drawSwatchChips(ctx, swatches, { x, y, chipW, chipH, chipGap, hexFontSize, hexGap }) {
  const chipRadius = 6; // rounded-md
  swatches.forEach((hex, idx) => {
    const sx = Math.round(x + idx * (chipW + chipGap));
    const sy = Math.round(y);

    // Subtle chip elevation
    ctx.save();
    ctx.shadowColor = "rgba(0, 0, 0, 0.30)";
    ctx.shadowBlur = 8;
    ctx.shadowOffsetY = 2;
    drawRoundedRectPath(ctx, sx, sy, chipW, chipH, chipRadius);
    ctx.fillStyle = hex;
    ctx.fill();
    ctx.restore();

    // Restrained top bevel sheen
    ctx.save();
    drawRoundedRectPath(ctx, sx, sy, chipW, chipH, chipRadius);
    ctx.clip();
    const topSheen = ctx.createLinearGradient(sx, sy, sx, sy + Math.round(chipH * 0.24));
    topSheen.addColorStop(0, "rgba(255, 255, 255, 0.14)");
    topSheen.addColorStop(1, "rgba(255, 255, 255, 0)");
    ctx.fillStyle = topSheen;
    ctx.fillRect(sx, sy, chipW, Math.round(chipH * 0.24));
    ctx.restore();

    // Crisp 1px inner border rgba(255, 255, 255, 0.20)
    ctx.save();
    drawRoundedRectPath(ctx, sx + 0.5, sy + 0.5, chipW - 1, chipH - 1, chipRadius - 0.5);
    ctx.strokeStyle = "rgba(255, 255, 255, 0.20)";
    ctx.lineWidth = 1;
    ctx.stroke();
    ctx.restore();

    // Crisp, legible 10px–11px monospace HEX code centered directly underneath
    ctx.save();
    ctx.font = `600 ${hexFontSize}px ${FONT_MONO}`;
    ctx.fillStyle = "#E4E4E7";
    ctx.textBaseline = "top";
    const hexW = ctx.measureText(hex).width;
    ctx.fillText(hex, Math.round(sx + (chipW - hexW) / 2), sy + chipH + hexGap);
    ctx.restore();
  });
}

function drawQrContainer(
  ctx,
  qrMatrix,
  { x, y, size, caption, captionFontSize, captionGap, captionTracking = 1.0 }
) {
  const rx = Math.round(x);
  const ry = Math.round(y);
  const plateRad = 6; // rounded-md

  ctx.save();
  ctx.shadowColor = "rgba(0, 0, 0, 0.34)";
  ctx.shadowBlur = 12;
  ctx.shadowOffsetY = 3;
  drawRoundedRectPath(ctx, rx, ry, size, size, plateRad);
  ctx.fillStyle = "#FFFFFF";
  ctx.fill();
  ctx.restore();

  // Crisp QR modules with guaranteed scannable quiet zone at any hash length
  const moduleCount = qrMatrix.length;
  const quietPad = Math.max(6, Math.round(size * 0.08));
  const matrixBox = Math.max(24, size - quietPad * 2);
  const intCell = Math.floor(matrixBox / moduleCount);
  const cellSize = intCell >= 2 ? intCell : matrixBox / moduleCount;
  const actualMatrixPx = cellSize * moduleCount;
  const offsetX = rx + (size - actualMatrixPx) / 2;
  const offsetY = ry + (size - actualMatrixPx) / 2;

  ctx.save();
  ctx.imageSmoothingEnabled = false;
  ctx.fillStyle = "#090A0D";
  for (let r = 0; r < moduleCount; r += 1) {
    const y0 = Math.round(offsetY + r * cellSize);
    const y1 = Math.round(offsetY + (r + 1) * cellSize);
    for (let c = 0; c < moduleCount; c += 1) {
      if (qrMatrix[r][c]) {
        const x0 = Math.round(offsetX + c * cellSize);
        const x1 = Math.round(offsetX + (c + 1) * cellSize);
        ctx.fillRect(x0, y0, Math.max(1, x1 - x0), Math.max(1, y1 - y0));
      }
    }
  }
  ctx.restore();

  // Clean 10px monospace caption underneath ("SCAN GRADE" or "SCAN LINK")
  ctx.save();
  ctx.font = `600 ${captionFontSize}px ${FONT_MONO}`;
  ctx.fillStyle = "rgba(228, 228, 231, 0.90)";
  ctx.textBaseline = "top";
  const labelW = measureTrackedText(ctx, caption, captionTracking);
  drawTrackedText(
    ctx,
    caption,
    Math.round(rx + (size - labelW) / 2),
    ry + size + captionGap,
    captionTracking
  );
  ctx.restore();
}

function measureTelemetryRowWidth(ctx, segments, fontSize, tracking = 0.65, dotSpace = 13) {
  ctx.save();
  ctx.font = `600 ${fontSize}px ${FONT_MONO}`;
  let totalW = dotSpace;
  segments.forEach((seg, idx) => {
    totalW += measureTrackedText(ctx, seg.text, tracking);
    if (idx < segments.length - 1) totalW += tracking;
  });
  ctx.restore();
  return totalW;
}

function drawTelemetryRowWithDot(ctx, segments, x, y, fontSize, tracking = 0.65, dotRadius = 3) {
  const dotSpace = dotRadius * 2 + 7;
  const centerY = y + fontSize * 0.52;

  ctx.save();
  // Active solver emerald dot
  ctx.save();
  ctx.shadowColor = "rgba(52, 211, 153, 0.72)";
  ctx.shadowBlur = 7;
  ctx.beginPath();
  ctx.arc(x + dotRadius, centerY, dotRadius, 0, Math.PI * 2);
  ctx.fillStyle = "#34D399";
  ctx.fill();
  ctx.restore();

  ctx.font = `600 ${fontSize}px ${FONT_MONO}`;
  ctx.textBaseline = "top";
  let cursorX = x + dotSpace;
  segments.forEach((seg) => {
    ctx.fillStyle = seg.color;
    drawTrackedText(ctx, seg.text, cursorX, y, tracking);
    cursorX += measureTrackedText(ctx, seg.text, tracking) + tracking;
  });
  ctx.restore();
}

function drawStudioSignatureBlock(
  ctx,
  { centerX, innerTop, innerH, prismSize, brandFontSize, subFontSize, brandTracking, subTracking }
) {
  const gap1 = Math.round(prismSize * 0.3);
  const gap2 = 5;
  const totalH = prismSize + gap1 + brandFontSize + gap2 + subFontSize;
  const startY = Math.round(innerTop + (innerH - totalH) / 2);

  drawKeyflowPrismMark(ctx, Math.round(centerX - prismSize / 2), startY, prismSize);

  ctx.save();
  ctx.textBaseline = "top";

  ctx.font = `700 ${brandFontSize}px ${FONT_SANS}`;
  ctx.fillStyle = "#F8FAFC";
  const line1 = "KEYFLOW";
  const l1W = measureTrackedText(ctx, line1, brandTracking);
  drawTrackedText(ctx, line1, Math.round(centerX - l1W / 2), startY + prismSize + gap1, brandTracking);

  ctx.font = `600 ${subFontSize}px ${FONT_MONO}`;
  ctx.fillStyle = "#A1A1AA";
  const line2 = "COLOR MATCH";
  const l2W = measureTrackedText(ctx, line2, subTracking);
  drawTrackedText(
    ctx,
    line2,
    Math.round(centerX - l2W / 2),
    startY + prismSize + gap1 + brandFontSize + gap2,
    subTracking
  );
  ctx.restore();
}

function cleanPromoTitle(presetTitle) {
  const raw = String(presetTitle || "").trim();
  if (!raw || /^[0-9a-f]{8}-[0-9a-f]{4}-/i.test(raw)) {
    return "Custom Color Grade";
  }
  return raw;
}

function resolvePromoQrUrl({ includeQr, qrMode, qrUrl, engineId, simulateLogInput, params }) {
  if (!includeQr) return "";
  const trimmed = String(qrUrl || "").trim();
  if (qrMode === "custom") {
    if (!trimmed) return "";
    if (/^https?:\/\//i.test(trimmed)) return trimmed;
    if (/^[a-z0-9.-]+\.[a-z]{2,}(\/.*)?$/i.test(trimmed)) return `https://${trimmed}`;
    return "";
  }
  if (trimmed && trimmed.includes("#g=")) {
    return trimmed;
  }
  const hash = encodeGradeToHash({
    engineId,
    logProfile: simulateLogInput,
    matchStrength: 100,
    params,
  });
  const base =
    typeof window !== "undefined" && window.location
      ? `${window.location.origin}${window.location.pathname}`
      : "https://keyflow.app/";
  return `${base}${hash}`;
}

export function renderPromoCardCanvas({
  source,
  width,
  height,
  params,
  splitPos = 50,
  simulateLogInput = "rec709",
  presetTitle = "Custom Color Grade",
  engineId = DEFAULT_ENGINE_ID,
  aspectRatio = "16:9",
  includeQr = true,
  qrMode = "grade",
  qrUrl = "",
  activeLut = null,
  lutMix = 1.0,
}) {
  const dims =
    aspectRatio === "4:5"
      ? { w: 1080, h: 1350 }
      : aspectRatio === "1:1"
      ? { w: 1080, h: 1080 }
      : aspectRatio === "9:16"
      ? { w: 1080, h: 1920 }
      : { w: 1920, h: 1080 };

  const cardW = dims.w;
  const cardH = dims.h;
  const isWide = cardW >= 1400; // 16:9 wide slate vs compact 1080px-wide (1:1, 4:5, 9:16)
  const isSquare = aspectRatio === "1:1";

  // Render clean offscreen before and graded frames at capped source resolution
  const maxSrcEdge = Math.max(width, height);
  const srcScale = maxSrcEdge > 1920 ? 1920 / maxSrcEdge : 1;
  const rw = Math.max(2, Math.round(width * srcScale));
  const rh = Math.max(2, Math.round(height * srcScale));

  const beforeCanvas = document.createElement("canvas");
  beforeCanvas.width = rw;
  beforeCanvas.height = rh;
  const bCtx = beforeCanvas.getContext("2d");

  const webglBefore = renderViaWebGL(source, rw, rh, params, "split", 100, simulateLogInput);
  if (webglBefore) {
    try {
      bCtx.drawImage(webglBefore.canvas, 0, 0, rw, rh);
    } finally {
      webglBefore.cleanup();
    }
  } else {
    bCtx.drawImage(source, 0, 0, rw, rh);
  }

  const gradedCanvas = document.createElement("canvas");
  gradedCanvas.width = rw;
  gradedCanvas.height = rh;
  const gCtx = gradedCanvas.getContext("2d");

  const webglGraded = renderViaWebGL(
    source,
    rw,
    rh,
    params,
    "graded",
    50,
    simulateLogInput,
    activeLut,
    lutMix
  );
  if (webglGraded) {
    try {
      gCtx.drawImage(webglGraded.canvas, 0, 0, rw, rh);
    } finally {
      webglGraded.cleanup();
    }
  } else {
    gCtx.drawImage(renderViaCPU(source, rw, rh, params, "graded", 50, simulateLogInput), 0, 0, rw, rh);
  }

  const swatches = extractPaletteSwatches(gradedCanvas, 5);
  const logLabel = getLogProfile(simulateLogInput).shortLabel.toUpperCase();
  const { tierLabel, pipelineTag } = getEngineTelemetrySpec(engineId);

  // Full-bleed background composite canvas using object-fit: cover aspect-fill math
  const bgCanvas = document.createElement("canvas");
  bgCanvas.width = cardW;
  bgCanvas.height = cardH;
  const bgCtx = bgCanvas.getContext("2d");
  bgCtx.fillStyle = "#08090C";
  bgCtx.fillRect(0, 0, cardW, cardH);

  const coverScale = Math.max(cardW / rw, cardH / rh);
  const dw = rw * coverScale;
  const dh = rh * coverScale;
  const dx = (cardW - dw) / 2;
  const dy = (cardH - dh) / 2;
  const splitX = Math.round((Math.max(0, Math.min(100, splitPos)) / 100) * cardW);

  // Left half: clean beforeSource
  bgCtx.save();
  bgCtx.beginPath();
  bgCtx.rect(0, 0, splitX, cardH);
  bgCtx.clip();
  bgCtx.drawImage(beforeCanvas, dx, dy, dw, dh);
  bgCtx.restore();

  // Right half: clean gradedSource
  bgCtx.save();
  bgCtx.beginPath();
  bgCtx.rect(splitX, 0, cardW - splitX, cardH);
  bgCtx.clip();
  bgCtx.drawImage(gradedCanvas, dx, dy, dw, dh);
  bgCtx.restore();

  // Edge-clamped blur source prevents dark vignette bleed near canvas boundaries
  const blurSource = createPaddedBlurSource(bgCanvas, 48);

  const out = document.createElement("canvas");
  out.width = cardW;
  out.height = cardH;
  const ctx = out.getContext("2d");

  // 1. Edge-to-edge full-bleed Before/Graded composite
  ctx.drawImage(bgCanvas, 0, 0);

  const effectiveQrUrl = resolvePromoQrUrl({
    includeQr,
    qrMode,
    qrUrl,
    engineId,
    simulateLogInput,
    params,
  });
  const qrMatrix = effectiveQrUrl ? generateQrMatrix(effectiveQrUrl) : null;
  const hasValidQr = Boolean(qrMatrix && qrMatrix.length > 0);
  const qrCaption = qrMode === "custom" ? "SCAN LINK" : "SCAN GRADE";

  // Responsive Viewfinder & Dual HUD Module geometry
  const vfInset = isWide ? 22 : 16;
  const vfArmLen = isWide ? 24 : 20;
  const marginX = isWide ? 40 : 28;
  const marginBottom = isWide ? 38 : aspectRatio === "9:16" ? 36 : 28;
  const topBadgeY = isWide ? 38 : 28;
  const cardRadius = isWide ? 14 : 12; // rounded-xl

  // 2. Cinema Viewfinder L-bracket registration marks at 4 outer corners
  drawViewfinderRegistrationMarks(ctx, cardW, cardH, vfInset, vfArmLen);

  // 3. Crisp 1.5px center split hairline + minimal frosted glass wiper handle
  drawSplitWiper(ctx, blurSource, splitX, cardW, cardH, isWide);

  // 4. Frosted-Glass Top-Left & Top-Right Viewfinder Pills
  drawTelemetryGlassBadge(ctx, blurSource, {
    x: marginX,
    y: topBadgeY,
    alignRight: false,
    showEmeraldDot: false,
    isWide,
    segments: [
      { text: "BEFORE", color: "#F4F4F5" },
      { text: " · ", color: "rgba(255, 255, 255, 0.36)" },
      { text: "SOURCE", color: "#A1A1AA" },
    ],
  });

  drawTelemetryGlassBadge(ctx, blurSource, {
    x: cardW - marginX,
    y: topBadgeY,
    alignRight: true,
    showEmeraldDot: true,
    isWide,
    segments: [
      { text: "GRADED", color: "#F4F4F5" },
      { text: " · ", color: "rgba(255, 255, 255, 0.36)" },
      { text: tierLabel, color: "#D4D4D8" },
    ],
  });

  // 5. Measure Bottom-Right Card (Compact 5-Swatch Palette + Vertical Divider + QR / Studio Mark)
  const rightPadX = isWide ? 18 : 14;
  const rightPadY = isWide ? 15 : 13;
  const chipW = isWide ? 58 : 48;
  const chipH = isWide ? 82 : 74;
  const chipGap = isWide ? 10 : 8;
  const hexFontSize = isWide ? 11 : 10;
  const hexGap = isWide ? 8 : 7;
  const swatchesTotalW = swatches.length * chipW + (swatches.length - 1) * chipGap;
  const rightInnerH = chipH + hexGap + hexFontSize;

  const divGap = isWide ? 18 : 13;
  const qrCaptionFont = 10;
  const qrCaptionGap = isWide ? 6 : 5;
  const qrSize = rightInnerH - qrCaptionGap - qrCaptionFont; // 87px on 16:9, 76px on 1080px
  const qrCaptionTracking = isWide ? 1.0 : 0.6;

  // Measure QR-OFF signature section width so both states stay optically balanced
  const brandFontSize = isWide ? 12.5 : 11.5;
  const brandTracking = isWide ? 2.0 : 1.6;
  const subFontSize = 10;
  const subTracking = isWide ? 1.1 : 0.7;
  ctx.save();
  ctx.font = `700 ${brandFontSize}px ${FONT_SANS}`;
  const brandLineW = measureTrackedText(ctx, "KEYFLOW", brandTracking);
  ctx.font = `600 ${subFontSize}px ${FONT_MONO}`;
  const subLineW = measureTrackedText(ctx, "COLOR MATCH", subTracking);
  ctx.restore();
  const brandSectionW = Math.max(qrSize, Math.ceil(Math.max(brandLineW, subLineW)) + 8);
  const rightEndSectionW = hasValidQr ? qrSize : brandSectionW;

  const rightCardW = Math.round(rightPadX * 2 + swatchesTotalW + divGap * 2 + 1 + rightEndSectionW);
  const rightCardH = Math.round(rightPadY * 2 + rightInnerH);

  // 6. Measure Bottom-Left Card (Compact Look Identity & 8-Step Colorimeter — Auto-Sized)
  const cleanTitle = cleanPromoTitle(presetTitle);
  const titleFontSize = isWide ? 25 : isSquare ? 21 : 22;
  const titleTracking = isWide ? -0.4 : -0.35;
  const telemetryFontSize = isWide ? 11.5 : 11;
  const telemetryTracking = isWide ? 0.65 : 0.38;
  const telemetryDotRadius = isWide ? 3.1 : 2.8;
  const telemetryDotSpace = telemetryDotRadius * 2 + 7;

  const telemetrySegments = [
    { text: tierLabel, color: "#F4F4F5" },
    { text: "  ·  ", color: "rgba(255, 255, 255, 0.36)" },
    { text: pipelineTag, color: "#D4D4D8" },
    { text: "  ·  ", color: "rgba(255, 255, 255, 0.36)" },
    { text: logLabel, color: "#A1A1AA" },
  ];

  const leftPadX = isWide ? 22 : 18;
  const leftPadY = isWide ? 17 : 14;
  const titleToTelemetryGap = isWide ? 9 : 8;
  const telemetryToStripGap = isWide ? 15 : 13;
  const stripH = 6;

  ctx.save();
  ctx.font = `600 ${titleFontSize}px ${FONT_SANS}`;
  const rawTitleW = measureTrackedText(ctx, cleanTitle, titleTracking);
  ctx.restore();
  const rawTelemetryW = measureTelemetryRowWidth(
    ctx,
    telemetrySegments,
    telemetryFontSize,
    telemetryTracking,
    telemetryDotSpace
  );

  const usableW = cardW - marginX * 2;
  const minCenterGap = isWide ? 120 : 40;
  const maxSideBySideLeftW = usableW - rightCardW - minCenterGap;
  const minLeftInnerW = Math.max(Math.ceil(rawTelemetryW), isWide ? 300 : 250);
  const desiredLeftW = Math.ceil(Math.max(rawTitleW, minLeftInnerW) + leftPadX * 2);

  // Gracefully stack only if side-by-side cards cannot maintain clean separation
  const minRequiredLeftW = Math.ceil(rawTelemetryW + leftPadX * 2);
  const shouldStack = maxSideBySideLeftW < minRequiredLeftW;

  const leftCardW = shouldStack
    ? Math.min(usableW, desiredLeftW)
    : Math.min(isWide ? Math.min(680, maxSideBySideLeftW) : maxSideBySideLeftW, desiredLeftW);
  const leftCardH = Math.round(
    leftPadY * 2 + titleFontSize + titleToTelemetryGap + telemetryFontSize + telemetryToStripGap + stripH
  );

  // Compute final floating positions (bottom-center stays cleanly open!)
  const rightCardX = Math.round(cardW - marginX - rightCardW);
  const rightCardY = Math.round(cardH - marginBottom - rightCardH);
  const leftCardX = marginX;
  const leftCardY = shouldStack
    ? Math.round(rightCardY - 14 - leftCardH)
    : Math.round(cardH - marginBottom - leftCardH);

  // 7. Render Bottom-Left Frosted-Glass Module
  drawFrostedGlassCard(ctx, blurSource, leftCardX, leftCardY, leftCardW, leftCardH, cardRadius, {
    blurPx: 22,
    tint: "rgba(9, 10, 13, 0.64)",
    borderColor: "rgba(255, 255, 255, 0.16)",
    topRimColor: "rgba(255, 255, 255, 0.22)",
  });

  const leftInnerX = leftCardX + leftPadX;
  const leftInnerW = leftCardW - leftPadX * 2;
  const titleY = leftCardY + leftPadY;

  ctx.save();
  ctx.font = `600 ${titleFontSize}px ${FONT_SANS}`;
  ctx.fillStyle = "#F8FAFC";
  ctx.textBaseline = "top";
  const displayTitle = truncateTrackedTextWithEllipsis(ctx, cleanTitle, leftInnerW, titleTracking);
  drawTrackedText(ctx, displayTitle, leftInnerX, titleY, titleTracking);
  ctx.restore();

  const telemetryY = titleY + titleFontSize + titleToTelemetryGap;
  drawTelemetryRowWithDot(
    ctx,
    telemetrySegments,
    leftInnerX,
    telemetryY,
    telemetryFontSize,
    telemetryTracking,
    telemetryDotRadius
  );

  const colorimeterY = leftCardY + leftCardH - leftPadY - stripH;
  drawColorimeterStrip(ctx, leftInnerX, colorimeterY, leftInnerW, stripH);

  // 8. Render Bottom-Right Frosted-Glass Module
  drawFrostedGlassCard(ctx, blurSource, rightCardX, rightCardY, rightCardW, rightCardH, cardRadius, {
    blurPx: 22,
    tint: "rgba(9, 10, 13, 0.64)",
    borderColor: "rgba(255, 255, 255, 0.16)",
    topRimColor: "rgba(255, 255, 255, 0.22)",
  });

  const rightInnerTop = rightCardY + rightPadY;
  const rightInnerLeft = rightCardX + rightPadX;

  // 5 Dominant Vertical Color Swatches + crisp monospace HEX codes
  drawSwatchChips(ctx, swatches, {
    x: rightInnerLeft,
    y: rightInnerTop,
    chipW,
    chipH,
    chipGap,
    hexFontSize,
    hexGap,
  });

  // Clean 1px vertical glass divider
  const dividerX = Math.floor(rightInnerLeft + swatchesTotalW + divGap) + 0.5;
  ctx.save();
  ctx.strokeStyle = "rgba(255, 255, 255, 0.12)";
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(dividerX, rightInnerTop + 2);
  ctx.lineTo(dividerX, rightInnerTop + rightInnerH - 2);
  ctx.stroke();
  ctx.restore();

  // Right Signature / QR Section
  const rightSectionX = Math.round(dividerX + 0.5 + divGap);
  if (hasValidQr) {
    drawQrContainer(ctx, qrMatrix, {
      x: rightSectionX,
      y: rightInnerTop,
      size: qrSize,
      caption: qrCaption,
      captionFontSize: qrCaptionFont,
      captionGap: qrCaptionGap,
      captionTracking: qrCaptionTracking,
    });
  } else {
    drawStudioSignatureBlock(ctx, {
      centerX: rightSectionX + rightEndSectionW / 2,
      innerTop: rightInnerTop,
      innerH: rightInnerH,
      prismSize: isWide ? 38 : 34,
      brandFontSize,
      subFontSize,
      brandTracking,
      subTracking,
    });
  }

  return out;
}

export async function exportPromoCardBlob({
  source,
  width,
  height,
  params,
  splitPos = 50,
  simulateLogInput = "rec709",
  presetTitle = "Custom Color Grade",
  engineId = DEFAULT_ENGINE_ID,
  aspectRatio = "16:9",
  format = "png",
  quality = 95,
  includeQr = true,
  qrMode = "grade",
  qrUrl = "",
  activeLut = null,
  lutMix = 1.0,
}) {
  const cardCanvas = renderPromoCardCanvas({
    source,
    width,
    height,
    params,
    splitPos,
    simulateLogInput,
    presetTitle,
    engineId,
    aspectRatio,
    includeQr,
    qrMode,
    qrUrl,
    activeLut,
    lutMix,
  });

  const normalizedFormat = ["png", "jpg", "webp"].includes(format) ? format : "png";
  const mime =
    normalizedFormat === "jpg"
      ? "image/jpeg"
      : normalizedFormat === "webp"
      ? "image/webp"
      : "image/png";
  const qualityFloat = Math.max(0.1, Math.min(1.0, quality / 100));

  const blob = await new Promise((resolve, reject) => {
    cardCanvas.toBlob(
      (b) => (b ? resolve(b) : reject(new Error("Failed to encode promo card."))),
      mime,
      normalizedFormat === "png" ? undefined : qualityFloat
    );
  });

  return { blob, width: cardCanvas.width, height: cardCanvas.height, format: normalizedFormat };
}

export async function exportGradedImage({
  source,
  width,
  height,
  params,
  format = "png",
  quality = 95,
  layout = "graded",
  splitPos = 50,
  simulateLogInput = false,
  baseName = "Target",
  presetTitle = "Custom Color Grade",
  engineId = DEFAULT_ENGINE_ID,
  promoAspect = "16:9",
  includeQr = true,
  qrMode = "grade",
  qrUrl = "",
  activeLut = null,
  lutMix = 1.0,
}) {
  if (!source || !width || !height) {
    throw new Error("No valid source media to export.");
  }

  const normalizedFormat = ["png", "jpg", "webp"].includes(format)
    ? format
    : "png";
  const mime =
    normalizedFormat === "jpg"
      ? "image/jpeg"
      : normalizedFormat === "webp"
      ? "image/webp"
      : "image/png";
  const qualityFloat = Math.max(0.1, Math.min(1.0, quality / 100));

  let outCanvas;
  let outW = width;
  let outH = height;

  if (layout === "promo") {
    outCanvas = renderPromoCardCanvas({
      source,
      width,
      height,
      params,
      splitPos,
      simulateLogInput,
      presetTitle,
      engineId,
      aspectRatio: promoAspect,
      includeQr,
      qrMode,
      qrUrl,
      activeLut,
      lutMix,
    });
    outW = outCanvas.width;
    outH = outCanvas.height;
  } else {
    outCanvas = document.createElement("canvas");
    outCanvas.width = width;
    outCanvas.height = height;
    const outCtx = outCanvas.getContext("2d");

    const webglRes = renderViaWebGL(
      source,
      width,
      height,
      params,
      layout,
      splitPos,
      simulateLogInput,
      activeLut,
      lutMix
    );
    if (webglRes) {
      try {
        if (normalizedFormat === "jpg") {
          outCtx.fillStyle = "#000000";
          outCtx.fillRect(0, 0, width, height);
        }
        outCtx.drawImage(webglRes.canvas, 0, 0, width, height);
      } finally {
        webglRes.cleanup();
      }
    } else {
      const cpuCanvas = renderViaCPU(source, width, height, params, layout, splitPos, simulateLogInput);
      if (normalizedFormat === "jpg") {
        outCtx.fillStyle = "#000000";
        outCtx.fillRect(0, 0, width, height);
      }
      outCtx.drawImage(cpuCanvas, 0, 0, width, height);
    }

    // Draw crisp split divider line when exporting Before / After Split
    if (layout === "split") {
      const splitX = Math.round((Math.max(0, Math.min(100, splitPos)) / 100) * width);
      const lineW = Math.max(2, Math.round(width / 640));
      outCtx.fillStyle = "rgba(226, 228, 233, 0.92)";
      outCtx.fillRect(Math.max(0, splitX - Math.floor(lineW / 2)), 0, lineW, height);
    }
  }

  const blob = await new Promise((resolve, reject) => {
    outCanvas.toBlob(
      (b) => (b ? resolve(b) : reject(new Error("Failed to encode image."))),
      mime,
      normalizedFormat === "png" ? undefined : qualityFloat
    );
  });

  const rawBaseName = String(baseName || "Target").trim();
  const safeBaseName = /^[0-9a-f]{8}-[0-9a-f]{4}-/i.test(rawBaseName)
    ? "Custom-Color-Grade"
    : rawBaseName;
  const cleanBase =
    safeBaseName
      .replace(/[^a-zA-Z0-9._-]+/g, "-")
      .replace(/^-+|-+$/g, "") || "Target";
  const suffix =
    layout === "promo"
      ? `promo-${promoAspect.replace(":", "x")}`
      : layout === "split"
      ? "split"
      : "graded";
  const fileName = `${cleanBase}-${suffix}.${normalizedFormat}`;

  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 1500);

  return { fileName, width: outW, height: outH, sizeBytes: blob.size };
}
