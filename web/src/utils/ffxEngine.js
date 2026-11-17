import ffxOffsetMap from "./ffxOffsetMap.json";
import lumetriTemplateUrl from "../assets/Lumetri_Template.ffx?url";
import { DEFAULT_PARAMS, clamp, sanitizeParams } from "./gradeEngine.js";
import { sanitizeMetadataText } from "./hostGuard.js";
import { bakeLogProfileIntoLumetriParams } from "./logProfiles.js";
import { TRANSLATIONS } from "../i18n/translations.js";

let cachedTemplateBuffer = null;

const SUPPORTED_COLOR_EFFECTS = {
  "adbe lumetri": "Lumetri Color",
  "adbe exposure2": "Exposure",
  "adbe exposure": "Exposure",
  "adbe vibrance": "Vibrance",
  "adbe hue saturation": "Hue/Saturation",
  "adbe tint": "Tint",
  "adbe levels2": "Levels",
  "adbe levels": "Levels",
  "adbe pro levels2": "Levels (Individual Controls)",
  "adbe pro levels": "Levels (Individual Controls)",
  "adbe curvescustom": "Curves",
  "adbe color balance (hls)": "Color Balance (HLS)",
  "adbe color balance 2": "Color Balance",
  "adbe color balance": "Color Balance",
  "adbe brightness & contrast 2": "Brightness & Contrast",
  "adbe brightness & contrast": "Brightness & Contrast",
  "adbe photofilter": "Photo Filter",
  "adbe selective color": "Selective Color",
  "adbe channel mixer": "Channel Mixer",
  "adbe tritone": "Tritone",
  "adbe black & white": "Black & White",
  "adbe gamma/pedestal/gain2": "Gamma/Pedestal/Gain",
  "adbe gamma/pedestal/gain": "Gamma/Pedestal/Gain",
  "mb looksuite3": "Magic Bullet Looks",
  "mb looksuite2": "Magic Bullet Looks",
  "mb looksuite": "Magic Bullet Looks",
  "mbl3": "Magic Bullet Looks",
  "mbl2": "Magic Bullet Looks",
  "s_huesatbright": "Sapphire HueSatBright",
  "s_colorbalance": "Sapphire ColorBalance",
  "s_gamma": "Sapphire Gamma",
  "s_tint": "Sapphire Tint",
};

const BCC_COLOR_RE =
  /^bcc\d*\s*(color|hue|sat|curve|level|bright|contrast|tritone|tint|gamma|exposure|looks|grade|balance|white)/i;

function resolveSupportedColorLabel(prefix = "") {
  const clean = String(prefix || "").trim();
  if (!clean) return null;
  const lower = clean.toLowerCase();
  if (SUPPORTED_COLOR_EFFECTS[lower]) return SUPPORTED_COLOR_EFFECTS[lower];
  if (BCC_COLOR_RE.test(clean)) return clean;
  return null;
}

const STRUCTURAL_MATCH_NAMES = new Set([
  "ADBE Effect Built In Params",
  "ADBE Effect Mask Parade",
  "ADBE Effect Mask Opacity",
  "ADBE Force CPU GPU",
  "ADBE Group End",
  "ADBE Layer Overrides",
  "ADBE Effect Parade",
  "ADBE End of path sentinel",
]);

function round2(v) {
  return Math.round(v * 100) / 100;
}

function readFourCC(u8, offset) {
  if (offset + 4 > u8.length) return "";
  return String.fromCharCode(
    u8[offset],
    u8[offset + 1],
    u8[offset + 2],
    u8[offset + 3]
  );
}

function decodeAsciiString(u8, start, len) {
  let out = "";
  const end = Math.min(u8.length, start + len);
  for (let i = start; i < end; i++) {
    const c = u8[i];
    if (c >= 32 && c < 127) out += String.fromCharCode(c);
  }
  return out.trim();
}

// Converts an Argan Color Studio 3-Way Wheel RGB triplet (0..1, neutral 0.5)
// into Lumetri Color Wheel polar coordinates: { hueDeg (0..360), luma (0..1), sat (0..1) }.
export function rgbWheelToLumetriTuple(r = 0.5, g = 0.5, b = 0.5, mix = 1.0) {
  const mr = 0.5 + (clamp(r, 0, 1) - 0.5) * mix;
  const mg = 0.5 + (clamp(g, 0, 1) - 0.5) * mix;
  const mb = 0.5 + (clamp(b, 0, 1) - 0.5) * mix;

  const dr = (mr - 0.5) * 2.0;
  const dg = (mg - 0.5) * 2.0;
  const db = (mb - 0.5) * 2.0;

  const dLuma = 0.2126 * dr + 0.7152 * dg + 0.0722 * db;
  const luma = clamp(0.5 + dLuma * 0.5, 0.0, 1.0);

  const cx = dr - 0.5 * (dg + db);
  const cy = (Math.sqrt(3) / 2) * (dg - db);
  const satRaw = Math.sqrt(cx * cx + cy * cy);
  const sat = clamp(satRaw, 0.0, 1.0);

  if (sat < 1e-4) {
    return { hueDeg: 0.0, luma, sat: 0.0 };
  }

  const angleDeg = (Math.atan2(cy, cx) * 180.0) / Math.PI;
  const hueDeg = ((angleDeg % 360.0) + 360.0) % 360.0;
  return { hueDeg, luma, sat };
}

