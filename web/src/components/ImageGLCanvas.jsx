import React, { useEffect, useRef } from "react";
import { IMAGE_PREVIEW_VERTEX, PREVIEW_FRAGMENT, UNIFORM_MAP } from "../utils/gradeShader";
import { sanitizeParams } from "../utils/gradeEngine";

// Matches PREVIEW_FRAGMENT u_viewMode: 0 = Split Slider, 1 = Side by Side, 2 = Split Result
const VIEW_MODE_VALUE = { split: 0, side: 1, result: 2 };

function compileShader(gl, type, src) {
  const sh = gl.createShader(type);
  if (!sh) throw new Error("Failed to allocate WebGL shader.");
  gl.shaderSource(sh, src);
  gl.compileShader(sh);
  if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) {
    const log = gl.getShaderInfoLog(sh);
    gl.deleteShader(sh);
    throw new Error(`Shader compile failed: ${log}`);
  }
  return sh;
}

function getViewportCap(maxSideProp) {
  const isMobile = typeof window !== "undefined" && window.innerWidth < 1024;
  const dpr = Math.min(
    typeof window !== "undefined" ? window.devicePixelRatio || 1 : 1,
    isMobile ? 1.25 : 1.5
  );
  const deviceMaxSide = isMobile ? 960 : 1600;
  const maxSide = maxSideProp ? Math.min(deviceMaxSide, maxSideProp) : deviceMaxSide;
  return { dpr, maxSide };
}

