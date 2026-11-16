// File inspection (extension + magic bytes) and decoding for raster images,
// TIFF/HEIC and Camera RAW (embedded JPEG preview first, decoders as fallback).

export const RASTER_EXTS = ["jpg", "jpeg", "png", "webp", "avif", "bmp", "tiff", "tif", "heic", "heif"];
export const RAW_EXTS = ["dng", "cr2", "cr3", "nef", "arw", "raf", "orf", "rw2"];
export const VIDEO_EXTS = ["mp4", "webm", "mov", "m4v", "mkv"];
export const PRESET_EXTS = ["cube", "lut", "kfplug"];

export const IMAGE_ACCEPT = [...RASTER_EXTS, ...RAW_EXTS].map((e) => `.${e}`).join(",");
export const VIDEO_ACCEPT = VIDEO_EXTS.map((e) => `.${e}`).join(",");
export const PRESET_ACCEPT = PRESET_EXTS.map((e) => `.${e}`).join(",");

const MAX_FILE_BYTES = 512 * 1024 * 1024;
const NATIVE_DECODE = ["jpg", "jpeg", "png", "webp", "avif", "bmp"];

export function getExt(name = "") {
  const idx = name.lastIndexOf(".");
  return idx >= 0 ? name.slice(idx + 1).toLowerCase() : "";
}

async function readHead(file, n = 32) {
  const buf = await file.slice(0, n).arrayBuffer();
  return new Uint8Array(buf);
}

function ascii(u8, from, len) {
  let s = "";
  for (let i = from; i < from + len && i < u8.length; i++) s += String.fromCharCode(u8[i]);
  return s;
}

function sniff(h) {
  if (h[0] === 0xff && h[1] === 0xd8 && h[2] === 0xff) return "jpeg";
  if (h[0] === 0x89 && ascii(h, 1, 3) === "PNG") return "png";
  if (ascii(h, 0, 4) === "RIFF" && ascii(h, 8, 4) === "WEBP") return "webp";
  if (h[0] === 0x42 && h[1] === 0x4d) return "bmp";
  if (ascii(h, 0, 8) === "FUJIFILM") return "raf";
  if (ascii(h, 0, 4) === "IIRO" || ascii(h, 0, 4) === "IIRS" || ascii(h, 0, 4) === "MMOR") return "orf";
  if (h[0] === 0x49 && h[1] === 0x49 && h[2] === 0x55 && h[3] === 0x00) return "rw2";
  if ((h[0] === 0x49 && h[1] === 0x49 && h[2] === 0x2a && h[3] === 0x00) || (h[0] === 0x4d && h[1] === 0x4d && h[2] === 0x00 && h[3] === 0x2a)) return "tiff";
  if (h[0] === 0x1a && h[1] === 0x45 && h[2] === 0xdf && h[3] === 0xa3) return "ebml";
  if (ascii(h, 4, 4) === "ftyp") {
    const brand = ascii(h, 8, 4);
    if (brand === "crx ") return "ftyp-crx";
    if (brand === "avif" || brand === "avis") return "ftyp-avif";
    if (["heic", "heix", "hevc", "hevx", "heim", "heis", "mif1", "msf1"].includes(brand)) return "ftyp-heic";
    return "ftyp";
  }
  if (h[0] === 0x50 && h[1] === 0x4b) return "zip";
  return "unknown";
}

const TIFF_BASED_RAW = ["dng", "cr2", "nef", "arw"];

function magicMatchesExt(ext, s) {
  switch (ext) {
    case "jpg":
    case "jpeg":
      return s === "jpeg";
    case "png":
      return s === "png";
    case "webp":
      return s === "webp";
    case "bmp":
      return s === "bmp";
    case "tif":
    case "tiff":
      return s === "tiff";
    case "avif":
      return s === "ftyp-avif" || s === "ftyp";
    case "heic":
    case "heif":
      return s === "ftyp-heic" || s === "ftyp";
    case "cr3":
      return s === "ftyp-crx" || s === "ftyp";
    case "raf":
      return s === "raf";
    case "orf":
      return s === "orf" || s === "tiff";
    case "rw2":
      return s === "rw2" || s === "tiff";
    default:
      return TIFF_BASED_RAW.includes(ext) ? s === "tiff" : false;
  }
}

