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

function formatEngineBadge(engineId) {
  if (engineId === "v1") return "Vega 1.0";
  if (engineId === "v2") return "Sirius 2.5";
  return "Polaris 3.5 Pro";
}

function rgbToHex(r, g, b) {
  const h = (v) => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, "0");
  return `#${h(r)}${h(g)}${h(b)}`.toUpperCase();
}

export function extractPaletteSwatches(sourceCanvas, count = 5) {
  if (!sourceCanvas) {
    return ["#1B263B", "#415A77", "#778DA9", "#D4A373", "#E9ECEF"].slice(0, count);
  }
  const sampleW = 48;
  const sampleH = 48;
  const tmp = document.createElement("canvas");
  tmp.width = sampleW;
  tmp.height = sampleH;
  const tctx = tmp.getContext("2d", { willReadFrequently: true });
  tctx.drawImage(sourceCanvas, 0, 0, sampleW, sampleH);
  const { data } = tctx.getImageData(0, 0, sampleW, sampleH);

  // Quantize into 5-bit RGB buckets and pick diverse prominent colors
  const buckets = new Map();
  for (let i = 0; i < data.length; i += 4) {
    if (data[i + 3] < 128) continue;
    const r = data[i];
    const g = data[i + 1];
    const b = data[i + 2];
    const qr = r >> 4;
    const qg = g >> 4;
    const qb = b >> 4;
    const key = (qr << 8) | (qg << 4) | qb;
    const entry = buckets.get(key);
    if (entry) {
      entry.r += r;
      entry.g += g;
      entry.b += b;
      entry.n += 1;
    } else {
      buckets.set(key, { r, g, b, n: 1 });
    }
  }

  const sorted = [...buckets.values()]
    .map((e) => ({
      r: e.r / e.n,
      g: e.g / e.n,
      b: e.b / e.n,
      n: e.n,
    }))
    .sort((a, b) => b.n - a.n);

  const picked = [];
  const minDistSq = 36 * 36;
  for (const c of sorted) {
    const tooClose = picked.some((p) => {
      const dr = p.r - c.r;
      const dg = p.g - c.g;
      const db = p.b - c.b;
      return dr * dr + dg * dg + db * db < minDistSq;
    });
    if (!tooClose) {
      picked.push(c);
      if (picked.length >= count) break;
    }
  }
  while (picked.length < count && sorted.length > picked.length) {
    picked.push(sorted[picked.length]);
  }
  picked.sort((a, b) => (0.2126 * a.r + 0.7152 * a.g + 0.0722 * a.b) - (0.2126 * b.r + 0.7152 * b.g + 0.0722 * b.b));
  return picked.map((c) => rgbToHex(c.r, c.g, c.b));
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

function truncateTextWithEllipsis(ctx, text, maxWidth) {
  if (ctx.measureText(text).width <= maxWidth) return text;
  const ellipsis = "...";
  const ellipsisW = ctx.measureText(ellipsis).width;
  if (maxWidth <= ellipsisW) return ellipsis;
  let lo = 0;
  let hi = text.length;
  while (lo < hi) {
    const mid = Math.ceil((lo + hi) / 2);
    const candidate = text.slice(0, mid);
    if (ctx.measureText(candidate).width + ellipsisW <= maxWidth) {
      lo = mid;
    } else {
      hi = mid - 1;
    }
  }
  return `${text.slice(0, lo).trimEnd()}${ellipsis}`;
}

function drawLiquidGlassBackdrop(ctx, bgCanvas, x, y, w, h, radius, filterStr, refractionScale = 1.04) {
  const cx = x + w / 2;
  const cy = y + h / 2;
  ctx.save();
  drawRoundedRectPath(ctx, x, y, w, h, radius);
  ctx.clip();
  ctx.translate(cx, cy);
  ctx.scale(refractionScale, refractionScale);
  ctx.translate(-cx, -cy);
  ctx.filter = filterStr;
  ctx.drawImage(bgCanvas, 0, 0);
  ctx.filter = "none";
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
  engineId = "v3",
  aspectRatio = "16:9",
  includeQr = true,
  qrMode = "grade",
  qrUrl = "",
}) {
  const dims =
    aspectRatio === "4:5"
      ? { w: 1080, h: 1350 }
      : aspectRatio === "9:16"
      ? { w: 1080, h: 1920 }
      : { w: 1920, h: 1080 };

  const cardW = dims.w;
  const cardH = dims.h;

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

  const webglGraded = renderViaWebGL(source, rw, rh, params, "graded", 50, simulateLogInput);
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
  const logLabel = getLogProfile(simulateLogInput).shortLabel;
  const engineBadge = formatEngineBadge(engineId);

  // Full-bleed background composite canvas using object-fit: cover aspect-fill math
  const bgCanvas = document.createElement("canvas");
  bgCanvas.width = cardW;
  bgCanvas.height = cardH;
  const bgCtx = bgCanvas.getContext("2d");
  bgCtx.fillStyle = "#090A0E";
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

  const out = document.createElement("canvas");
  out.width = cardW;
  out.height = cardH;
  const ctx = out.getContext("2d");

  // 1. Edge-to-edge full-bleed Before/After frame
  ctx.drawImage(bgCanvas, 0, 0);

  const effectiveQrUrl = resolvePromoQrUrl({
    includeQr,
    qrMode,
    qrUrl,
    engineId,
    simulateLogInput,
    params,
  });
  const hasQr = Boolean(effectiveQrUrl);

  const pad = Math.round(cardW * 0.035);
  const isVertical = aspectRatio === "9:16" || aspectRatio === "4:5";
  const dockRadius = 26;
  const dockH = isVertical ? (aspectRatio === "9:16" ? 284 : 272) : 178;
  const dockX = pad;
  const dockY = cardH - pad - dockH;
  const dockW = cardW - pad * 2;

  // 2. Optical split divider line + miniature frosted glass pill grip
  ctx.save();
  ctx.shadowColor = "rgba(0, 0, 0, 0.35)";
  ctx.shadowBlur = 6;
  ctx.strokeStyle = "rgba(255, 255, 255, 0.72)";
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.moveTo(splitX + 0.5, 0);
  ctx.lineTo(splitX + 0.5, cardH);
  ctx.stroke();
  ctx.restore();

  const gripW = 14;
  const gripH = 44;
  const gripX = Math.max(4, Math.min(cardW - gripW - 4, splitX - gripW / 2));
  const gripY = Math.round((dockY - gripH) * 0.5);
  drawLiquidGlassBackdrop(
    ctx,
    bgCanvas,
    gripX,
    gripY,
    gripW,
    gripH,
    gripW / 2,
    "blur(14px) saturate(140%) brightness(0.82)",
    1.04
  );
  ctx.save();
  drawRoundedRectPath(ctx, gripX, gripY, gripW, gripH, gripW / 2);
  ctx.fillStyle = "rgba(255, 255, 255, 0.16)";
  ctx.fill();
  ctx.strokeStyle = "rgba(255, 255, 255, 0.55)";
  ctx.lineWidth = 1;
  ctx.stroke();
  ctx.fillStyle = "rgba(255, 255, 255, 0.72)";
  drawRoundedRectPath(ctx, gripX + gripW / 2 - 1, gripY + 13, 2, gripH - 26, 1);
  ctx.fill();
  ctx.restore();

  // 3. Floating Liquid Glass BEFORE / GRADED capsules
  const drawGlassCapsuleBadge = (label, bx, by, alignRight = false, isGraded = false) => {
    const fontSize = isVertical ? 15 : 16;
    const tracking = 2.4;
    ctx.font = `600 ${fontSize}px Inter, -apple-system, BlinkMacSystemFont, "SF Pro Text", system-ui, sans-serif`;
    const textW = measureTrackedText(ctx, label, tracking);
    const dotSpace = isGraded ? 14 : 0;
    const hPad = 20;
    const pillH = 38;
    const pillW = Math.round(textW + hPad * 2 + dotSpace);
    const px = alignRight ? bx - pillW : bx;

    ctx.save();
    ctx.shadowColor = "rgba(0, 0, 0, 0.28)";
    ctx.shadowBlur = 16;
    ctx.shadowOffsetY = 4;
    drawRoundedRectPath(ctx, px, by, pillW, pillH, pillH / 2);
    ctx.fillStyle = "rgba(0, 0, 0, 0.01)";
    ctx.fill();
    ctx.restore();

    drawLiquidGlassBackdrop(
      ctx,
      bgCanvas,
      px,
      by,
      pillW,
      pillH,
      pillH / 2,
      "blur(16px) brightness(0.72)",
      1.04
    );

    ctx.save();
    drawRoundedRectPath(ctx, px, by, pillW, pillH, pillH / 2);
    ctx.fillStyle = "rgba(14, 16, 22, 0.34)";
    ctx.fill();

    const rimGrad = ctx.createLinearGradient(px, by, px + pillW, by + pillH);
    rimGrad.addColorStop(0, "rgba(255, 255, 255, 0.44)");
    rimGrad.addColorStop(0.5, "rgba(255, 255, 255, 0.12)");
    rimGrad.addColorStop(1, "rgba(255, 255, 255, 0.26)");
    ctx.strokeStyle = rimGrad;
    ctx.lineWidth = 1;
    ctx.stroke();

    let textStartX = px + hPad;
    if (isGraded) {
      ctx.beginPath();
      ctx.arc(px + hPad + 3, by + pillH / 2, 3.5, 0, Math.PI * 2);
      ctx.fillStyle = "#6EE7B7";
      ctx.fill();
      textStartX += dotSpace;
    }

    ctx.fillStyle = "#F8FAFC";
    ctx.textBaseline = "middle";
    ctx.shadowColor = "rgba(0, 0, 0, 0.45)";
    ctx.shadowBlur = 4;
    drawTrackedText(ctx, label, textStartX, by + pillH / 2 + 0.5, tracking);
    ctx.restore();
  };

  drawGlassCapsuleBadge("BEFORE", pad, pad, false, false);
  drawGlassCapsuleBadge("GRADED", cardW - pad, pad, true, true);

  // 4. Floating Apple Liquid Glass Metadata Dock
  ctx.save();
  ctx.shadowColor = "rgba(0, 0, 0, 0.45)";
  ctx.shadowBlur = 36;
  ctx.shadowOffsetY = 14;
  drawRoundedRectPath(ctx, dockX, dockY, dockW, dockH, dockRadius);
  ctx.fillStyle = "rgba(0, 0, 0, 0.01)";
  ctx.fill();
  ctx.restore();

  drawLiquidGlassBackdrop(
    ctx,
    bgCanvas,
    dockX,
    dockY,
    dockW,
    dockH,
    dockRadius,
    "blur(26px) saturate(145%) brightness(0.68)",
    1.04
  );

  ctx.save();
  drawRoundedRectPath(ctx, dockX, dockY, dockW, dockH, dockRadius);
  ctx.clip();

  // Smoked Obsidian Glass Tint
  const tintGrad = ctx.createLinearGradient(dockX, dockY, dockX, dockY + dockH);
  tintGrad.addColorStop(0, "rgba(14, 16, 22, 0.46)");
  tintGrad.addColorStop(1, "rgba(8, 10, 14, 0.62)");
  ctx.fillStyle = tintGrad;
  ctx.fillRect(dockX, dockY, dockW, dockH);

  // Soft top inner catchlight line
  const catchlightGrad = ctx.createLinearGradient(dockX + dockRadius, dockY, dockX + dockW - dockRadius, dockY);
  catchlightGrad.addColorStop(0, "rgba(255, 255, 255, 0)");
  catchlightGrad.addColorStop(0.25, "rgba(255, 255, 255, 0.24)");
  catchlightGrad.addColorStop(0.75, "rgba(255, 255, 255, 0.24)");
  catchlightGrad.addColorStop(1, "rgba(255, 255, 255, 0)");
  ctx.strokeStyle = catchlightGrad;
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(dockX + dockRadius, dockY + 1.5);
  ctx.lineTo(dockX + dockW - dockRadius, dockY + 1.5);
  ctx.stroke();
  ctx.restore();

  // Fresnel Specular Rim (1.5px diagonal bevel)
  ctx.save();
  drawRoundedRectPath(ctx, dockX, dockY, dockW, dockH, dockRadius);
  const bevelGrad = ctx.createLinearGradient(dockX, dockY, dockX + dockW, dockY + dockH);
  bevelGrad.addColorStop(0, "rgba(255, 255, 255, 0.48)");
  bevelGrad.addColorStop(0.5, "rgba(255, 255, 255, 0.08)");
  bevelGrad.addColorStop(1, "rgba(255, 255, 255, 0.24)");
  ctx.strokeStyle = bevelGrad;
  ctx.lineWidth = 1.5;
  ctx.stroke();
  ctx.restore();

  // 5. Minimalist Editorial Typography, Glossy Liquid Glass Palette Droplets & Optional QR Plate
  const dockPadX = isVertical ? 32 : 38;
  const dockPadY = isVertical ? 26 : 16;
  const innerH = dockH - dockPadY * 2;
  const labelH = isVertical ? 14 : 16;
  const qrMatrix = hasQr ? generateQrMatrix(effectiveQrUrl) : null;
  const hasValidQr = Boolean(qrMatrix && qrMatrix.length > 0);
  const plateSize = hasValidQr ? Math.floor(innerH - labelH) : 0;
  const sectionGap = isVertical ? 28 : 30;
  const rightContentEdgeX = hasValidQr
    ? dockX + dockW - dockPadX - plateSize - sectionGap
    : dockX + dockW - dockPadX;

  const swatchSize = isVertical ? 44 : 46;
  const swatchGap = isVertical ? 16 : 18;
  const totalSwatchesW = swatches.length * swatchSize + (swatches.length - 1) * swatchGap;

  // Left: Preset Title + Engine / Profile Capsules
  const cleanTitle = cleanPromoTitle(presetTitle);
  const titleFontSize = isVertical ? 34 : 40;
  const maxTitleW = isVertical
    ? rightContentEdgeX - (dockX + dockPadX)
    : rightContentEdgeX - (dockX + dockPadX) - totalSwatchesW - 40;

  const titleX = dockX + dockPadX;
  const titleY = isVertical ? dockY + 26 : dockY + 34;

  ctx.save();
  ctx.font = `700 ${titleFontSize}px Inter, -apple-system, BlinkMacSystemFont, "SF Pro Display", system-ui, sans-serif`;
  ctx.fillStyle = "#F8FAFC";
  ctx.textBaseline = "top";
  ctx.shadowColor = "rgba(0, 0, 0, 0.45)";
  ctx.shadowBlur = 10;
  ctx.shadowOffsetY = 2;
  const displayTitle = truncateTextWithEllipsis(ctx, cleanTitle, maxTitleW);
  ctx.fillText(displayTitle, titleX, titleY);
  ctx.restore();

  // Badges Row
  const badgeY = isVertical ? titleY + titleFontSize + 14 : titleY + titleFontSize + 16;
  let badgeCursorX = titleX;
  const drawDockBadge = (label, hasEmeraldDot) => {
    ctx.save();
    ctx.font = '600 15px Inter, -apple-system, BlinkMacSystemFont, "SF Pro Text", system-ui, sans-serif';
    const textW = ctx.measureText(label).width;
    const dotOffset = hasEmeraldDot ? 15 : 0;
    const pillH = 32;
    const pillW = Math.round(textW + 28 + dotOffset);

    drawRoundedRectPath(ctx, badgeCursorX, badgeY, pillW, pillH, pillH / 2);
    ctx.fillStyle = "rgba(255, 255, 255, 0.08)";
    ctx.fill();
    ctx.strokeStyle = "rgba(255, 255, 255, 0.22)";
    ctx.lineWidth = 1;
    ctx.stroke();

    let tx = badgeCursorX + 14;
    if (hasEmeraldDot) {
      ctx.beginPath();
      ctx.arc(badgeCursorX + 16, badgeY + pillH / 2, 3.5, 0, Math.PI * 2);
      ctx.fillStyle = "#6EE7B7";
      ctx.fill();
      tx += dotOffset;
    }

    ctx.fillStyle = "#F1F5F9";
    ctx.textBaseline = "middle";
    ctx.fillText(label, tx, badgeY + pillH / 2 + 0.5);
    ctx.restore();

    badgeCursorX += pillW + 10;
  };

  drawDockBadge(engineBadge, engineId === "v3");
  drawDockBadge(logLabel, false);

  // Subtle horizontal divider in portrait mode between metadata row and swatches row
  if (isVertical) {
    ctx.save();
    ctx.strokeStyle = "rgba(255, 255, 255, 0.10)";
    ctx.lineWidth = 1;
    const divY = badgeY + 48;
    ctx.beginPath();
    ctx.moveTo(dockX + dockPadX, divY);
    ctx.lineTo(rightContentEdgeX, divY);
    ctx.stroke();
    ctx.restore();
  }

  // Right (or Row 2 in portrait): 5 Glossy Liquid Glass Palette Droplets + Hex Codes
  const swatchStartX = isVertical
    ? dockX + dockPadX
    : rightContentEdgeX - totalSwatchesW;
  const swatchY = isVertical ? badgeY + 66 : dockY + 32;

  swatches.forEach((hex, idx) => {
    const sx = swatchStartX + idx * (swatchSize + swatchGap);
    const dropletRadius = 15;

    ctx.save();
    ctx.shadowColor = "rgba(0, 0, 0, 0.35)";
    ctx.shadowBlur = 10;
    ctx.shadowOffsetY = 4;
    drawRoundedRectPath(ctx, sx, swatchY, swatchSize, swatchSize, dropletRadius);
    ctx.fillStyle = hex;
    ctx.fill();
    ctx.restore();

    // Top curved white specular meniscus gradient
    ctx.save();
    drawRoundedRectPath(ctx, sx, swatchY, swatchSize, swatchSize, dropletRadius);
    ctx.clip();

    const meniscusGrad = ctx.createLinearGradient(sx, swatchY, sx, swatchY + swatchSize * 0.62);
    meniscusGrad.addColorStop(0, "rgba(255, 255, 255, 0.42)");
    meniscusGrad.addColorStop(0.55, "rgba(255, 255, 255, 0.08)");
    meniscusGrad.addColorStop(1, "rgba(255, 255, 255, 0)");

    ctx.beginPath();
    ctx.ellipse(
      sx + swatchSize / 2,
      swatchY + swatchSize * 0.16,
      swatchSize * 0.56,
      swatchSize * 0.36,
      0,
      0,
      Math.PI * 2
    );
    ctx.fillStyle = meniscusGrad;
    ctx.fill();
    ctx.restore();

    // Crisp 1px specular droplet rim
    ctx.save();
    drawRoundedRectPath(ctx, sx, swatchY, swatchSize, swatchSize, dropletRadius);
    ctx.strokeStyle = "rgba(255, 255, 255, 0.28)";
    ctx.lineWidth = 1;
    ctx.stroke();
    ctx.restore();

    // Monospace #HEX code underneath
    ctx.save();
    ctx.font = "500 12px ui-monospace, SFMono-Regular, Menlo, monospace";
    ctx.fillStyle = "rgba(248, 250, 252, 0.78)";
    ctx.textBaseline = "top";
    const tw = ctx.measureText(hex).width;
    ctx.fillText(hex, sx + (swatchSize - tw) / 2, swatchY + swatchSize + 8);
    ctx.restore();
  });

  // Watermark: "COLOR MATCH FOR KEYFLOW" in refined wide-tracked uppercase micro-typography
  ctx.save();
  const wm = "COLOR MATCH FOR KEYFLOW";
  const wmTracking = 3.2;
  ctx.font = '600 12px Inter, -apple-system, BlinkMacSystemFont, "SF Pro Text", system-ui, sans-serif';
  ctx.fillStyle = "rgba(255, 255, 255, 0.55)";
  ctx.textBaseline = "bottom";
  const wmW = measureTrackedText(ctx, wm, wmTracking);
  const wmX = rightContentEdgeX - wmW;
  const wmY = isVertical ? swatchY + swatchSize + 20 : dockY + dockH - 22;
  drawTrackedText(ctx, wm, wmX, wmY, wmTracking);
  ctx.restore();

  // 6. Optional Scannable QR Plate cleanly inside the Floating Glass Dock
  if (hasValidQr) {
    const moduleCount = qrMatrix.length;
    const plateX = dockX + dockW - dockPadX - plateSize;
    const totalQrH = plateSize + labelH;
    const plateY = dockY + dockPadY + Math.round((innerH - totalQrH) / 2);

    ctx.save();
    ctx.shadowColor = "rgba(0, 0, 0, 0.30)";
    ctx.shadowBlur = 12;
    ctx.shadowOffsetY = 3;
    drawRoundedRectPath(ctx, plateX, plateY, plateSize, plateSize, 10);
    ctx.fillStyle = "#FFFFFF";
    ctx.fill();
    ctx.restore();

    const quietPad = Math.max(8, Math.round(plateSize * 0.09));
    const matrixBox = plateSize - quietPad * 2;
    const cellSize = Math.max(2, Math.floor(matrixBox / moduleCount));
    const actualMatrixPx = cellSize * moduleCount;
    const offsetX = plateX + Math.round((plateSize - actualMatrixPx) / 2);
    const offsetY = plateY + Math.round((plateSize - actualMatrixPx) / 2);

    ctx.save();
    ctx.imageSmoothingEnabled = false;
    ctx.fillStyle = "#000000";
    for (let r = 0; r < moduleCount; r++) {
      for (let c = 0; c < moduleCount; c++) {
        if (qrMatrix[r][c]) {
          ctx.fillRect(offsetX + c * cellSize, offsetY + r * cellSize, cellSize, cellSize);
        }
      }
    }
    ctx.restore();

    // Crisp micro-label below the white QR plate, contained within innerH
    const qrLabel = qrMode === "custom" ? "SCAN LINK" : "SCAN GRADE";
    const qrTracking = 1.6;
    ctx.save();
    ctx.font = '600 10px Inter, -apple-system, BlinkMacSystemFont, "SF Pro Text", system-ui, sans-serif';
    ctx.fillStyle = "rgba(248, 250, 252, 0.85)";
    ctx.textBaseline = "top";
    const labelW = measureTrackedText(ctx, qrLabel, qrTracking);
    drawTrackedText(
      ctx,
      qrLabel,
      Math.round(plateX + (plateSize - labelW) / 2),
      plateY + plateSize + (isVertical ? 4 : 5),
      qrTracking
    );
    ctx.restore();
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
  engineId = "v3",
  aspectRatio = "16:9",
  format = "png",
  quality = 95,
  includeQr = true,
  qrMode = "grade",
  qrUrl = "",
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
  engineId = "v3",
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