// Single-pass WebGL fragment shader preview for static images (with shader-level Y flip).
export default function ImageGLCanvas({
  imageEl = null,
  params,
  mode = "split",
  splitPos = 50,
  hold = false,
  simulateLogInput = false,
  maxSide = 0,
  onError,
  className = "",
}) {
  const canvasRef = useRef(null);
  const stateRef = useRef({
    params,
    mode,
    splitPos,
    hold,
    simulateLogInput,
    maxSide,
  });
  const scheduleDrawRef = useRef(() => {});

  stateRef.current = { params, mode, splitPos, hold, simulateLogInput, maxSide };

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !imageEl) return undefined;

    const gl =
      canvas.getContext("webgl", {
        alpha: false,
        antialias: false,
        depth: false,
        stencil: false,
        powerPreference: "high-performance",
      }) || null;

    if (!gl) {
      if (onError) onError("WebGL is not available in this browser.");
      return undefined;
    }

    let vs = null;
    let fs = null;
    let program = null;
    let texture = null;
    let buffer = null;

    try {
      vs = compileShader(gl, gl.VERTEX_SHADER, IMAGE_PREVIEW_VERTEX);
      fs = compileShader(gl, gl.FRAGMENT_SHADER, PREVIEW_FRAGMENT);
      program = gl.createProgram();
      gl.attachShader(program, vs);
      gl.attachShader(program, fs);
      gl.linkProgram(program);
      if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
        throw new Error("Shader link failed.");
      }
    } catch (err) {
      if (vs) gl.deleteShader(vs);
      if (fs) gl.deleteShader(fs);
      if (program) gl.deleteProgram(program);
      if (onError) onError(err.message || "WebGL shader error.");
      return undefined;
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
    // Keep UNPACK_FLIP_Y_WEBGL false; vertical UV flip is handled in IMAGE_PREVIEW_VERTEX.
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
    gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);

    const loc = {};
    UNIFORM_MAP.forEach(([, uName]) => {
      loc[uName] = gl.getUniformLocation(program, uName);
    });
    const uViewMode = gl.getUniformLocation(program, "u_viewMode");
    const uResolution = gl.getUniformLocation(program, "u_resolution");
    const uSplit = gl.getUniformLocation(program, "uSplit");
    const uHold = gl.getUniformLocation(program, "uHold");
    const uLogInput = gl.getUniformLocation(program, "uLogInput");
    gl.uniform1i(gl.getUniformLocation(program, "uTexture"), 0);

    const maxTex = gl.getParameter(gl.MAX_TEXTURE_SIZE) || 4096;

    let disposed = false;
    let pendingDrawRaf = 0;
    let hasUploadedData = false;

    const resizeCanvas = (isSide) => {
      const srcW = imageEl.naturalWidth || imageEl.width || 1280;
      const srcH = imageEl.naturalHeight || imageEl.height || 720;
      const logicalW = isSide ? srcW * 2 : srcW;
      const logicalH = srcH;

      const { dpr, maxSide: capSide } = getViewportCap(stateRef.current.maxSide);
      const cw = canvas.clientWidth || 0;
      const ch = canvas.clientHeight || 0;

      let targetW = logicalW;
      let targetH = logicalH;

      if (cw > 0 && ch > 0) {
        const containerAspect = cw / ch;
        const mediaAspect = logicalW / logicalH;
        const fitW = mediaAspect > containerAspect ? cw : ch * mediaAspect;
        const fitH = mediaAspect > containerAspect ? cw / mediaAspect : ch;
        const dprW = Math.round(fitW * dpr);
        const dprH = Math.round(fitH * dpr);
        const clampScale = Math.min(
          1,
          logicalW / Math.max(1, dprW),
          capSide / Math.max(1, dprW, dprH)
        );
        targetW = Math.max(2, Math.round(dprW * clampScale));
        targetH = Math.max(2, Math.round(dprH * clampScale));
      } else {
        const scale = Math.min(1, capSide / Math.max(logicalW, logicalH));
        targetW = Math.max(2, Math.round(logicalW * scale));
        targetH = Math.max(2, Math.round(logicalH * scale));
      }

      if (canvas.width !== targetW || canvas.height !== targetH) {
        canvas.width = targetW;
        canvas.height = targetH;
      }
      gl.viewport(0, 0, canvas.width, canvas.height);
    };

    const draw = () => {
      if (disposed || gl.isContextLost() || document.hidden || !hasUploadedData) return;
      const st = stateRef.current;

      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, texture);

      resizeCanvas(st.mode === "side");

      const safe = sanitizeParams(st.params);
      UNIFORM_MAP.forEach(([key, uName]) => {
        if (loc[uName] !== null) {
          gl.uniform1f(loc[uName], safe[key]);
        }
      });
      if (uViewMode !== null) {
        gl.uniform1f(uViewMode, VIEW_MODE_VALUE[st.mode] ?? 0);
      }
      if (uResolution !== null) {
        gl.uniform2f(uResolution, canvas.width, canvas.height);
      }
      if (uSplit !== null) {
        gl.uniform1f(uSplit, Math.min(1, Math.max(0, st.splitPos / 100)));
      }
      if (uHold !== null) {
        gl.uniform1f(uHold, st.hold ? 1 : 0);
      }
      if (uLogInput !== null) {
        gl.uniform1f(uLogInput, st.simulateLogInput ? 1 : 0);
      }

      gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    };

    const scheduleDraw = () => {
      if (disposed || pendingDrawRaf) return;
      pendingDrawRaf = requestAnimationFrame(() => {
        pendingDrawRaf = 0;
        draw();
      });
    };
    scheduleDrawRef.current = scheduleDraw;

    const iw = imageEl.naturalWidth || imageEl.width || 0;
    const ih = imageEl.naturalHeight || imageEl.height || 0;
    if (iw > 0 && ih > 0) {
      const texCap = Math.min(maxTex, 1920);
      const scale = Math.min(1, texCap / Math.max(iw, ih));
      const tw = Math.max(2, Math.round(iw * scale));
      const th = Math.max(2, Math.round(ih * scale));

      const uploadPhotoSource = (src) => {
        if (disposed || gl.isContextLost()) return;
        gl.activeTexture(gl.TEXTURE0);
        gl.bindTexture(gl.TEXTURE_2D, texture);
        gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, src);
        hasUploadedData = true;
        draw();
      };

      if (scale < 1 && typeof createImageBitmap === "function") {
        createImageBitmap(imageEl, {
          resizeWidth: tw,
          resizeHeight: th,
          resizeQuality: "high",
        })
          .then((bitmap) => {
            try {
              uploadPhotoSource(bitmap);
            } finally {
              bitmap.close();
            }
          })
          .catch(() => {
            if (disposed) return;
            const off = document.createElement("canvas");
            off.width = tw;
            off.height = th;
            const octx = off.getContext("2d");
            octx.drawImage(imageEl, 0, 0, tw, th);
            uploadPhotoSource(off);
          });
      } else if (scale < 1) {
        const off = document.createElement("canvas");
        off.width = tw;
        off.height = th;
        const octx = off.getContext("2d");
        octx.drawImage(imageEl, 0, 0, tw, th);
        uploadPhotoSource(off);
      } else {
        uploadPhotoSource(imageEl);
      }
    }

    const ro = new ResizeObserver(() => {
      scheduleDraw();
    });
    ro.observe(canvas);

    const onVisibility = () => {
      if (!document.hidden) scheduleDraw();
    };
    document.addEventListener("visibilitychange", onVisibility);

    const onLost = (e) => {
      e.preventDefault();
      if (onError) onError("GPU context was lost. Reload the image to continue.");
    };
    canvas.addEventListener("webglcontextlost", onLost);

    return () => {
      disposed = true;
      scheduleDrawRef.current = () => {};
      if (pendingDrawRaf) cancelAnimationFrame(pendingDrawRaf);
      ro.disconnect();
      document.removeEventListener("visibilitychange", onVisibility);
      canvas.removeEventListener("webglcontextlost", onLost);
      try {
        if (texture) gl.deleteTexture(texture);
        if (buffer) gl.deleteBuffer(buffer);
        if (vs) gl.deleteShader(vs);
        if (fs) gl.deleteShader(fs);
        if (program) gl.deleteProgram(program);
      } catch {
        // context may already be gone
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [imageEl]);

  useEffect(() => {
    scheduleDrawRef.current();
  }, [params, mode, splitPos, hold, simulateLogInput, maxSide]);

  return <canvas ref={canvasRef} className={className} />;
}
