import ffxOffsetMap from "./ffxOffsetMap.json";
import lumetriTemplateUrl from "../assets/Lumetri_Template.ffx?url";
import { DEFAULT_PARAMS, clamp, sanitizeParams } from "./gradeEngine.js";
import { sanitizeMetadataText } from "./hostGuard.js";
import { bakeLogProfileIntoLumetriParams } from "./logProfiles.js";

let cachedTemplateBuffer = null;

const SUPPORTED_COLOR_EFFECTS = {
  "ADBE Lumetri": "Lumetri Color",
  "ADBE Exposure2": "Exposure",
  "ADBE Exposure": "Exposure",
  "ADBE Vibrance": "Vibrance",
  "ADBE Hue Saturation": "Hue/Saturation",
  "ADBE Tint": "Tint",
  "ADBE Levels2": "Levels",
  "ADBE Pro Levels2": "Levels (Individual Controls)",
};

const STRUCTURAL_MATCH_NAMES = new Set([
  "ADBE Effect Built In Params",
  "ADBE Effect Mask Parade",
  "ADBE Effect Mask Opacity",
  "ADBE Force CPU GPU",
  "ADBE Group End",
  "ADBE Layer Overrides",
  "ADBE Effect Parade",
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
  const saturation = clamp(
    (1.0 + ((p.sat ?? 1.0) - 1.0) * mix) * 100.0,
    0.0,
    200.0
  );
  const vibrance = clamp((p.vib ?? 0.0) * 100.0 * mix, -100.0, 100.0);

  const wheels = {
    shadows: rgbWheelToLumetriTuple(p.liftR, p.liftG, p.liftB, mix),
    midtones: rgbWheelToLumetriTuple(p.gammaR, p.gammaG, p.gammaB, mix),
    highlights: rgbWheelToLumetriTuple(p.gainR, p.gainG, p.gainB, mix),
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

// Parses any After Effects RIFX .ffx file (ArrayBuffer / File / Blob / Uint8Array)
// and extracts supported color grading parameters.
export async function parseFfxPreset(input, fileName = "preset.ffx") {
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
  let currentTdmn = "";
  let currentEffectName = "";

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
        if (prefix && !STRUCTURAL_MATCH_NAMES.has(prefix) && !STRUCTURAL_MATCH_NAMES.has(currentTdmn)) {
          effectBlocks.add(prefix);
        }
      } else if (id === "tdsn") {
        const tdsn = decodeAsciiString(u8, dataStart, size)
          .replace(/^Utf8/, "")
          .trim();
        streams.push({
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

  const colorEffectsFound = [];
  let nonColorEffectsCount = 0;

  for (const prefix of effectBlocks) {
    if (SUPPORTED_COLOR_EFFECTS[prefix]) {
      const label = SUPPORTED_COLOR_EFFECTS[prefix];
      if (!colorEffectsFound.includes(label)) {
        colorEffectsFound.push(label);
      }
    } else if (prefix.startsWith("ADBE ") || prefix.length > 3) {
      nonColorEffectsCount++;
    }
  }

  if (colorEffectsFound.length === 0) {
    throw new Error(
      `No supported color grading effects (Lumetri Color, Exposure, Vibrance, Hue/Saturation, Tint, Levels) found in ${fileName}.`
    );
  }

  const out = { ...DEFAULT_PARAMS };
  let whitesVal = 0;
  let blacksVal = 0;
  let hasWhitesOrBlacks = false;

  for (const s of streams) {
    const val = s.cdatValue;
    const m = s.matchName;
    const label = (s.tdsn || "").toLowerCase();

    // 1. ADBE Lumetri
    if (m.startsWith("ADBE Lumetri")) {
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
          whitesVal = val;
          hasWhitesOrBlacks = true;
        }
      } else if (m === "ADBE Lumetri-0016" || label === "blacks") {
        if (Number.isFinite(val)) {
          blacksVal = val;
          hasWhitesOrBlacks = true;
        }
      } else if (m === "ADBE Lumetri-0030" || label === "vibrance") {
        if (Number.isFinite(val)) out.vib = round2(clamp(val / 100.0, -0.8, 0.8));
      } else if (
        (m === "ADBE Lumetri-0047" || label === "wheels") &&
        s.aRbpOffset !== null &&
        s.aRbpLength >= 72
      ) {
        const base = s.aRbpOffset;
        const shHue = dv.getFloat64(base, true);
        const shLuma = dv.getFloat64(base + 8, true);
        const shSat = dv.getFloat64(base + 16, true);
        const [lr, lg, lb] = lumetriTupleToRgbWheel(shHue, shLuma, shSat);
        out.liftR = lr;
        out.liftG = lg;
        out.liftB = lb;

        const midHue = dv.getFloat64(base + 24, true);
        const midLuma = dv.getFloat64(base + 32, true);
        const midSat = dv.getFloat64(base + 40, true);
        const [gr, gg, gb] = lumetriTupleToRgbWheel(midHue, midLuma, midSat);
        out.gammaR = gr;
        out.gammaG = gg;
        out.gammaB = gb;

        const hiHue = dv.getFloat64(base + 48, true);
        const hiLuma = dv.getFloat64(base + 56, true);
        const hiSat = dv.getFloat64(base + 64, true);
        const [hr, hg, hb] = lumetriTupleToRgbWheel(hiHue, hiLuma, hiSat);
        out.gainR = hr;
        out.gainG = hg;
        out.gainB = hb;
      }
    }

    // 2. ADBE Exposure2 / ADBE Exposure
    else if (m.startsWith("ADBE Exposure")) {
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
    }

    // 3. ADBE Vibrance
    else if (m.startsWith("ADBE Vibrance")) {
      if ((m.endsWith("-0001") || label === "vibrance") && Number.isFinite(val)) {
        out.vib = round2(clamp(out.vib + val / 100.0, -0.8, 0.8));
      } else if ((m.endsWith("-0002") || label === "saturation") && Number.isFinite(val)) {
        out.sat = round2(clamp(out.sat + val / 100.0, 0.0, 2.0));
      }
    }

    // 4. ADBE Hue Saturation
    else if (m.startsWith("ADBE Hue Saturation")) {
      if ((m.endsWith("-0005") || label.includes("saturation")) && Number.isFinite(val)) {
        out.sat = round2(clamp(out.sat + val / 100.0, 0.0, 2.0));
      } else if ((m.endsWith("-0006") || label.includes("lightness")) && Number.isFinite(val)) {
        out.exposure = round2(clamp(out.exposure + val / 100.0, -2.0, 2.0));
      }
    }

    // 5. ADBE Tint
    else if (m.startsWith("ADBE Tint")) {
      if ((m.endsWith("-0003") || label.includes("amount")) && Number.isFinite(val)) {
        const amt = clamp(val / 100.0, 0.0, 1.0);
        out.sat = round2(clamp(out.sat * (1.0 - amt), 0.0, 2.0));
      }
    }

    // 6. ADBE Levels2 / ADBE Pro Levels2
    else if (m.startsWith("ADBE Levels") || m.startsWith("ADBE Pro Levels")) {
      if (label.includes("gamma") && Number.isFinite(val) && val > 0.1) {
        out.contrast = round2(clamp(out.contrast * (1.0 + (1.0 - val) * 0.5), 0.5, 2.0));
      }
    }
  }

  if (hasWhitesOrBlacks) {
    const netPivotShift = (whitesVal - blacksVal) / 220.0;
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