// Converts a Lumetri Color Wheel tuple { hueDeg, luma, sat } back into
// Argan Color Studio 3-Way Wheel RGB channels (0..1, neutral 0.5).
export function lumetriTupleToRgbWheel(hueDeg = 0.0, luma = 0.5, sat = 0.0) {
  const safeLuma = Number.isFinite(luma) ? clamp(luma, 0.0, 1.0) : 0.5;
  const safeSat = Number.isFinite(sat) ? clamp(sat, 0.0, 1.0) : 0.0;
  const safeHue = Number.isFinite(hueDeg) ? hueDeg : 0.0;

  const lumaShift = (safeLuma - 0.5) * 0.45;
  if (safeSat < 1e-4) {
    const neutral = clamp(0.5 + lumaShift, 0.0, 1.0);
    return [round2(neutral), round2(neutral), round2(neutral)];
  }

  const rad = (safeHue * Math.PI) / 180.0;
  const chromaAmp = safeSat * 0.32;
  const r = clamp(0.5 + lumaShift + chromaAmp * Math.cos(rad), 0.0, 1.0);
  const g = clamp(
    0.5 + lumaShift + chromaAmp * Math.cos(rad - (2.0 * Math.PI) / 3.0),
    0.0,
    1.0
  );
  const b = clamp(
    0.5 + lumaShift + chromaAmp * Math.cos(rad + (2.0 * Math.PI) / 3.0),
    0.0,
    1.0
  );
  return [round2(r), round2(g), round2(b)];
}

// Maps all 19 Argan Color Studio parameters into clamped Adobe Lumetri parameters.
export function mapParamsToLumetri(params = DEFAULT_PARAMS) {
  const p = { ...DEFAULT_PARAMS, ...(params || {}) };
  const mix = clamp(p.gradeMix ?? 1.0, 0.0, 1.0);

  const exposure = clamp((p.exposure ?? 0.0) * mix, -4.0, 4.0);
  const contrast = clamp(((p.contrast ?? 1.0) - 1.0) * 100.0 * mix, -100.0, 100.0);
  const highlights = clamp((p.highlights ?? 0.0) * 100.0 * mix, -100.0, 100.0);
  const shadows = clamp((p.shadows ?? 0.0) * 100.0 * mix, -100.0, 100.0);

  const pivot = clamp(p.pivot ?? 0.435, 0.1, 0.9);
  const pivotDelta = (0.435 - pivot) * 125.0 * mix;
  const whites = clamp(pivotDelta + highlights * 0.25, -100.0, 100.0);
  const blacks = clamp(-pivotDelta * 0.75 + shadows * 0.25, -100.0, 100.0);

  const temperature = clamp((p.temp ?? 0.0) * 100.0 * mix, -100.0, 100.0);
  const tint = clamp((p.tint ?? 0.0) * 100.0 * mix, -100.0, 100.0);
  const satDelta = ((p.sat ?? 1.0) - 1.0) * 100.0 * mix;
  const saturation = clamp(100.0 + satDelta, 0.0, 200.0);
  const vibrance = clamp((p.vib ?? 0.0) * 100.0 * mix, -100.0, 100.0);

  const shWheel = Array.isArray(p.shadowsWheel)
    ? p.shadowsWheel
    : [p.liftR, p.liftG, p.liftB];
  const midWheel = Array.isArray(p.midtonesWheel)
    ? p.midtonesWheel
    : [p.gammaR, p.gammaG, p.gammaB];
  const hiWheel = Array.isArray(p.highlightsWheel)
    ? p.highlightsWheel
    : [p.gainR, p.gainG, p.gainB];

  const wheels = {
    shadows: rgbWheelToLumetriTuple(shWheel[0], shWheel[1], shWheel[2], mix),
    midtones: rgbWheelToLumetriTuple(midWheel[0], midWheel[1], midWheel[2], mix),
    highlights: rgbWheelToLumetriTuple(hiWheel[0], hiWheel[1], hiWheel[2], mix),
    hdrSpecular: { hueDeg: 0.0, luma: 0.5, sat: 0.0 },
  };

  return {
    scalars: {
      temperature,
      tint,
      saturation,
      exposure,
      contrast,
      highlights,
      shadows,
      whites,
      blacks,
      vibrance,
      creativeSaturation: 100.0,
      maskOpacity: 100.0,
    },
    wheels,
  };
}

