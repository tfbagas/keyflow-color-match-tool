import qrcode from "qrcode-generator";
import { DEFAULT_PARAMS, sanitizeParams } from "./gradeEngine.js";
import { DEFAULT_ENGINE_ID, resolveEngineId } from "./engineRegistry.js";
import { DEFAULT_LOG_PROFILE, resolveLogProfileId } from "./logProfiles.js";

const SCALAR_KEYS = [
  "gradeMix",
  "exposure",
  "contrast",
  "pivot",
  "shadows",
  "highlights",
  "temp",
  "tint",
  "sat",
  "vib",
  "liftR",
  "liftG",
  "liftB",
  "gammaR",
  "gammaG",
  "gammaB",
  "gainR",
  "gainG",
  "gainB",
  "autoGradeMix",
];

function toBase64Url(bytes) {
  let bin = "";
  for (let i = 0; i < bytes.length; i++) {
    bin += String.fromCharCode(bytes[i]);
  }
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function fromBase64Url(str) {
  const padded = str.replace(/-/g, "+").replace(/_/g, "/") + "===".slice((str.length + 3) % 4);
  const bin = atob(padded);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) {
    bytes[i] = bin.charCodeAt(i);
  }
  return bytes;
}

export function encodeGradeToHash({
  engineId = DEFAULT_ENGINE_ID,
  logProfile = DEFAULT_LOG_PROFILE,
  matchStrength = 100,
  params = DEFAULT_PARAMS,
}) {
  const safe = sanitizeParams(params);
  const strengthInt = Math.max(
    0,
    Math.min(100, Math.round(Number.isFinite(matchStrength) ? matchStrength : 100))
  );
  const compactArray = [
    2,
    resolveEngineId(engineId || DEFAULT_ENGINE_ID),
    resolveLogProfileId(logProfile),
    strengthInt,
    ...SCALAR_KEYS.map((key) => Math.round((safe[key] ?? DEFAULT_PARAMS[key] ?? 0) * 1000) / 1000),
  ];
  const json = JSON.stringify(compactArray);
  const bytes = new TextEncoder().encode(json);
  return `#g=${toBase64Url(bytes)}`;
}

export function decodeGradeFromHash(hashStr) {
  if (!hashStr || typeof hashStr !== "string") return null;
  const match = hashStr.match(/#?g=([A-Za-z0-9_-]+)/);
  if (!match) return null;
  try {
    const bytes = fromBase64Url(match[1]);
    const json = new TextDecoder().decode(bytes);
    const data = JSON.parse(json);
    if (!data || typeof data !== "object") return null;

    const merged = { ...DEFAULT_PARAMS };

    // Compact v2 array payload: [2, engineId, logProfile, matchStrength, ...SCALAR_KEYS]
    if (Array.isArray(data) && data[0] === 2) {
      for (let i = 0; i < SCALAR_KEYS.length; i++) {
        const val = data[4 + i];
        if (typeof val === "number" && Number.isFinite(val)) {
          merged[SCALAR_KEYS[i]] = val;
        }
      }
      const engineId = resolveEngineId(data[1]);
      const logProfile = resolveLogProfileId(data[2] || DEFAULT_LOG_PROFILE);
      const matchStrength =
        typeof data[3] === "number" && Number.isFinite(data[3])
          ? Math.max(0, Math.min(100, Math.round(data[3])))
          : 100;
      return {
        engineId,
        logProfile,
        matchStrength,
        params: sanitizeParams(merged),
      };
    }

    // Legacy v1 object payload: { v: 1, e, l, s, p }
    if (data.p && typeof data.p === "object") {
      for (const key of SCALAR_KEYS) {
        if (typeof data.p[key] === "number" && Number.isFinite(data.p[key])) {
          merged[key] = data.p[key];
        }
      }
    }
    const engineId = resolveEngineId(data.e);
    const logProfile = resolveLogProfileId(data.l || DEFAULT_LOG_PROFILE);
    const matchStrength =
      typeof data.s === "number" && Number.isFinite(data.s)
        ? Math.max(0, Math.min(100, Math.round(data.s)))
        : 100;

    return {
      engineId,
      logProfile,
      matchStrength,
      params: sanitizeParams(merged),
    };
  } catch {
    return null;
  }
}

export function generateQrMatrix(text) {
  const qr = qrcode(0, "M");
  qr.addData(String(text || ""));
  qr.make();
  const count = qr.getModuleCount();
  const matrix = [];
  for (let r = 0; r < count; r++) {
    const row = new Uint8Array(count);
    for (let c = 0; c < count; c++) {
      row[c] = qr.isDark(r, c) ? 1 : 0;
    }
    matrix.push(row);
  }
  return matrix;
}
