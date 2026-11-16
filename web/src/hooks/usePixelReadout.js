import { useState, useRef, useEffect, useMemo, useCallback } from "react";
import { prepareGrade, evaluateGradeRGB } from "../utils/gradeEngine";

// Builds a <=240px sample buffer from the existing imageEl or videoEl (no duplicate Image())
// and computes hover RGB/IRE readout with 1:1 blackProtect parity.
export function usePixelReadout({
  hasImage,
  mode,
  imageEl,
  videoEl,
  containerRef,
  gradingParams,
  simulateLogInput,
}) {
  const [pixelReadout, setPixelReadout] = useState(null);
  const sampleBufferRef = useRef({ data: null, w: 0, h: 0 });

  const preparedGrade = useMemo(
    () => (gradingParams ? prepareGrade(gradingParams) : null),
    [gradingParams]
  );

  useEffect(() => {
    if (videoEl) {
      const c = document.createElement("canvas");
      const ctx = c.getContext("2d", { willReadFrequently: true });
      const syncVideoSample = () => {
        if (!videoEl.paused || videoEl.readyState < 2 || !videoEl.videoWidth) return;
        const scale = Math.min(1, 240 / Math.max(videoEl.videoWidth, videoEl.videoHeight));
        const w = Math.max(1, Math.round(videoEl.videoWidth * scale));
        const h = Math.max(1, Math.round(videoEl.videoHeight * scale));
        if (c.width !== w || c.height !== h) {
          c.width = w;
          c.height = h;
        }
        try {
          ctx.drawImage(videoEl, 0, 0, w, h);
          sampleBufferRef.current = { data: ctx.getImageData(0, 0, w, h).data, w, h };
        } catch {
          // frame not ready
        }
      };
      syncVideoSample();
      videoEl.addEventListener("loadeddata", syncVideoSample);
      videoEl.addEventListener("seeked", syncVideoSample);
      videoEl.addEventListener("pause", syncVideoSample);
      return () => {
        videoEl.removeEventListener("loadeddata", syncVideoSample);
        videoEl.removeEventListener("seeked", syncVideoSample);
        videoEl.removeEventListener("pause", syncVideoSample);
      };
    }

    if (!imageEl) {
      sampleBufferRef.current = { data: null, w: 0, h: 0 };
      return undefined;
    }

    const iw = imageEl.naturalWidth || imageEl.width || 0;
    const ih = imageEl.naturalHeight || imageEl.height || 0;
    if (iw <= 0 || ih <= 0) {
      sampleBufferRef.current = { data: null, w: 0, h: 0 };
      return undefined;
    }

    const scale = Math.min(1, 240 / Math.max(iw, ih));
    const w = Math.max(1, Math.round(iw * scale));
    const h = Math.max(1, Math.round(ih * scale));
    const c = document.createElement("canvas");
    c.width = w;
    c.height = h;
    const ctx = c.getContext("2d", { willReadFrequently: true });
    if (ctx) {
      ctx.drawImage(imageEl, 0, 0, w, h);
      sampleBufferRef.current = { data: ctx.getImageData(0, 0, w, h).data, w, h };
    }
    return undefined;
  }, [imageEl, videoEl]);

  const samplePixelAt = useCallback(
    (clientX, clientY) => {
      const buf = sampleBufferRef.current;
      if (!hasImage || !containerRef.current || mode === "side" || !buf.data || !buf.w || !buf.h) {
        setPixelReadout(null);
        return;
      }
      const rect = containerRef.current.getBoundingClientRect();
      const srcW = buf.w;
      const srcH = buf.h;
      if (rect.width <= 0 || rect.height <= 0) return;

      const containerAspect = rect.width / rect.height;
      const mediaAspect = srcW / srcH;
      let renderW = rect.width;
      let renderH = rect.height;
      let offsetX = 0;
      let offsetY = 0;
      if (mediaAspect > containerAspect) {
        renderH = rect.width / mediaAspect;
        offsetY = (rect.height - renderH) / 2;
      } else {
        renderW = rect.height * mediaAspect;
        offsetX = (rect.width - renderW) / 2;
      }

      const relX = clientX - rect.left - offsetX;
      const relY = clientY - rect.top - offsetY;
      if (relX < 0 || relY < 0 || relX > renderW || relY > renderH) {
        setPixelReadout(null);
        return;
      }

      const sx = Math.min(srcW - 1, Math.max(0, Math.floor((relX / renderW) * srcW)));
      const sy = Math.min(srcH - 1, Math.max(0, Math.floor((relY / renderH) * srcH)));
      const idx = (sy * srcW + sx) * 4;
      const r = buf.data[idx];
      const g = buf.data[idx + 1];
      const b = buf.data[idx + 2];

      const beforeIre = Math.round((0.2126 * r + 0.7152 * g + 0.0722 * b) / 2.55);
      let gr = r;
      let gg = g;
      let gb = b;
      if (preparedGrade) {
        const out = [0, 0, 0];
        evaluateGradeRGB(preparedGrade, r / 255, g / 255, b / 255, out, simulateLogInput);
        gr = Math.round(Math.max(0, Math.min(255, out[0] * 255)));
        gg = Math.round(Math.max(0, Math.min(255, out[1] * 255)));
        gb = Math.round(Math.max(0, Math.min(255, out[2] * 255)));
      }
      const gradedIre = Math.round((0.2126 * gr + 0.7152 * gg + 0.0722 * gb) / 2.55);
      setPixelReadout({ r, g, b, beforeIre, gr, gg, gb, gradedIre });
    },
    [hasImage, containerRef, mode, preparedGrade, simulateLogInput]
  );

  const clearPixelReadout = useCallback(() => {
    setPixelReadout(null);
  }, []);

  return { pixelReadout, samplePixelAt, clearPixelReadout };
}