async function getTemplateArrayBuffer(overrideBuffer = null) {
  if (overrideBuffer instanceof ArrayBuffer) {
    return overrideBuffer;
  }
  if (ArrayBuffer.isView(overrideBuffer)) {
    return overrideBuffer.buffer.slice(
      overrideBuffer.byteOffset,
      overrideBuffer.byteOffset + overrideBuffer.byteLength
    );
  }
  if (cachedTemplateBuffer) {
    return cachedTemplateBuffer;
  }
  const res = await fetch(lumetriTemplateUrl);
  if (!res.ok) {
    throw new Error(`Failed to load Lumetri_Template.ffx (${res.status}).`);
  }
  cachedTemplateBuffer = await res.arrayBuffer();
  return cachedTemplateBuffer;
}

// Clones Lumetri_Template.ffx and patches all mapped scalar & 3-Way Color Wheel offsets.
export async function exportToFfx(
  params = DEFAULT_PARAMS,
  presetName = "Custom_Look",
  templateBuffer = null,
  inputProfile = "rec709"
) {
  const srcBuffer = await getTemplateArrayBuffer(templateBuffer);
  if (srcBuffer.byteLength !== ffxOffsetMap.templateByteLength) {
    throw new Error(
      `Template size mismatch: expected ${ffxOffsetMap.templateByteLength} bytes, got ${srcBuffer.byteLength}.`
    );
  }

  const outBuffer = srcBuffer.slice(0);
  const dv = new DataView(outBuffer);
  const effectiveParams = bakeLogProfileIntoLumetriParams(
    params,
    inputProfile || params?.inputProfile
  );
  const mapped = mapParamsToLumetri(effectiveParams);

  for (const [key, spec] of Object.entries(ffxOffsetMap.scalars)) {
    const rawVal = mapped.scalars[key] ?? spec.default ?? 0.0;
    const clampedVal = clamp(rawVal, spec.min, spec.max);
    dv.setFloat64(spec.cdatOffset, clampedVal, false); // Big-Endian cdat float64
    if (Number.isInteger(spec.pardValueOffset)) {
      dv.setFloat64(spec.pardValueOffset, clampedVal, false); // Big-Endian pard float64
    }
  }

  // Enable Color Wheels & Match section (ADBE Lumetri-0046 "Active" cdat float64BE)
  const COLOR_WHEELS_ACTIVE_CDAT_OFFSET = 64148;
  dv.setFloat64(COLOR_WHEELS_ACTIVE_CDAT_OFFSET, 1.0, false);

  const cwMap = ffxOffsetMap.colorWheels.wheels;
  for (const wheelKey of ["shadows", "midtones", "highlights", "hdrSpecular"]) {
    const wSpec = cwMap[wheelKey];
    const wVal = mapped.wheels[wheelKey] || { hueDeg: 0.0, luma: 0.5, sat: 0.0 };
    if (wSpec) {
      dv.setFloat64(wSpec.hueOffset, clamp(wVal.hueDeg, 0.0, 360.0), true);
      dv.setFloat64(wSpec.lumaOffset, clamp(wVal.luma, 0.0, 1.0), true);
      dv.setFloat64(wSpec.satOffset, clamp(wVal.sat, 0.0, 1.0), true);
    }
  }

  const cleanBase =
    String(presetName || "Custom_Look")
      .trim()
      .replace(/[^a-zA-Z0-9._-]+/g, "_")
      .replace(/^_+|_+$/g, "") || "Custom_Look";
  const fileName = cleanBase.toLowerCase().endsWith(".ffx")
    ? cleanBase
    : `${cleanBase}.ffx`;
  const blob = new Blob([outBuffer], { type: "application/octet-stream" });

  return {
    blob,
    fileName,
    buffer: outBuffer,
    mappedValues: mapped,
  };
}

function getEffectPrefix(matchName = "") {
  const m = String(matchName).trim();
  if (!m) return "";
  const dashIdx = m.indexOf("-");
  return dashIdx > 0 ? m.slice(0, dashIdx) : m;
}

function shiftWheel(out, prefixKey, dr, dg, db) {
  out[`${prefixKey}R`] = round2(clamp(out[`${prefixKey}R`] + dr, 0.0, 1.0));
  out[`${prefixKey}G`] = round2(clamp(out[`${prefixKey}G`] + dg, 0.0, 1.0));
  out[`${prefixKey}B`] = round2(clamp(out[`${prefixKey}B`] + db, 0.0, 1.0));
}