function labelFor(ext) {
  if (ext === "dng") return "DNG";
  if (RAW_EXTS.includes(ext)) return `RAW (${ext.toUpperCase()})`;
  if (ext === "tif" || ext === "tiff") return "TIFF";
  if (ext === "jpeg") return "JPG";
  if (ext === "heif") return "HEIC";
  return ext.toUpperCase();
}

// Returns { category: "image" | "video" | "preset" | null, ext, label, error }
export async function inspectFile(file) {
  if (!file) return { category: null, error: "No file selected." };
  if (file.size > MAX_FILE_BYTES) {
    return { category: null, error: "File is too large (limit 512 MB)." };
  }

  let ext = getExt(file.name);
  let head;
  try {
    head = await readHead(file);
  } catch {
    return { category: null, error: "Failed to read file." };
  }
  const s = sniff(head);

  if (PRESET_EXTS.includes(ext)) {
    if (ext === "kfplug" && s !== "zip") {
      return { category: null, error: "This .kfplug file is not a valid plugin archive." };
    }
    return { category: "preset", ext, label: ext.toUpperCase() };
  }

  if (VIDEO_EXTS.includes(ext)) {
    const okVideo = s === "ftyp" || s === "ftyp-heic" || s === "ftyp-avif" || s === "ftyp-crx" || s === "ebml" || ext === "mov";
    if (!okVideo) {
      return { category: null, error: `File content does not look like a .${ext} video.` };
    }
    return { category: "video", ext, label: ext.toUpperCase() };
  }

  if (!ext || (!RASTER_EXTS.includes(ext) && !RAW_EXTS.includes(ext))) {
    // Clipboard / unnamed files: fall back to MIME + magic bytes.
    const mimeToExt = { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp" };
    if (mimeToExt[file.type] && ["jpeg", "png", "webp"].includes(s)) {
      ext = mimeToExt[file.type];
    } else if (["jpeg", "png", "webp", "bmp"].includes(s) && !ext) {
      ext = s === "jpeg" ? "jpg" : s;
    } else {
      return {
        category: null,
        error: `Unsupported file format (${file.type || ext || "unknown"}). Use JPG, PNG, WEBP, AVIF, BMP, TIFF, HEIC or Camera RAW.`,
      };
    }
  }

  if (!magicMatchesExt(ext, s)) {
    return { category: null, error: `File content does not match its .${ext} extension.` };
  }

  return { category: "image", ext, label: labelFor(ext), isRaw: RAW_EXTS.includes(ext) };
}

// ---------------------------------------------------------------------------
// Embedded JPEG extraction for RAW containers
// ---------------------------------------------------------------------------

function isSOF(m) {
  return m >= 0xc0 && m <= 0xcf && m !== 0xc4 && m !== 0xc8 && m !== 0xcc;
}

function findJpegEnd(u8, start) {
  const n = u8.length;
  let i = start + 2;
  let w = 0;
  let h = 0;
  while (i + 4 <= n) {
    if (u8[i] !== 0xff) return null;
    const m = u8[i + 1];
    if (m === 0xff) {
      i++;
      continue;
    }
    if (m === 0xd8 || (m >= 0xd0 && m <= 0xd7) || m === 0x01) {
      i += 2;
      continue;
    }
    if (m === 0xd9) return { end: i + 2, w, h };
    const len = (u8[i + 2] << 8) | u8[i + 3];
    if (len < 2) return null;
    if (isSOF(m) && i + 9 < n) {
      h = (u8[i + 5] << 8) | u8[i + 6];
      w = (u8[i + 7] << 8) | u8[i + 8];
    }
    if (m === 0xda) {
      i += 2 + len;
      while (i + 1 < n) {
        if (u8[i] === 0xff) {
          const nx = u8[i + 1];
          if (nx === 0x00 || (nx >= 0xd0 && nx <= 0xd7)) {
            i += 2;
            continue;
          }
          if (nx === 0xff) {
            i++;
            continue;
          }
          break;
        }
        i++;
      }
      continue;
    }
    i += 2 + len;
  }
  return null;
}

export function findEmbeddedJpegs(u8) {
  const found = [];
  const n = u8.length;
  let i = 0;
  while (i < n - 3) {
    i = u8.indexOf(0xff, i);
    if (i < 0 || i >= n - 3) break;
    if (u8[i + 1] === 0xd8 && u8[i + 2] === 0xff) {
      const res = findJpegEnd(u8, i);
      if (res && res.end - i > 20000) {
        found.push({ start: i, end: res.end, w: res.w, h: res.h, bytes: res.end - i });
        i = res.end;
        continue;
      }
    }
    i++;
  }
  // Largest pixel count first, then largest byte size.
  found.sort((a, b) => b.w * b.h - a.w * a.h || b.bytes - a.bytes);
  return found;
}

function decodeCheck(blob) {
  return new Promise((resolve) => {
    const url = URL.createObjectURL(blob);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      resolve(img.naturalWidth > 0);
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      resolve(false);
    };
    img.src = url;
  });
}

