import { useRef, useCallback } from "react";
import { inspectFile, prepareImageBlob } from "../utils/rawDecoder";
import { sanitizeMetadataText } from "../utils/hostGuard";

function createThumbnailUrl(source, maxDim = 512) {
  return new Promise((resolve) => {
    const sw = source.videoWidth || source.naturalWidth || 0;
    const sh = source.videoHeight || source.naturalHeight || 0;
    if (!sw || !sh) {
      resolve("");
      return;
    }
    const scale = Math.min(1, maxDim / Math.max(sw, sh));
    const w = Math.max(1, Math.round(sw * scale));
    const h = Math.max(1, Math.round(sh * scale));
    const tc = document.createElement("canvas");
    tc.width = w;
    tc.height = h;
    const tctx = tc.getContext("2d");
    if (!tctx) {
      resolve("");
      return;
    }
    tctx.drawImage(source, 0, 0, w, h);
    tc.toBlob(
      (blob) => {
        tc.width = 0;
        tc.height = 0;
        resolve(blob ? URL.createObjectURL(blob) : "");
      },
      "image/jpeg",
      0.82
    );
  });
}

export function revokeMediaUrls(item) {
  if (!item) return;
  if (item.thumbUrl && item.thumbUrl !== item.objectUrl && item.thumbUrl.startsWith("blob:")) {
    try {
      URL.revokeObjectURL(item.thumbUrl);
    } catch {
      // ignore
    }
  }
  if (item.objectUrl) {
    try {
      URL.revokeObjectURL(item.objectUrl);
    } catch {
      // ignore
    }
  }
  if (item.videoUrl) {
    try {
      URL.revokeObjectURL(item.videoUrl);
    } catch {
      // ignore
    }
  }
}