function applyCurvesCustomLut(u8, base, out) {
  // 4-byte header (00 01 00 01) followed by 4x 256-byte LUTs: Master, R, G, B
  const m64 = (u8[base + 4 + 64] - 64) / 255.0;
  const m128 = (u8[base + 4 + 128] - 128) / 255.0;
  const m192 = (u8[base + 4 + 192] - 192) / 255.0;
  const blackLift = u8[base + 4] / 255.0;
  const whiteDrop = (u8[base + 4 + 255] - 255) / 255.0;

  if (
    Math.abs(m64) > 0.004 ||
    Math.abs(m128) > 0.004 ||
    Math.abs(m192) > 0.004 ||
    blackLift > 0.004 ||
    whiteDrop < -0.004
  ) {
    out.exposure = round2(clamp(out.exposure + m128 * 1.4, -2.0, 2.0));
    out.contrast = round2(clamp(out.contrast + (m192 - m64) * 1.5, 0.5, 2.0));
    out.shadows = round2(clamp(out.shadows + (blackLift + m64) * 0.6, -0.5, 0.5));
    out.highlights = round2(clamp(out.highlights + (m192 + whiteDrop) * 0.6, -0.5, 0.5));
  }

  const chOffsets = [base + 260, base + 516, base + 772]; // R, G, B
  const shRgb = chOffsets.map((off) => ((u8[off + 64] - 64) / 255.0) * 0.6);
  const midRgb = chOffsets.map((off) => ((u8[off + 128] - 128) / 255.0) * 0.6);
  const hiRgb = chOffsets.map((off) => ((u8[off + 192] - 192) / 255.0) * 0.6);

  shiftWheel(out, "lift", shRgb[0], shRgb[1], shRgb[2]);
  shiftWheel(out, "gamma", midRgb[0], midRgb[1], midRgb[2]);
  shiftWheel(out, "gain", hiRgb[0], hiRgb[1], hiRgb[2]);
}

function applyMblLookBlob(u8, dv, start, len, strength, out) {
  if (len < 12 || readFourCC(u8, start) !== "MBL2") return;
  const mix = clamp(strength, 0.0, 1.0);
  if (mix <= 0.001) return;

  let pos = 8;
  while (pos + 8 <= len) {
    const cid = readFourCC(u8, start + pos);
    const csz = dv.getUint32(start + pos + 4, false);
    const cds = start + pos + 8;
    if (cid === "\0\0\0\0" && csz === 0) break;

    if (cid === "tool" && csz >= 12 && cds + csz <= start + len) {
      const tid = readFourCC(u8, cds);
      if (tid === "expo" && csz >= 20) {
        const val = dv.getFloat64(cds + 12, false);
        if (Number.isFinite(val)) {
          out.exposure = round2(clamp(out.exposure + val * mix, -2.0, 2.0));
        }
      } else if (tid === "cont" && csz >= 20) {
        const val = dv.getFloat64(cds + 12, false);
        if (Number.isFinite(val)) {
          out.contrast = round2(clamp(out.contrast + val * mix, 0.5, 2.0));
        }
      } else if (tid === "pop2" && csz >= 20) {
        const val = dv.getFloat64(cds + 12, false);
        if (Number.isFinite(val)) {
          out.contrast = round2(clamp(out.contrast + (val / 500.0) * mix, 0.5, 2.0));
        }
      } else if (tid === "husa" && csz >= 28) {
        const satPct = dv.getFloat64(cds + 20, false);
        if (Number.isFinite(satPct)) {
          const factor = 1.0 + (satPct / 100.0 - 1.0) * mix;
          out.sat = round2(clamp(out.sat * factor, 0.0, 2.0));
        }
      } else if (tid === "rhsl" && csz >= 228) {
        let satSum = 0;
        let validRanges = 0;
        for (let r = 0; r < 8; r++) {
          const satDelta = dv.getFloat64(cds + 36 + r * 24 + 8, false);
          if (Number.isFinite(satDelta)) {
            satSum += satDelta;
            validRanges++;
          }
        }
        if (validRanges > 0) {
          const avgSat = satSum / validRanges;
          out.sat = round2(clamp(out.sat + (avgSat / 100.0) * mix, 0.0, 2.0));
        }
      }
    }

    pos = pos + 8 + csz;
  }
}