function srgbEncodeLut() {
  const t = new Uint8Array(256);
  for (let i = 0; i < 256; i++) {
    const c = i / 255;
    const v = c <= 0.0031308 ? c * 12.92 : 1.055 * Math.pow(c, 1 / 2.4) - 0.055;
    t[i] = Math.round(Math.min(1, Math.max(0, v)) * 255);
  }
  return t;
}

const MAX_TIFF_DECODE_DIM = 2560;
const RAW_SCAN_CHUNK_BYTES = 2 * 1024 * 1024;
const MAX_EMBEDDED_JPEG_BYTES = 16 * 1024 * 1024;

async function findEmbeddedJpegsFromFile(file) {
  const found = [];
  const totalSize = file.size;
  let offset = 0;

  while (offset < totalSize - 3) {
    const chunkEnd = Math.min(totalSize, offset + RAW_SCAN_CHUNK_BYTES + 3);
    const chunkU8 = new Uint8Array(await file.slice(offset, chunkEnd).arrayBuffer());
    const limit = chunkU8.length - 3;
    let i = 0;
    let jumped = false;

    while (i < limit) {
      i = chunkU8.indexOf(0xff, i);
      if (i < 0 || i >= limit) break;
      if (chunkU8[i + 1] === 0xd8 && chunkU8[i + 2] === 0xff) {
        const soiOffset = offset + i;
        let res = findJpegEnd(chunkU8, i);
        let relEnd = res ? res.end - i : 0;

        if (!res && soiOffset + chunkU8.length - i < totalSize) {
          const probeEnd = Math.min(totalSize, soiOffset + MAX_EMBEDDED_JPEG_BYTES);
          const probeU8 = new Uint8Array(await file.slice(soiOffset, probeEnd).arrayBuffer());
          res = findJpegEnd(probeU8, 0);
          relEnd = res ? res.end : 0;
        }

        if (res && relEnd > 20000) {
          found.push({
            start: soiOffset,
            end: soiOffset + relEnd,
            w: res.w,
            h: res.h,
            bytes: relEnd,
          });
          const nextFileOffset = soiOffset + relEnd;
          if (nextFileOffset >= offset + RAW_SCAN_CHUNK_BYTES) {
            offset = nextFileOffset;
            jumped = true;
            break;
          }
          i += relEnd;
          continue;
        }
      }
      i++;
    }

    if (!jumped) {
      offset += RAW_SCAN_CHUNK_BYTES;
    }
  }

  found.sort((a, b) => b.w * b.h - a.w * a.h || b.bytes - a.bytes);
  return found;
}

