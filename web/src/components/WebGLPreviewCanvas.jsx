import React, { useEffect, useRef } from "react";
import {
  UNIFIED_PREVIEW_VERTEX,
  PREVIEW_FRAGMENT,
  UNIFORM_MAP,
  getHybridUniformLocations,
  bindHybridUniforms,
} from "../utils/gradeShader";
import { sanitizeParams } from "../utils/gradeEngine";

// Matches PREVIEW_FRAGMENT u_viewMode: 0 = Split Slider, 1 = Side by Side, 2 = Graded Only
const VIEW_MODE_VALUE = { split: 0, side: 1, result: 2 };
// Matches PREVIEW_FRAGMENT uMonitorMode: 0 = Off, 1 = Zebra/Clipping, 2 = False Color IRE
const MONITOR_MODE_VALUE = { off: 0, zebra: 1, falsecolor: 2 };

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

// Unified single-pass WebGL fragment shader preview for both photos and videos.
// Keeps one compiled shader program across media switches and supports webglcontextrestored.
export default function WebGLPreviewCanvas({
  videoEl = null,
  imageEl = null,
  params,
  mode = "split",
  splitPos = 50,
  hold = false,
  simulateLogInput = false,
  monitorMode = "off",
  maxSide = 0,
  previewRef = null,
  onError,
  onContextLost,
  onContextRestored,
  isActive = true,
  className = "",
}) {
  const canvasRef = useRef(null);
  const isActiveRef = useRef(isActive);
  isActiveRef.current = isActive;

  const stateRef = useRef({
    params,
    mode,
    splitPos,
    hold,
    simulateLogInput,
    monitorMode,
    maxSide,
  });
  stateRef.current = {
    params,
    mode,
    splitPos,
    hold,
    simulateLogInput,
    monitorMode,
    maxSide,
  };

  const sanitizedParamsRef = useRef(sanitizeParams(params));
  const callbacksRef = useRef({ onError, onContextLost, onContextRestored });
  callbacksRef.current = { onError, onContextLost, onContextRestored };

  const glStateRef = useRef(null);
  const mediaStateRef = useRef({
    videoEl: null,
    imageEl: null,
    texW: 0,
    texH: 0,
    hasAllocated: false,
    hasUploadedData: false,
    needsFrameUpload: false,
    lastUploadedTime: -1,
    lastPresentedFrames: -1,
    lastSizeKey: "",
    isContextLost: false,
  });

  const scheduleDrawRef = useRef(() => {});
  const drawRef = useRef(() => {});
  const startLoopRef = useRef(() => {});
  const stopLoopRef = useRef(() => {});
  const uploadActiveSourceRef = useRef(() => {});

  // Initialize persistent WebGL context & shader program once on mount.
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return undefined;

    const gl =
      canvas.getContext("webgl", {
        alpha: false,
        antialias: false,
        depth: false,
        stencil: false,
        powerPreference: "high-performance",
      }) || null;

    if (!gl) {
      callbacksRef.current.onError?.("WebGL is not available in this browser.");
      return undefined;
    }

    let disposed = false;
    let pendingDrawRaf = 0;

    const initGLResources = () => {
      let vs = null;
      let fs = null;
      let program = null;
      let buffer = null;
      let texture = null;

      try {
        vs = compileShader(gl, gl.VERTEX_SHADER, UNIFIED_PREVIEW_VERTEX);
        fs = compileShader(gl, gl.FRAGMENT_SHADER, PREVIEW_FRAGMENT);
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
        gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);

        const loc = {};
        UNIFORM_MAP.forEach(([, uName]) => {
          loc[uName] = gl.getUniformLocation(program, uName);
        });
        const hybridLoc = getHybridUniformLocations(gl, program);
        const uViewMode = gl.getUniformLocation(program, "u_viewMode");
        const uResolution = gl.getUniformLocation(program, "u_resolution");
        const uSplit = gl.getUniformLocation(program, "uSplit");
        const uHold = gl.getUniformLocation(program, "uHold");
        const uLogInput = gl.getUniformLocation(program, "uLogInput");
        const uMonitorMode = gl.getUniformLocation(program, "uMonitorMode");
        const uFlipY = gl.getUniformLocation(program, "uFlipY");
        gl.uniform1i(gl.getUniformLocation(program, "uTexture"), 0);

        const maxTex = gl.getParameter(gl.MAX_TEXTURE_SIZE) || 4096;

        glStateRef.current = {
          gl,
          vs,
          fs,
          program,
          buffer,
          texture,
          loc,
          hybridLoc,
          uViewMode,
          uResolution,
          uSplit,
          uHold,
          uLogInput,
          uMonitorMode,
          uFlipY,
          maxTex,
        };
        return true;
      } catch (err) {
        try {
          if (texture) gl.deleteTexture(texture);
          if (buffer) gl.deleteBuffer(buffer);
          if (vs) gl.deleteShader(vs);
          if (fs) gl.deleteShader(fs);
          if (program) gl.deleteProgram(program);
        } catch {
          // ignore
        }
        glStateRef.current = null;
        callbacksRef.current.onError?.(err.message || "WebGL shader error.");
        return false;
      }
    };

    const cleanupGLResources = (loseContext) => {
      const res = glStateRef.current;
      glStateRef.current = null;
      if (!res) return;
      try {
        if (res.texture) res.gl.deleteTexture(res.texture);
        if (res.buffer) res.gl.deleteBuffer(res.buffer);
        if (res.vs) res.gl.deleteShader(res.vs);
        if (res.fs) res.gl.deleteShader(res.fs);
        if (res.program) res.gl.deleteProgram(res.program);
        if (loseContext) {
          res.gl.getExtension("WEBGL_lose_context")?.loseContext();
        }
      } catch {
        // context may already be gone
      }
    };

    if (!initGLResources()) {
      return undefined;
    }

    const syncCanvasSize = (isSide) => {
      const ms = mediaStateRef.current;
      const sw = ms.videoEl
        ? ms.videoEl.videoWidth || 0
        : ms.imageEl?.naturalWidth || ms.imageEl?.width || 0;
      const sh = ms.videoEl
        ? ms.videoEl.videoHeight || 0
        : ms.imageEl?.naturalHeight || ms.imageEl?.height || 0;
      const srcW = sw || 1280;
      const srcH = sh || 720;

      const { dpr, maxSide: capSide } = getViewportCap(stateRef.current.maxSide);
      const cw = canvas.clientWidth || 0;
      const ch = canvas.clientHeight || 0;
      const sizeKey = `${srcW}x${srcH}|${cw}x${ch}|${isSide ? 1 : 0}|${capSide}|${dpr}`;
      if (ms.lastSizeKey === sizeKey) return;
      ms.lastSizeKey = sizeKey;

      const logicalW = isSide ? srcW * 2 : srcW;
      const logicalH = srcH;
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

    const draw = (allowUpload = false) => {
      const res = glStateRef.current;
      const ms = mediaStateRef.current;
      if (
        disposed ||
        !res ||
        ms.isContextLost ||
        gl.isContextLost() ||
        document.hidden ||
        !isActiveRef.current
      ) {
        return;
      }

      const st = stateRef.current;

      if (ms.videoEl) {
        if (ms.videoEl.readyState < 2) return;
        const vw = ms.videoEl.videoWidth || 0;
        const vh = ms.videoEl.videoHeight || 0;
        if (vw <= 0 || vh <= 0) return;
        if (vw > res.maxTex || vh > res.maxTex) {
          callbacksRef.current.onError?.("Video resolution exceeds this GPU's texture limit.");
          return;
        }

        gl.activeTexture(gl.TEXTURE0);
        gl.bindTexture(gl.TEXTURE_2D, res.texture);
        gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);

        if (!ms.hasAllocated || ms.texW !== vw || ms.texH !== vh) {
          try {
            gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, ms.videoEl);
            ms.texW = vw;
            ms.texH = vh;
            ms.hasAllocated = true;
            ms.hasUploadedData = true;
            ms.needsFrameUpload = false;
            ms.lastUploadedTime = ms.videoEl.currentTime;
          } catch {
            callbacksRef.current.onError?.("Could not allocate video texture on the GPU.");
            return;
          }
        } else {
          const shouldUpload =
            !ms.hasUploadedData ||
            ms.needsFrameUpload ||
            (allowUpload && !ms.videoEl.paused && ms.videoEl.currentTime !== ms.lastUploadedTime);
          if (shouldUpload) {
            try {
              gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, gl.RGBA, gl.UNSIGNED_BYTE, ms.videoEl);
              ms.hasUploadedData = true;
              ms.needsFrameUpload = false;
              ms.lastUploadedTime = ms.videoEl.currentTime;
            } catch {
              callbacksRef.current.onError?.("Could not upload video frames to the GPU.");
              return;
            }
          }
        }
      } else {
        if (!ms.hasAllocated || !ms.hasUploadedData) return;
        gl.activeTexture(gl.TEXTURE0);
        gl.bindTexture(gl.TEXTURE_2D, res.texture);
      }

      syncCanvasSize(st.mode === "side");

      const safe = sanitizedParamsRef.current;
      UNIFORM_MAP.forEach(([key, uName]) => {
        if (res.loc[uName] !== null) {
          gl.uniform1f(res.loc[uName], safe[key]);
        }
      });
      bindHybridUniforms(gl, res.hybridLoc, safe);
      if (res.uFlipY !== null) {
        gl.uniform1f(res.uFlipY, ms.videoEl ? 0.0 : 1.0);
      }
      if (res.uViewMode !== null) {
        gl.uniform1f(res.uViewMode, VIEW_MODE_VALUE[st.mode] ?? 0);
      }
      if (res.uResolution !== null) {
        gl.uniform2f(res.uResolution, canvas.width, canvas.height);
      }
      if (res.uSplit !== null) {
        gl.uniform1f(res.uSplit, Math.min(1, Math.max(0, st.splitPos / 100)));
      }
      if (res.uHold !== null) {
        gl.uniform1f(res.uHold, st.hold ? 1 : 0);
      }
      if (res.uLogInput !== null) {
        gl.uniform1f(res.uLogInput, st.simulateLogInput ? 1 : 0);
      }
      if (res.uMonitorMode !== null) {
        gl.uniform1f(res.uMonitorMode, MONITOR_MODE_VALUE[st.monitorMode] ?? 0);
      }

      gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    };

    const scheduleDraw = () => {
      if (disposed || pendingDrawRaf) return;
      pendingDrawRaf = requestAnimationFrame(() => {
        pendingDrawRaf = 0;
        draw(false);
      });
    };

    drawRef.current = draw;
    scheduleDrawRef.current = scheduleDraw;

    if (previewRef) {
      previewRef.current = {
        setParams: (nextParams) => {
          stateRef.current.params = nextParams;
          sanitizedParamsRef.current = sanitizeParams(nextParams);
          scheduleDraw();
        },
        setSplitPos: (nextSplit) => {
          stateRef.current.splitPos = nextSplit;
          scheduleDraw();
        },
      };
    }

    const ro = new ResizeObserver(() => {
      mediaStateRef.current.lastSizeKey = "";
      scheduleDraw();
    });
    ro.observe(canvas);

    const onVisibility = () => {
      if (document.hidden) {
        stopLoopRef.current();
      } else if (isActiveRef.current) {
        scheduleDraw();
        startLoopRef.current();
      }
    };
    document.addEventListener("visibilitychange", onVisibility);

    const onLost = (e) => {
      e.preventDefault();
      mediaStateRef.current.isContextLost = true;
      stopLoopRef.current();
      callbacksRef.current.onContextLost?.();
    };

    const onRestored = () => {
      if (disposed) return;
      const ms = mediaStateRef.current;
      ms.isContextLost = false;
      ms.hasAllocated = false;
      ms.hasUploadedData = false;
      ms.lastSizeKey = "";
      if (initGLResources()) {
        uploadActiveSourceRef.current();
        startLoopRef.current();
        callbacksRef.current.onContextRestored?.();
      }
    };

    canvas.addEventListener("webglcontextlost", onLost);
    canvas.addEventListener("webglcontextrestored", onRestored);

    return () => {
      disposed = true;
      scheduleDrawRef.current = () => {};
      drawRef.current = () => {};
      if (previewRef) previewRef.current = null;
      if (pendingDrawRaf) cancelAnimationFrame(pendingDrawRaf);
      ro.disconnect();
      document.removeEventListener("visibilitychange", onVisibility);
      canvas.removeEventListener("webglcontextlost", onLost);
      canvas.removeEventListener("webglcontextrestored", onRestored);
      cleanupGLResources(true);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Bind current media source (photo or video) to the persistent WebGL context.
  useEffect(() => {
    const ms = mediaStateRef.current;
    ms.videoEl = videoEl;
    ms.imageEl = imageEl;
    ms.texW = 0;
    ms.texH = 0;
    ms.hasAllocated = false;
    ms.hasUploadedData = false;
    ms.needsFrameUpload = false;
    ms.lastUploadedTime = -1;
    ms.lastPresentedFrames = -1;
    ms.lastSizeKey = "";

    let cancelled = false;
    let rafId = 0;
    let vfcId = 0;

    const uploadPhoto = () => {
      const res = glStateRef.current;
      if (cancelled || !imageEl || !res || ms.isContextLost || res.gl.isContextLost()) return;
      const iw = imageEl.naturalWidth || imageEl.width || 0;
      const ih = imageEl.naturalHeight || imageEl.height || 0;
      if (iw <= 0 || ih <= 0) return;

      const texCap = Math.min(res.maxTex, 1920);
      const scale = Math.min(1, texCap / Math.max(iw, ih));
      const tw = Math.max(2, Math.round(iw * scale));
      const th = Math.max(2, Math.round(ih * scale));

      const uploadPhotoSource = (src) => {
        const curRes = glStateRef.current;
        if (cancelled || !curRes || ms.isContextLost || curRes.gl.isContextLost()) return;
        const { gl, texture } = curRes;
        gl.activeTexture(gl.TEXTURE0);
        gl.bindTexture(gl.TEXTURE_2D, texture);
        // Keep UNPACK_FLIP_Y_WEBGL false; vertical UV flip is handled via uFlipY in shader.
        gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, src);
        ms.texW = tw;
        ms.texH = th;
        ms.hasAllocated = true;
        ms.hasUploadedData = true;
        ms.lastSizeKey = "";
        drawRef.current(false);
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
            if (cancelled) return;
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
    };

    const uploadVideoOrMeta = () => {
      if (!videoEl || cancelled) return;
      if (videoEl.readyState >= 2) {
        ms.needsFrameUpload = true;
        drawRef.current(true);
      }
    };

    uploadActiveSourceRef.current = () => {
      if (videoEl) {
        uploadVideoOrMeta();
      } else if (imageEl) {
        uploadPhoto();
      }
    };

    const useVfc = videoEl && typeof videoEl.requestVideoFrameCallback === "function";

    const loopVfc = (_now, metadata) => {
      vfcId = 0;
      if (cancelled || !videoEl || videoEl.paused || videoEl.ended || !isActiveRef.current) return;
      if (!document.hidden) {
        const pf = metadata?.presentedFrames;
        if (pf === undefined || pf !== ms.lastPresentedFrames) {
          if (pf !== undefined) ms.lastPresentedFrames = pf;
          ms.needsFrameUpload = true;
          drawRef.current(true);
        }
      }
      vfcId = videoEl.requestVideoFrameCallback(loopVfc);
    };

    const loopRaf = () => {
      rafId = 0;
      if (cancelled || !videoEl || videoEl.paused || videoEl.ended || !isActiveRef.current) return;
      if (!document.hidden) {
        if (videoEl.currentTime !== ms.lastUploadedTime) {
          ms.needsFrameUpload = true;
          drawRef.current(true);
        }
      }
      rafId = requestAnimationFrame(loopRaf);
    };

    const stopLoop = () => {
      if (vfcId && videoEl?.cancelVideoFrameCallback) {
        videoEl.cancelVideoFrameCallback(vfcId);
      }
      vfcId = 0;
      if (rafId) {
        cancelAnimationFrame(rafId);
        rafId = 0;
      }
    };

    const startLoop = () => {
      if (cancelled || !videoEl || videoEl.paused || videoEl.ended || !isActiveRef.current) return;
      if (useVfc) {
        if (!vfcId) vfcId = videoEl.requestVideoFrameCallback(loopVfc);
      } else {
        if (!rafId) rafId = requestAnimationFrame(loopRaf);
      }
    };

    startLoopRef.current = startLoop;
    stopLoopRef.current = stopLoop;

    if (videoEl) {
      const onMeta = () => {
        ms.lastSizeKey = "";
        uploadVideoOrMeta();
      };
      const onFrameEvent = () => {
        ms.needsFrameUpload = true;
        drawRef.current(true);
      };
      const onPlay = () => startLoop();
      const onPauseOrEnd = () => {
        stopLoop();
        onFrameEvent();
      };

      if (videoEl.readyState >= 1) onMeta();
      if (!videoEl.paused && !videoEl.ended) startLoop();

      videoEl.addEventListener("loadedmetadata", onMeta);
      videoEl.addEventListener("loadeddata", onFrameEvent);
      videoEl.addEventListener("seeked", onFrameEvent);
      videoEl.addEventListener("play", onPlay);
      videoEl.addEventListener("pause", onPauseOrEnd);
      videoEl.addEventListener("ended", onPauseOrEnd);

      return () => {
        cancelled = true;
        stopLoop();
        startLoopRef.current = () => {};
        stopLoopRef.current = () => {};
        uploadActiveSourceRef.current = () => {};
        videoEl.removeEventListener("loadedmetadata", onMeta);
        videoEl.removeEventListener("loadeddata", onFrameEvent);
        videoEl.removeEventListener("seeked", onFrameEvent);
        videoEl.removeEventListener("play", onPlay);
        videoEl.removeEventListener("pause", onPauseOrEnd);
        videoEl.removeEventListener("ended", onPauseOrEnd);
      };
    }

    if (imageEl) {
      uploadPhoto();
    }

    return () => {
      cancelled = true;
      startLoopRef.current = () => {};
      stopLoopRef.current = () => {};
      uploadActiveSourceRef.current = () => {};
    };
  }, [videoEl, imageEl]);

  // Sanitize params only when params prop changes (not on every 60fps video frame).
  useEffect(() => {
    sanitizedParamsRef.current = sanitizeParams(params);
    scheduleDrawRef.current();
  }, [params]);

  // Coalesced redraw when view options change.
  useEffect(() => {
    scheduleDrawRef.current();
  }, [mode, splitPos, hold, simulateLogInput, monitorMode, maxSide]);

  // Stop WebGL video loop when leaving Home tab; render 1 frame & resume when returning.
  useEffect(() => {
    if (!isActive) {
      stopLoopRef.current();
    } else {
      drawRef.current(true);
      startLoopRef.current();
    }
  }, [isActive]);

  return <canvas ref={canvasRef} className={className} />;
}
