import React, { useEffect, useRef } from "react";
import { PREVIEW_VERTEX, PREVIEW_FRAGMENT, UNIFORM_MAP } from "../utils/gradeShader";
import { sanitizeParams } from "../utils/gradeEngine";

const MODE_VALUE = { result: 0, split: 1, side: 2 };
const MAX_SIDE = 1920;

function compile(gl, type, src) {
  const sh = gl.createShader(type);
  gl.shaderSource(sh, src);
  gl.compileShader(sh);
  if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) {
    const log = gl.getShaderInfoLog(sh);
    gl.deleteShader(sh);
    throw new Error(`Shader compile failed: ${log}`);
  }
  return sh;
}

// Real-time WebGL fragment shader preview for video (same grading function as .kfplug).
export default function VideoGLCanvas({
  videoEl,
  params,
  mode,
  splitPos,
  hold,
  simulateLogInput = false,
  onError,
  className = "",
}) {
  const canvasRef = useRef(null);
  const stateRef = useRef({ params, mode, splitPos, hold, simulateLogInput });
  const drawRef = useRef(() => {});

  stateRef.current = { params, mode, splitPos, hold, simulateLogInput };

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !videoEl) return undefined;

    const gl =
      canvas.getContext("webgl", {
        antialias: false,
        alpha: false,
        depth: false,
        stencil: false,
        powerPreference: "high-performance",
      }) || null;

    if (!gl) {
      if (onError) onError("WebGL is not available in this browser.");
      return undefined;
    }

    let program;
    let texture;
    let buffer;
    try {
      const vs = compile(gl, gl.VERTEX_SHADER, PREVIEW_VERTEX);
      const fs = compile(gl, gl.FRAGMENT_SHADER, PREVIEW_FRAGMENT);
      program = gl.createProgram();
      gl.attachShader(program, vs);
      gl.attachShader(program, fs);
      gl.linkProgram(program);
      if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
        throw new Error("Shader link failed.");
      }
    } catch (err) {
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
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);
    gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);

    const loc = {};
    UNIFORM_MAP.forEach(([, uName]) => {
      loc[uName] = gl.getUniformLocation(program, uName);
    });
    const uMode = gl.getUniformLocation(program, "uMode");
    const uSplit = gl.getUniformLocation(program, "uSplit");
    const uHold = gl.getUniformLocation(program, "uHold");
    const uLogInput = gl.getUniformLocation(program, "uLogInput");
    gl.uniform1i(gl.getUniformLocation(program, "uTexture"), 0);

    const maxTex = gl.getParameter(gl.MAX_TEXTURE_SIZE);
    if (videoEl.videoWidth > maxTex || videoEl.videoHeight > maxTex) {
      if (onError) onError("Video resolution exceeds this GPU's texture limit.");
      return undefined;
    }

    let disposed = false;
    let rafId = 0;
    let vfcId = 0;
    let texW = 0;
    let texH = 0;
    let lastUploadedTime = -1;

    const resize = (side) => {
      const vw = videoEl.videoWidth || 1280;
      const vh = videoEl.videoHeight || 720;
      const scale = Math.min(1, MAX_SIDE / Math.max(vw, vh));
      const w = Math.max(2, Math.round(vw * scale)) * (side ? 2 : 1);
      const h = Math.max(2, Math.round(vh * scale));
      if (canvas.width !== w || canvas.height !== h) {
        canvas.width = w;
        canvas.height = h;
      }
      gl.viewport(0, 0, canvas.width, canvas.height);
    };

    const draw = (forceUpload = false) => {
      if (disposed || gl.isContextLost()) return;
      if (videoEl.readyState < 2) return;
      const st = stateRef.current;
      resize(st.mode === "side");

      const safe = sanitizeParams(st.params);
      UNIFORM_MAP.forEach(([key, uName]) => {
        gl.uniform1f(loc[uName], safe[key]);
      });
      gl.uniform1f(uMode, MODE_VALUE[st.mode] ?? 1);
      gl.uniform1f(uSplit, Math.min(1, Math.max(0, st.splitPos / 100)));
      gl.uniform1f(uHold, st.hold ? 1 : 0);
      if (uLogInput !== null) {
        gl.uniform1f(uLogInput, st.simulateLogInput ? 1 : 0);
      }

      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, texture);

      const vw = videoEl.videoWidth || 0;
      const vh = videoEl.videoHeight || 0;
      const frameChanged = videoEl.currentTime !== lastUploadedTime;
      if (vw > 0 && vh > 0 && (texW !== vw || texH !== vh)) {
        try {
          gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, videoEl);
          texW = vw;
          texH = vh;
          lastUploadedTime = videoEl.currentTime;
        } catch {
          if (onError) onError("Could not upload video frames to the GPU.");
          return;
        }
      } else if (forceUpload || (!videoEl.paused && frameChanged)) {
        try {
          gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, gl.RGBA, gl.UNSIGNED_BYTE, videoEl);
          lastUploadedTime = videoEl.currentTime;
        } catch {
          if (onError) onError("Could not upload video frames to the GPU.");
          return;
        }
      }
      gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    };
    drawRef.current = draw;

    const useVfc = typeof videoEl.requestVideoFrameCallback === "function";
    const loopVfc = () => {
      if (disposed) return;
      if (!videoEl.paused && !videoEl.ended) draw(true);
      vfcId = videoEl.requestVideoFrameCallback(loopVfc);
    };
    const loopRaf = () => {
      if (disposed) return;
      if (!videoEl.paused && !videoEl.ended) draw(false);
      rafId = requestAnimationFrame(loopRaf);
    };
    if (useVfc) vfcId = videoEl.requestVideoFrameCallback(loopVfc);
    else rafId = requestAnimationFrame(loopRaf);

    const redraw = () => draw(true);
    videoEl.addEventListener("seeked", redraw);
    videoEl.addEventListener("loadeddata", redraw);
    videoEl.addEventListener("pause", redraw);
    const onLost = (e) => {
      e.preventDefault();
      if (onError) onError("GPU context was lost. Reload the video to continue.");
    };
    canvas.addEventListener("webglcontextlost", onLost);

    draw();

    return () => {
      disposed = true;
      drawRef.current = () => {};
      if (vfcId && videoEl.cancelVideoFrameCallback) videoEl.cancelVideoFrameCallback(vfcId);
      if (rafId) cancelAnimationFrame(rafId);
      videoEl.removeEventListener("seeked", redraw);
      videoEl.removeEventListener("loadeddata", redraw);
      videoEl.removeEventListener("pause", redraw);
      canvas.removeEventListener("webglcontextlost", onLost);
      try {
        gl.deleteTexture(texture);
        gl.deleteBuffer(buffer);
        gl.deleteProgram(program);
      } catch {
        // context may already be gone
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [videoEl]);

  // Redraw immediately when controls change while paused.
  useEffect(() => {
    drawRef.current();
  }, [params, mode, splitPos, hold, simulateLogInput]);

  return <canvas ref={canvasRef} className={className} />;
}