async function decodeTiffLike(file) {
  const mod = await import("utif");
  const UTIF = mod.default || mod;
  const buf = await file.arrayBuffer();
  const ifds = UTIF.decode(buf);
  const all = [];
  const walk = (list) =>
    list.forEach((ifd) => {
      all.push(ifd);
      if (ifd.subIFD) walk(ifd.subIFD);
    });
  walk(ifds);
  const candidates = all
    .filter((ifd) => ifd.t256 && ifd.t257)
    .sort((a, b) => b.t256[0] * b.t257[0] - a.t256[0] * a.t257[0]);

  for (const ifd of candidates) {
    try {
      UTIF.decodeImage(buf, ifd);
      if (!ifd.data || !ifd.width || !ifd.height) continue;
      const rgba = UTIF.toRGBA8(ifd);
      const bps = ifd.t258 ? ifd.t258[0] : 8;
      if (bps === 16) {
        // Linear 16-bit data: encode to display gamma (sRGB / Rec.709-like).
        const lut = srgbEncodeLut();
        for (let i = 0; i < rgba.length; i += 4) {
          rgba[i] = lut[rgba[i]];
          rgba[i + 1] = lut[rgba[i + 1]];
          rgba[i + 2] = lut[rgba[i + 2]];
        }
      }
      const srcCanvas = document.createElement("canvas");
      srcCanvas.width = ifd.width;
      srcCanvas.height = ifd.height;
      const srcCtx = srcCanvas.getContext("2d");
      const imgData = srcCtx.createImageData(ifd.width, ifd.height);
      imgData.data.set(new Uint8ClampedArray(rgba.buffer, rgba.byteOffset, ifd.width * ifd.height * 4));
      srcCtx.putImageData(imgData, 0, 0);

      const scale = Math.min(1, MAX_TIFF_DECODE_DIM / Math.max(ifd.width, ifd.height));
      let outCanvas = srcCanvas;
      if (scale < 1) {
        outCanvas = document.createElement("canvas");
        outCanvas.width = Math.max(1, Math.round(ifd.width * scale));
        outCanvas.height = Math.max(1, Math.round(ifd.height * scale));
        const outCtx = outCanvas.getContext("2d");
        outCtx.drawImage(srcCanvas, 0, 0, outCanvas.width, outCanvas.height);
        srcCanvas.width = 0;
        srcCanvas.height = 0;
      }

      const blob = await new Promise((res) => outCanvas.toBlob(res, "image/jpeg", 0.92));
      outCanvas.width = 0;
      outCanvas.height = 0;
      if (blob) return blob;
    } catch {
      // try next IFD
    }
  }
  throw new Error("Could not decode this TIFF/DNG (no readable image data).");
}

// Returns { blob, source } where blob is a browser-decodable image.
export async function prepareImageBlob(file, info) {
  const { ext } = info;

  if (info.isRaw) {
    const jpegs = await findEmbeddedJpegsFromFile(file);
    for (const j of jpegs.slice(0, 4)) {
      const blob = file.slice(j.start, j.end, "image/jpeg");
      if (await decodeCheck(blob)) return { blob, source: "embedded-preview" };
    }
    if (TIFF_BASED_RAW.includes(ext) || ext === "orf" || ext === "rw2") {
      try {
        return { blob: await decodeTiffLike(file), source: "tiff-decoder" };
      } catch {
        // fall through to error
      }
    }
    throw new Error(
      `No embedded preview found in this ${ext.toUpperCase()} file and it could not be decoded. Export a JPEG/TIFF from your RAW developer instead.`
    );
  }

  if (ext === "tif" || ext === "tiff") {
    return { blob: await decodeTiffLike(file), source: "tiff-decoder" };
  }

  if (ext === "heic" || ext === "heif") {
    const mod = await import("heic2any");
    const heic2any = mod.default || mod;
    const out = await heic2any({ blob: file, toType: "image/jpeg", quality: 0.95 });
    const blob = Array.isArray(out) ? out[0] : out;
    return { blob, source: "heic-decoder" };
  }

  if (NATIVE_DECODE.includes(ext)) {
    return { blob: file, source: "native" };
  }

  throw new Error(`Unsupported image format .${ext}.`);
}