function applyLumetriStream(s, dv, out, state) {
  const val = s.cdatValue;
  const m = s.matchName;
  const label = (s.tdsn || "").toLowerCase();

  if (m === "ADBE Lumetri-0007" || (label === "temperature" && m !== "ADBE Lumetri-0086")) {
    if (Number.isFinite(val)) out.temp = round2(clamp(val / 100.0, -1.0, 1.0));
  } else if (m === "ADBE Lumetri-0008" || (label === "tint" && m !== "ADBE Lumetri-0087")) {
    if (Number.isFinite(val)) out.tint = round2(clamp(val / 100.0, -1.0, 1.0));
  } else if (m === "ADBE Lumetri-0020") {
    if (Number.isFinite(val)) out.sat = round2(clamp(val / 100.0, 0.0, 2.0));
  } else if (m === "ADBE Lumetri-0031") {
    if (Number.isFinite(val) && Math.abs(val - 100.0) > 0.5) {
      out.sat = round2(clamp(out.sat * (val / 100.0), 0.0, 2.0));
    }
  } else if (m === "ADBE Lumetri-0011" || label === "exposure") {
    if (Number.isFinite(val)) out.exposure = round2(clamp(val, -2.0, 2.0));
  } else if (m === "ADBE Lumetri-0012" || (label === "contrast" && m !== "ADBE Lumetri-0088")) {
    if (Number.isFinite(val)) out.contrast = round2(clamp(1.0 + val / 100.0, 0.5, 2.0));
  } else if (m === "ADBE Lumetri-0013" || label === "highlights") {
    if (Number.isFinite(val)) out.highlights = round2(clamp(val / 100.0, -0.5, 0.5));
  } else if (m === "ADBE Lumetri-0014" || label === "shadows") {
    if (Number.isFinite(val)) out.shadows = round2(clamp(val / 100.0, -0.5, 0.5));
  } else if (m === "ADBE Lumetri-0015" || label === "whites") {
    if (Number.isFinite(val)) {
      state.whitesVal = val;
      state.hasWhitesOrBlacks = true;
    }
  } else if (m === "ADBE Lumetri-0016" || label === "blacks") {
    if (Number.isFinite(val)) {
      state.blacksVal = val;
      state.hasWhitesOrBlacks = true;
    }
  } else if (m === "ADBE Lumetri-0030" || label === "vibrance") {
    if (Number.isFinite(val)) out.vib = round2(clamp(val / 100.0, -0.8, 0.8));
  } else if (
    (m === "ADBE Lumetri-0047" || label === "wheels") &&
    s.aRbpOffset !== null &&
    s.aRbpLength >= 72
  ) {
    const base = s.aRbpOffset;
    const [lr, lg, lb] = lumetriTupleToRgbWheel(
      dv.getFloat64(base, true),
      dv.getFloat64(base + 8, true),
      dv.getFloat64(base + 16, true)
    );
    out.liftR = lr;
    out.liftG = lg;
    out.liftB = lb;

    const [gr, gg, gb] = lumetriTupleToRgbWheel(
      dv.getFloat64(base + 24, true),
      dv.getFloat64(base + 32, true),
      dv.getFloat64(base + 40, true)
    );
    out.gammaR = gr;
    out.gammaG = gg;
    out.gammaB = gb;

    const [hr, hg, hb] = lumetriTupleToRgbWheel(
      dv.getFloat64(base + 48, true),
      dv.getFloat64(base + 56, true),
      dv.getFloat64(base + 64, true)
    );
    out.gainR = hr;
    out.gainG = hg;
    out.gainB = hb;
  }
}

function applyGenericColorStream(s, out) {
  const val = s.cdatValue;
  if (!Number.isFinite(val)) return;
  const label = (s.tdsn || "").toLowerCase();

  if (label === "brightness" || label === "exposure") {
    const scale = Math.abs(val) > 5 ? val / 150.0 : val;
    out.exposure = round2(clamp(out.exposure + scale, -2.0, 2.0));
  } else if (label === "contrast") {
    const scale = Math.abs(val) > 3 ? val / 100.0 : val - 1.0;
    out.contrast = round2(clamp(out.contrast + scale, 0.5, 2.0));
  } else if (label === "saturation") {
    const scale = Math.abs(val) > 3 ? val / 100.0 : val - 1.0;
    out.sat = round2(clamp(out.sat + scale, 0.0, 2.0));
  } else if (label === "vibrance") {
    out.vib = round2(clamp(out.vib + val / 100.0, -0.8, 0.8));
  } else if (label === "gamma" && val > 0.1) {
    out.pivot = round2(clamp(0.435 / val, 0.1, 0.9));
  } else if (label === "temperature" || label === "warmth") {
    out.temp = round2(clamp(out.temp + val / 100.0, -1.0, 1.0));
  } else if (label === "tint") {
    out.tint = round2(clamp(out.tint + val / 100.0, -1.0, 1.0));
  }
}