export function useMediaLoader({
  referenceRef,
  targetRef,
  setReferenceImage,
  setTargetImage,
  setSlotError,
  setStatusText,
  computeFrameMeanLuma,
  onImportPreset,
  onReferenceLoaded,
}) {
  // Per-slot queue tokens prevent stale async decodes from overwriting newer uploads.
  const loadTokenRef = useRef({ reference: 0, target: 0 });

  const cancelSlotLoad = useCallback((slot) => {
    loadTokenRef.current[slot] = (loadTokenRef.current[slot] || 0) + 1;
  }, []);

  const replaceReference = useCallback(
    (next) => {
      revokeMediaUrls(referenceRef.current);
      referenceRef.current = next;
      setReferenceImage(next);
    },
    [referenceRef, setReferenceImage]
  );

  const replaceTarget = useCallback(
    (next) => {
      const prev = targetRef.current;
      if (prev && prev.kind === "video") {
        try {
          prev.videoEl.pause();
          prev.videoEl.removeAttribute("src");
          prev.videoEl.load();
        } catch {
          // ignore teardown errors
        }
      }
      revokeMediaUrls(prev);
      targetRef.current = next;
      setTargetImage(next);
    },
    [targetRef, setTargetImage]
  );

  const loadVideoFile = useCallback(
    (file, meta, token) => {
      setSlotError("target", "");
      setStatusText("Loading video...");
      const url = URL.createObjectURL(file);
      const v = document.createElement("video");
      v.muted = true;
      v.loop = true;
      v.playsInline = true;
      v.preload = "auto";

      let settled = false;
      const fail = (msg, silent = false) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        try {
          v.removeAttribute("src");
          v.load();
        } catch {
          // ignore
        }
        URL.revokeObjectURL(url);
        if (!silent && token === loadTokenRef.current.target) {
          setSlotError("target", msg);
          setStatusText("Video Error");
        }
      };

      const timer = setTimeout(
        () =>
          fail(
            `Could not load this ${meta.label} video (timed out). The codec may not be supported by this browser.`
          ),
        20000
      );

      v.onerror = () =>
        fail(
          `This ${meta.label} video uses a codec or container this browser cannot play. Try MP4 (H.264) or WEBM (VP9).`
        );

      v.onloadeddata = async () => {
        if (settled) return;
        if (token !== loadTokenRef.current.target) {
          fail("", true);
          return;
        }
        if (!v.videoWidth || !v.videoHeight) {
          fail("This video has no decodable picture track (audio-only or unsupported codec).");
          return;
        }
        settled = true;
        clearTimeout(timer);
        v.onerror = () => setSlotError("target", "Video playback error.");

        let poster = "";
        try {
          const pw = Math.min(512, v.videoWidth);
          const ph = Math.max(1, Math.round((pw * v.videoHeight) / v.videoWidth));
          const pc = document.createElement("canvas");
          pc.width = pw;
          pc.height = ph;
          const pctx = pc.getContext("2d", { willReadFrequently: true });
          pctx.drawImage(v, 0, 0, pw, ph);
          let luma = computeFrameMeanLuma(pctx.getImageData(0, 0, pw, ph).data);

          const dur = Number.isFinite(v.duration) ? v.duration : 0;
          if (luma < 0.08 && dur > 0.25) {
            const seekTargets = [Math.min(dur * 0.25, 2.0), dur * 0.5].filter(
              (ts) => ts > 0.05 && ts < dur - 0.05
            );
            for (const ts of seekTargets) {
              await new Promise((resolve) => {
                const t = setTimeout(resolve, 1000);
                const onSeek = () => {
                  v.removeEventListener("seeked", onSeek);
                  clearTimeout(t);
                  requestAnimationFrame(() => resolve());
                };
                v.addEventListener("seeked", onSeek);
                v.currentTime = ts;
              });
              if (token !== loadTokenRef.current.target) break;
              pctx.drawImage(v, 0, 0, pw, ph);
              luma = computeFrameMeanLuma(pctx.getImageData(0, 0, pw, ph).data);
              if (luma >= 0.08) break;
            }
          }
          const thumbBlob = await new Promise((res) => pc.toBlob(res, "image/jpeg", 0.82));
          pc.width = 0;
          pc.height = 0;
          poster = thumbBlob ? URL.createObjectURL(thumbBlob) : "";
          if (v.currentTime > 0.05) {
            v.currentTime = 0;
          }
        } catch {
          poster = "";
        }

        if (token !== loadTokenRef.current.target) {
          if (poster) URL.revokeObjectURL(poster);
          try {
            v.removeAttribute("src");
            v.load();
          } catch {
            // ignore
          }
          URL.revokeObjectURL(url);
          return;
        }

        const rawBase = file.name.replace(/\.[^/.]+$/, "");
        replaceTarget({
          kind: "video",
          name: sanitizeMetadataText(file.name, "video", 80),
          baseName: sanitizeMetadataText(rawBase, "Target", 48),
          width: v.videoWidth,
          height: v.videoHeight,
          ext: meta.ext.toUpperCase(),
          formatBadge: `VIDEO (${meta.ext.toUpperCase()})`,
          sizeMB: (file.size / (1024 * 1024)).toFixed(1),
          dataUrl: poster,
          thumbUrl: poster,
          imgElement: null,
          videoEl: v,
          videoUrl: url,
        });
        setStatusText("Video Ready");
        v.play().catch(() => {});
      };

      v.src = url;
      v.load();
    },
    [setSlotError, setStatusText, computeFrameMeanLuma, replaceTarget]
  );

  const loadImageFile = useCallback(
    async (file, type) => {
      if (!file) return;
      const token = ++loadTokenRef.current[type];
      setSlotError(type, "");

      const meta = await inspectFile(file);
      if (token !== loadTokenRef.current[type]) return;

      if (meta.category === "preset") {
        if (type === "reference") {
          await onImportPreset(file, meta);
        } else {
          setSlotError(type, "LUT and plugin files can only be imported into the REFERENCE slot.");
        }
        return;
      }

      if (meta.category === "video") {
        if (type === "target") {
          loadVideoFile(file, meta, token);
        } else {
          setSlotError(type, "Video files are supported in the TARGET slot only.");
        }
        return;
      }

      if (meta.category !== "image") {
        setSlotError(type, meta.error || "Unsupported file format.");
        setStatusText("Invalid File");
        return;
      }

      setStatusText(`Decoding ${meta.label}...`);
      let prepared;
      try {
        prepared = await prepareImageBlob(file, meta);
      } catch (err) {
        if (token !== loadTokenRef.current[type]) return;
        setSlotError(type, (err && err.message) || "Failed to decode this image.");
        setStatusText("Decode Error");
        return;
      }

      if (token !== loadTokenRef.current[type]) return;

      const objectUrl = URL.createObjectURL(prepared.blob);
      const img = new Image();

      img.onerror = () => {
        URL.revokeObjectURL(objectUrl);
        if (token !== loadTokenRef.current[type]) return;
        setSlotError(
          type,
          `This ${meta.label} image could not be decoded by the browser. Try exporting it as JPG or PNG.`
        );
        setStatusText("Invalid Image");
      };

      img.onload = async () => {
        if (token !== loadTokenRef.current[type]) {
          URL.revokeObjectURL(objectUrl);
          return;
        }
        if (img.naturalWidth < 1 || img.naturalHeight < 1) {
          URL.revokeObjectURL(objectUrl);
          setSlotError(type, "Invalid image dimensions.");
          return;
        }

        const sizeMB = (file.size / (1024 * 1024)).toFixed(1);
        const rawBaseName = file.name.replace(/\.[^/.]+$/, "");
        const baseName = sanitizeMetadataText(rawBaseName, "Reference", 48);

        let thumbUrl = "";
        if (Math.max(img.naturalWidth, img.naturalHeight) > 512) {
          try {
            thumbUrl = await createThumbnailUrl(img, 512);
          } catch {
            thumbUrl = "";
          }
        }

        if (token !== loadTokenRef.current[type]) {
          if (thumbUrl) URL.revokeObjectURL(thumbUrl);
          URL.revokeObjectURL(objectUrl);
          return;
        }

        const info = {
          kind: "image",
          name: sanitizeMetadataText(file.name, "image.png", 80),
          baseName,
          width: img.naturalWidth,
          height: img.naturalHeight,
          ext: meta.ext.toUpperCase(),
          formatBadge: meta.label,
          sizeMB,
          dataUrl: objectUrl,
          thumbUrl: thumbUrl || objectUrl,
          objectUrl,
          imgElement: img,
        };

        if (type === "reference") {
          replaceReference(info);
          onReferenceLoaded(info);
        } else {
          replaceTarget(info);
          setStatusText("Target Ready");
        }
      };
      img.src = objectUrl;
    },
    [
      setSlotError,
      setStatusText,
      onImportPreset,
      loadVideoFile,
      replaceReference,
      replaceTarget,
      onReferenceLoaded,
    ]
  );

  return {
    loadImageFile,
    replaceReference,
    replaceTarget,
    cancelSlotLoad,
  };
}
