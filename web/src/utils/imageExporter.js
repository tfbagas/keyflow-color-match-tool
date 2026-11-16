import {
  PREVIEW_VERTEX,
  PREVIEW_FRAGMENT,
  UNIFORM_MAP,
  getHybridUniformLocations,
  bindHybridUniforms,
} from "./gradeShader";
import { DEFAULT_PARAMS, sanitizeParams } from "./gradeEngine";
import { simulateGradePixels } from "./colorGrading";

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

function renderViaWebGL(source, width, height, params, layout, splitPos, simulateLogInput) {
  const glCanvas = document.createElement("canvas");
  glCanvas.width = width;
  glCanvas.height = height;

  const gl = glCanvas.getContext("webgl", {
    alpha: true,
    antialias: false,
    depth: false,
    stencil: false,
    preserveDrawingBuffer: true,
    premultipliedAlpha: false,
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
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, source);

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
      gl.uniform1f(uLogInput, simulateLogInput ? 1.0 : 0.0);
    }

    const safe = sanitizeParams(params);
    for (const [key, uniform] of UNIFORM_MAP) {
      const loc = gl.getUniformLocation(program, uniform);
      if (loc !== null) {
        gl.uniform1f(loc, safe[key] ?? DEFAULT_PARAMS[key] ?? 0);
      }
    }
    bindHybridUniforms(gl, getHybridUniformLocations(gl, program), safe);

    gl.viewport(0, 0, width, height);
    gl.clearColor(0, 0, 0, 0);
    gl.clear(gl.COLOR_BUFFER_BIT);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    gl.finish();

    return {
      canvas: glCanvas,
      cleanup: () => {
        try {
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

  const outCanvas = document.createElement("canvas");
  outCanvas.width = width;
  outCanvas.height = height;
  const outCtx = outCanvas.getContext("2d");

  const webglRes = renderViaWebGL(source, width, height, params, layout, splitPos, simulateLogInput);
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

  const blob = await new Promise((resolve, reject) => {
    outCanvas.toBlob(
      (b) => (b ? resolve(b) : reject(new Error("Failed to encode image."))),
      mime,
      normalizedFormat === "png" ? undefined : qualityFloat
    );
  });

  const cleanBase =
    String(baseName || "Target")
      .trim()
      .replace(/[^a-zA-Z0-9._-]+/g, "-")
      .replace(/^-+|-+$/g, "") || "Target";
  const suffix = layout === "split" ? "split" : "graded";
  const fileName = `${cleanBase}-${suffix}.${normalizedFormat}`;

  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 1500);

  return { fileName, width, height, sizeBytes: blob.size };
}