// Parses any After Effects RIFX .ffx file (ArrayBuffer / File / Blob / Uint8Array)
// and extracts supported color grading parameters.
export async function parseFfxPreset(input, fileName = "preset.ffx", lang = "en") {
  let arrayBuffer;
  if (input instanceof ArrayBuffer) {
    arrayBuffer = input;
  } else if (ArrayBuffer.isView(input)) {
    arrayBuffer = input.buffer.slice(
      input.byteOffset,
      input.byteOffset + input.byteLength
    );
  } else if (input && typeof input.arrayBuffer === "function") {
    if (input.size > 40 * 1024 * 1024) {
      throw new Error("Preset .ffx file is too large (limit 40 MB).");
    }
    arrayBuffer = await input.arrayBuffer();
  } else {
    throw new Error("Invalid .ffx input source.");
  }

  if (arrayBuffer.byteLength < 16) {
    throw new Error("This .ffx file is truncated or empty.");
  }

  const u8 = new Uint8Array(arrayBuffer);
  const dv = new DataView(arrayBuffer);
  const magic = readFourCC(u8, 0);
  if (magic !== "RIFX") {
    throw new Error("This .ffx file is not a valid Big-Endian RIFX preset.");
  }

  const streams = [];
  const effectBlocks = new Set();
  const discoveredEffectNames = [];
  let currentTdmn = "";
  let currentEffectName = "";
  let instanceCounter = 0;

  function recordDiscoveredName(name) {
    const clean = String(name || "").trim();
    if (!clean || STRUCTURAL_MATCH_NAMES.has(clean)) return;
    if (!discoveredEffectNames.includes(clean)) {
      discoveredEffectNames.push(clean);
    }
  }

  function walkChunks(start, end) {
    let pos = start;
    while (pos + 8 <= end) {
      const id = readFourCC(u8, pos);
      const size = dv.getUint32(pos + 4, false);
      const dataStart = pos + 8;
      const dataEnd = Math.min(end, dataStart + size);

      if (id === "RIFX" || id === "LIST") {
        const subType = readFourCC(u8, dataStart);
        walkChunks(dataStart + 4, dataEnd);
        if (subType === "sspc") {
          currentEffectName = "";
        }
      } else if (id === "fnam") {
        currentEffectName = decodeAsciiString(u8, dataStart, size)
          .replace(/^Utf8/, "")
          .trim();
      } else if (id === "tdmn") {
        currentTdmn = decodeAsciiString(u8, dataStart, size);
        const prefix = getEffectPrefix(currentTdmn);
        const isStructural =
          STRUCTURAL_MATCH_NAMES.has(prefix) || STRUCTURAL_MATCH_NAMES.has(currentTdmn);
        if (prefix && !isStructural) {
          effectBlocks.add(prefix);
          if (!currentTdmn.includes("-") || currentTdmn.endsWith("-0000")) {
            instanceCounter++;
          }
        }
      } else if (id === "tdsn") {
        const tdsn = decodeAsciiString(u8, dataStart, size)
          .replace(/^Utf8/, "")
          .trim();
        const prefix = getEffectPrefix(currentTdmn);
        const isStructural =
          STRUCTURAL_MATCH_NAMES.has(prefix) || STRUCTURAL_MATCH_NAMES.has(currentTdmn);
        if (prefix && !isStructural && !currentTdmn.includes("-")) {
          recordDiscoveredName(tdsn || currentEffectName || prefix);
        }
        streams.push({
          instanceId: instanceCounter,
          matchName: currentTdmn,
          effectName: currentEffectName,
          tdsn,
          cdatValue: null,
          aRbpOffset: null,
          aRbpLength: 0,
        });
      } else if (id === "cdat" && streams.length > 0) {
        const last = streams[streams.length - 1];
        if (last.cdatValue === null && size >= 8) {
          last.cdatValue = dv.getFloat64(dataStart, false);
        }
      } else if (id === "aRbp" && streams.length > 0) {
        const last = streams[streams.length - 1];
        last.aRbpOffset = dataStart;
        last.aRbpLength = size;
      }

      pos = dataStart + size + (size % 2);
    }
  }

  walkChunks(0, u8.length);

  for (const prefix of effectBlocks) {
    if (discoveredEffectNames.length === 0) {
      recordDiscoveredName(prefix);
    }
  }

  const colorEffectsFound = [];
  let nonColorEffectsCount = 0;

  for (const prefix of effectBlocks) {
    const label = resolveSupportedColorLabel(prefix);
    if (label) {
      if (!colorEffectsFound.includes(label)) {
        colorEffectsFound.push(label);
      }
    } else if (prefix.startsWith("ADBE ") || prefix.length > 3) {
      nonColorEffectsCount++;
    }
  }

  if (colorEffectsFound.length === 0) {
    const i18nFfx = TRANSLATIONS[lang]?.ffxImport || TRANSLATIONS.en.ffxImport;
    const effectsList = discoveredEffectNames.join(", ");
    const msg = effectsList
      ? i18nFfx.unsupportedWithEffects
          .replace("{fileName}", fileName)
          .replace("{effects}", effectsList)
      : i18nFfx.unsupportedEmpty.replace("{fileName}", fileName);
    const err = new Error(msg);
    err.foundEffects = discoveredEffectNames;
    throw err;
  }

  const out = { ...DEFAULT_PARAMS };
  const lumetriState = { whitesVal: 0, blacksVal: 0, hasWhitesOrBlacks: false };

  // Deduplicate multi-pass aRbp blobs per effect instance (AE writes default then active)
  const latestCurvesByInstance = new Map();
  const latestHueSatByInstance = new Map();
  const mblInstances = new Map();
  const hueSatColorizeByInstance = new Map();

  for (const s of streams) {
    const mLower = s.matchName.toLowerCase();
    if (mLower === "adbe curvescustom-0001" && s.aRbpOffset !== null && s.aRbpLength >= 1028) {
      latestCurvesByInstance.set(s.instanceId, s);
    } else if (
      mLower === "adbe hue saturation-0003" &&
      s.aRbpOffset !== null &&
      s.aRbpLength >= 24
    ) {
      latestHueSatByInstance.set(s.instanceId, s);
    } else if (mLower.startsWith("adbe hue saturation")) {
      const entry = hueSatColorizeByInstance.get(s.instanceId) || {
        colorize: false,
        colorizeSat: 0,
      };
      if (mLower.endsWith("-0007") && Number.isFinite(s.cdatValue)) {
        entry.colorize = s.cdatValue >= 0.5;
      } else if (mLower.endsWith("-0009") && Number.isFinite(s.cdatValue)) {
        entry.colorizeSat = s.cdatValue;
      }
      hueSatColorizeByInstance.set(s.instanceId, entry);
    } else if (
      mLower.startsWith("mb looksuite") ||
      mLower.startsWith("mbl3") ||
      mLower.startsWith("mbl2")
    ) {
      const entry = mblInstances.get(s.instanceId) || { strength: 1.0, lookStream: null };
      const label = (s.tdsn || "").toLowerCase();
      if ((mLower.endsWith("-0013") || label === "strength") && Number.isFinite(s.cdatValue)) {
        entry.strength = clamp(s.cdatValue / 100.0, 0.0, 1.0);
      } else if (
        (mLower.endsWith("-0001") || label === "look") &&
        s.aRbpOffset !== null &&
        s.aRbpLength > 16
      ) {
        entry.lookStream = s;
      }
      mblInstances.set(s.instanceId, entry);
    }
  }

  for (const s of streams) {
    const val = s.cdatValue;
    const m = s.matchName;
    const mLower = m.toLowerCase();
    const label = (s.tdsn || "").toLowerCase();

    if (mLower.startsWith("adbe lumetri")) {
      applyLumetriStream(s, dv, out, lumetriState);
    } else if (mLower.startsWith("adbe exposure")) {
      if ((m.endsWith("-0003") || label === "exposure") && Number.isFinite(val)) {
        out.exposure = round2(clamp(out.exposure + val, -2.0, 2.0));
      } else if ((m.endsWith("-0004") || label === "offset") && Number.isFinite(val)) {
        out.shadows = round2(clamp(out.shadows + val * 2.0, -0.5, 0.5));
      } else if (
        (m.endsWith("-0005") || label.includes("gamma")) &&
        Number.isFinite(val) &&
        val > 0.1
      ) {
        out.pivot = round2(clamp(0.435 / val, 0.1, 0.9));
      }
    } else if (mLower.startsWith("adbe vibrance")) {
      if ((m.endsWith("-0001") || label === "vibrance") && Number.isFinite(val)) {
        out.vib = round2(clamp(out.vib + val / 100.0, -0.8, 0.8));
      } else if ((m.endsWith("-0002") || label === "saturation") && Number.isFinite(val)) {
        out.sat = round2(clamp(out.sat + val / 100.0, 0.0, 2.0));
      }
    } else if (mLower.startsWith("adbe hue saturation")) {
      if ((m.endsWith("-0005") || label.includes("saturation")) && Number.isFinite(val)) {
        out.sat = round2(clamp(out.sat + val / 100.0, 0.0, 2.0));
      } else if ((m.endsWith("-0006") || label.includes("lightness")) && Number.isFinite(val)) {
        out.exposure = round2(clamp(out.exposure + val / 100.0, -2.0, 2.0));
      }
    } else if (mLower.startsWith("adbe tint")) {
      if ((m.endsWith("-0003") || label.includes("amount")) && Number.isFinite(val)) {
        const amt = clamp(val / 100.0, 0.0, 1.0);
        out.sat = round2(clamp(out.sat * (1.0 - amt), 0.0, 2.0));
      }
    } else if (mLower.startsWith("adbe levels") || mLower.startsWith("adbe pro levels")) {
      if (label.includes("gamma") && Number.isFinite(val) && val > 0.1) {
        out.contrast = round2(clamp(out.contrast * (1.0 + (1.0 - val) * 0.5), 0.5, 2.0));
      }
    } else if (mLower.startsWith("adbe brightness & contrast")) {
      if ((m.endsWith("-0001") || label === "brightness") && Number.isFinite(val)) {
        out.exposure = round2(clamp(out.exposure + (val / 150.0) * 0.8, -2.0, 2.0));
      } else if ((m.endsWith("-0002") || label === "contrast") && Number.isFinite(val)) {
        out.contrast = round2(clamp(out.contrast + (val / 100.0) * 0.5, 0.5, 2.0));
      }
    } else if (mLower.startsWith("adbe color balance (hls)")) {
      if (label === "lightness" && Number.isFinite(val)) {
        out.exposure = round2(clamp(out.exposure + val / 100.0, -2.0, 2.0));
      } else if (label === "saturation" && Number.isFinite(val)) {
        out.sat = round2(clamp(out.sat + val / 100.0, 0.0, 2.0));
      }
    } else if (mLower.startsWith("adbe color balance")) {
      if (Number.isFinite(val)) {
        const shift = (val / 100.0) * 0.25;
        const zone = label.includes("shadow")
          ? "lift"
          : label.includes("highlight")
          ? "gain"
          : "gamma";
        if (label.includes("red")) shiftWheel(out, zone, shift, 0, 0);
        else if (label.includes("green")) shiftWheel(out, zone, 0, shift, 0);
        else if (label.includes("blue")) shiftWheel(out, zone, 0, 0, shift);
      }
    } else if (mLower.startsWith("adbe photofilter")) {
      if (label === "density" && Number.isFinite(val)) {
        out.temp = round2(clamp(out.temp + (val / 100.0) * 0.35, -1.0, 1.0));
      }
    } else if (mLower.startsWith("adbe black & white")) {
      out.sat = 0.0;
    } else if (mLower.startsWith("adbe tritone")) {
      if (label.includes("blend") && Number.isFinite(val)) {
        const amt = 1.0 - clamp(val / 100.0, 0.0, 1.0);
        out.sat = round2(clamp(out.sat * (1.0 - amt * 0.75), 0.0, 2.0));
      }
    } else if (mLower.startsWith("adbe channel mixer")) {
      if (label === "monochrome" && val >= 0.5) {
        out.sat = 0.0;
      }
    } else if (mLower.startsWith("adbe selective color")) {
      if (Number.isFinite(val) && Math.abs(val) > 0.1) {
        if (label.includes("cyan")) out.temp = round2(clamp(out.temp - val / 400.0, -1.0, 1.0));
        else if (label.includes("yellow")) out.temp = round2(clamp(out.temp + val / 400.0, -1.0, 1.0));
        else if (label.includes("magenta")) out.tint = round2(clamp(out.tint + val / 400.0, -1.0, 1.0));
      }
    } else if (mLower.startsWith("adbe gamma/pedestal/gain")) {
      if (Number.isFinite(val)) {
        if (label.includes("pedestal")) {
          out.shadows = round2(clamp(out.shadows + val * 0.5, -0.5, 0.5));
        } else if (label.includes("gamma") && val > 0.1) {
          out.pivot = round2(clamp(0.435 / val, 0.1, 0.9));
        } else if (label.includes("gain")) {
          out.highlights = round2(clamp(out.highlights + (val - 1.0) * 0.5, -0.5, 0.5));
        }
      }
    } else if (
      mLower.startsWith("s_huesatbright") ||
      mLower.startsWith("s_colorbalance") ||
      mLower.startsWith("s_gamma") ||
      mLower.startsWith("s_tint")
    ) {
      if (mLower.startsWith("s_tint") && label.includes("amount") && Number.isFinite(val)) {
        out.sat = round2(clamp(out.sat * (1.0 - clamp(val, 0.0, 1.0)), 0.0, 2.0));
      } else {
        applyGenericColorStream(s, out);
      }
    } else if (BCC_COLOR_RE.test(getEffectPrefix(m))) {
      applyGenericColorStream(s, out);
    }
  }

  for (const curveStream of latestCurvesByInstance.values()) {
    applyCurvesCustomLut(u8, curveStream.aRbpOffset, out);
  }

  for (const [instId, hsStream] of latestHueSatByInstance.entries()) {
    const base = hsStream.aRbpOffset;
    const masterSat = dv.getInt16(base + 6, false);
    const masterLight = dv.getInt16(base + 10, false);
    if (Number.isFinite(masterSat) && masterSat >= -100 && masterSat <= 100) {
      out.sat = round2(clamp(out.sat + masterSat / 100.0, 0.0, 2.0));
    }
    if (Number.isFinite(masterLight) && masterLight >= -100 && masterLight <= 100) {
      out.exposure = round2(clamp(out.exposure + masterLight / 100.0, -2.0, 2.0));
    }
    const cInfo = hueSatColorizeByInstance.get(instId);
    if (cInfo?.colorize) {
      out.sat = round2(clamp(cInfo.colorizeSat / 100.0, 0.0, 2.0));
    }
  }

  for (const { strength, lookStream } of mblInstances.values()) {
    if (lookStream) {
      applyMblLookBlob(u8, dv, lookStream.aRbpOffset, lookStream.aRbpLength, strength, out);
    }
  }

  if (lumetriState.hasWhitesOrBlacks) {
    const netPivotShift = (lumetriState.whitesVal - lumetriState.blacksVal) / 220.0;
    out.pivot = round2(clamp(0.435 - netPivotShift, 0.1, 0.9));
  }

  const baseName = String(fileName || "preset.ffx").replace(/\.[^/.]+$/, "");
  const cleanName = sanitizeMetadataText(baseName, "Imported FFX Preset", 48);
  const effectsSummary = colorEffectsFound.join(", ");
  const skippedSuffix =
    nonColorEffectsCount > 0
      ? ` (${nonColorEffectsCount} non-color effect${
          nonColorEffectsCount === 1 ? "" : "s"
        } skipped)`
      : "";
  const statusSummary = `Imported ${effectsSummary} from ${fileName}${skippedSuffix}`;

  return {
    kind: "FFX",
    name: cleanName,
    author: "",
    description: statusSummary,
    statusSummary,
    effectsFound: colorEffectsFound,
    skippedEffectsCount: nonColorEffectsCount,
    params: sanitizeParams(out),
    rms: null,
  };
}
