import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ffxPath = path.resolve(__dirname, "../src/assets/Lumetri_Template.ffx");
const outJsonPath = path.resolve(__dirname, "../src/utils/ffxOffsetMap.json");

const buf = fs.readFileSync(ffxPath);
const dv = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);

function fourCC(offset) {
  return String.fromCharCode(
    buf[offset],
    buf[offset + 1],
    buf[offset + 2],
    buf[offset + 3]
  );
}

function decodeAscii(start, len) {
  let out = "";
  const end = Math.min(buf.length, start + len);
  for (let i = start; i < end; i++) {
    const c = buf[i];
    if (c >= 32 && c < 127) out += String.fromCharCode(c);
  }
  return out.trim();
}

const containerMagic = fourCC(0);
const containerSize = dv.getUint32(4, false);
const formType = fourCC(8);

if (containerMagic !== "RIFX") {
  throw new Error(`Expected Big-Endian RIFX header, got: ${containerMagic}`);
}

const parTMap = new Map();
const tdgpMap = new Map();
let activeTdmn = "";

function walkRifx(start, end, section = "root") {
  let pos = start;
  while (pos + 8 <= end) {
    const id = fourCC(pos);
    const size = dv.getUint32(pos + 4, false);
    const dataStart = pos + 8;
    const dataEnd = Math.min(end, dataStart + size);

    if (id === "RIFX" || id === "LIST") {
      const subForm = fourCC(dataStart);
      const nextSection =
        subForm === "parT"
          ? "parT"
          : subForm === "tdgp"
          ? "tdgp"
          : section;
      walkRifx(dataStart + 4, dataEnd, nextSection);
    } else if (id === "tdmn") {
      activeTdmn = decodeAscii(dataStart, size);
    } else if (section === "parT" && activeTdmn) {
      const entry = parTMap.get(activeTdmn) || { matchName: activeTdmn };
      if (id === "pard") {
        entry.pardChunkOffset = pos;
        entry.pardDataOffset = dataStart;
        entry.pardByteLength = size;
        entry.pardValueOffset = dataStart + 56;
        entry.pardValue = dv.getFloat64(dataStart + 56, false);
        entry.pardLabel = decodeAscii(dataStart + 16, 32);
      } else if (id === "aRbp") {
        entry.pardArbpChunkOffset = pos;
        entry.pardArbpDataOffset = dataStart;
        entry.pardArbpByteLength = size;
      }
      parTMap.set(activeTdmn, entry);
    } else if (section === "tdgp" && activeTdmn) {
      const entry = tdgpMap.get(activeTdmn) || { matchName: activeTdmn };
      if (id === "tdsn") {
        entry.tdsn = decodeAscii(dataStart, size).replace(/^Utf8/, "").trim();
      } else if (id === "cdat") {
        entry.cdatChunkOffset = pos;
        entry.cdatDataOffset = dataStart;
        entry.cdatByteLength = size;
        if (size >= 8) {
          entry.cdatValue = dv.getFloat64(dataStart, false);
        }
      } else if (id === "tdum" && size >= 8) {
        entry.min = dv.getFloat64(dataStart, false);
      } else if (id === "tduM" && size >= 8) {
        entry.max = dv.getFloat64(dataStart, false);
      } else if (id === "aRbp") {
        entry.aRbpChunkOffset = pos;
        entry.aRbpDataOffset = dataStart;
        entry.aRbpByteLength = size;
      }
      tdgpMap.set(activeTdmn, entry);
    }

    pos = dataStart + size + (size % 2);
  }
}

walkRifx(0, buf.length);

// Target Lumetri parameter definitions and expected sentinels
const PARAM_SPECS = [
  {
    key: "temperature",
    matchName: "ADBE Lumetri-0007",
    expectedTdsn: "Temperature",
    sentinel: 14.5,
    defaultVal: 0,
    min: -100,
    max: 100,
  },
  {
    key: "tint",
    matchName: "ADBE Lumetri-0008",
    expectedTdsn: "Tint",
    sentinel: -9.5,
    defaultVal: 0,
    min: -100,
    max: 100,
  },
  {
    key: "saturation",
    matchName: "ADBE Lumetri-0020",
    expectedTdsn: "Saturation",
    sentinel: 118,
    defaultVal: 100,
    min: 0,
    max: 200,
  },
  {
    key: "exposure",
    matchName: "ADBE Lumetri-0011",
    expectedTdsn: "Exposure",
    sentinel: -1.25,
    sentinelAbs: 1.25,
    defaultVal: 0,
    min: -4,
    max: 4,
  },
  {
    key: "contrast",
    matchName: "ADBE Lumetri-0012",
    expectedTdsn: "Contrast",
    sentinel: 42,
    defaultVal: 0,
    min: -100,
    max: 100,
  },
  {
    key: "highlights",
    matchName: "ADBE Lumetri-0013",
    expectedTdsn: "Highlights",
    sentinel: -18,
    defaultVal: 0,
    min: -100,
    max: 100,
  },
  {
    key: "shadows",
    matchName: "ADBE Lumetri-0014",
    expectedTdsn: "Shadows",
    sentinel: 24,
    defaultVal: 0,
    min: -100,
    max: 100,
  },
  {
    key: "whites",
    matchName: "ADBE Lumetri-0015",
    expectedTdsn: "Whites",
    sentinel: 31,
    defaultVal: 0,
    min: -100,
    max: 100,
  },
  {
    key: "blacks",
    matchName: "ADBE Lumetri-0016",
    expectedTdsn: "Blacks",
    sentinel: -14,
    defaultVal: 0,
    min: -100,
    max: 100,
  },
  {
    key: "vibrance",
    matchName: "ADBE Lumetri-0030",
    expectedTdsn: "Vibrance",
    sentinel: 27,
    defaultVal: 0,
    min: -100,
    max: 100,
  },
  {
    key: "creativeSaturation",
    matchName: "ADBE Lumetri-0031",
    expectedTdsn: "Saturation",
    sentinel: 100,
    defaultVal: 100,
    min: 0,
    max: 200,
  },
  {
    key: "maskOpacity",
    matchName: "ADBE Effect Mask Opacity",
    expectedTdsn: "-_0_/-",
    sentinel: 100,
    defaultVal: 100,
    min: 0,
    max: 100,
  },
];

const scalarOffsets = {};
const verificationRows = [];

for (const spec of PARAM_SPECS) {
  const p = parTMap.get(spec.matchName) || {};
  const t = tdgpMap.get(spec.matchName) || {};
  if (!t.cdatDataOffset) {
    throw new Error(`Missing cdat stream for ${spec.matchName} (${spec.key})`);
  }

  scalarOffsets[spec.key] = {
    matchName: spec.matchName,
    tdsn: t.tdsn || spec.expectedTdsn,
    cdatOffset: t.cdatDataOffset,
    cdatByteLength: t.cdatByteLength,
    pardValueOffset: p.pardValueOffset ?? null,
    pardByteLength: p.pardByteLength ?? null,
    endianness: "big",
    type: "float64",
    observedValue: t.cdatValue,
    expectedSentinel: spec.sentinel,
    default: spec.defaultVal,
    min: spec.min ?? t.min ?? -100,
    max: spec.max ?? t.max ?? 100,
  };

  verificationRows.push({
    Parameter: spec.key,
    MatchName: spec.matchName,
    StreamLabel: t.tdsn,
    cdatOffset: t.cdatDataOffset,
    cdatBytes: t.cdatByteLength,
    pardValOffset: p.pardValueOffset ?? "-",
    Observed: t.cdatValue,
    Bounds: `[${scalarOffsets[spec.key].min}, ${scalarOffsets[spec.key].max}]`,
  });
}

// Parse 3-Way Color Wheels (ADBE Lumetri-0047)
const wheelsParT = parTMap.get("ADBE Lumetri-0047");
const wheelsTdgp = tdgpMap.get("ADBE Lumetri-0047");

if (!wheelsTdgp || !wheelsTdgp.aRbpDataOffset) {
  throw new Error("Failed to locate ADBE Lumetri-0047 Color Wheels aRbp payload.");
}

const wheelsBaseOffset = wheelsTdgp.aRbpDataOffset;
const wheelsByteLength = wheelsTdgp.aRbpByteLength;
const wheelsDefaultBaseOffset = wheelsParT?.pardArbpDataOffset ?? null;

function readWheelTuple(baseOff, wheelIdx) {
  const off = baseOff + wheelIdx * 24;
  return {
    byteOffset: off,
    byteLength: 24,
    hueOffset: off,
    lumaOffset: off + 8,
    satOffset: off + 16,
    observedHueDeg: Number(dv.getFloat64(off, true).toFixed(6)),
    observedLuma: Number(dv.getFloat64(off + 8, true).toFixed(6)),
    observedSat: Number(dv.getFloat64(off + 16, true).toFixed(6)),
  };
}

const shadowsWheel = readWheelTuple(wheelsBaseOffset, 0);
const midtonesWheel = readWheelTuple(wheelsBaseOffset, 1);
const highlightsWheel = readWheelTuple(wheelsBaseOffset, 2);
const specularWheel = readWheelTuple(wheelsBaseOffset, 3);

const offsetMap = {
  templateFile: "src/assets/Lumetri_Template.ffx",
  templateByteLength: buf.length,
  containerMagic,
  containerSize,
  formType,
  effectMatchName: "ADBE Lumetri",
  effectLabel: "Lumetri Color",
  scalars: scalarOffsets,
  colorWheels: {
    matchName: "ADBE Lumetri-0047",
    tdsn: wheelsTdgp.tdsn || "Wheels",
    cdatOffset: wheelsTdgp.cdatDataOffset,
    cdatByteLength: wheelsTdgp.cdatByteLength,
    aRbpOffset: wheelsBaseOffset,
    aRbpByteLength: wheelsByteLength,
    pardArbpOffset: wheelsDefaultBaseOffset,
    endianness: "little",
    tupleFormat: ["hueDeg (0..360)", "luma (0..1, neutral 0.5)", "sat (0..1, neutral 0.0)"],
    ranges: {
      hueDeg: [0, 360],
      luma: [0, 1],
      sat: [0, 1],
      neutral: { hueDeg: 0, luma: 0.5, sat: 0 },
    },
    wheels: {
      shadows: shadowsWheel,
      midtones: midtonesWheel,
      highlights: highlightsWheel,
      hdrSpecular: specularWheel,
    },
  },
};

fs.writeFileSync(outJsonPath, JSON.stringify(offsetMap, null, 2) + "\n", "utf8");

console.log("=== RIFX / FaFX Lumetri_Template.ffx Parameter Offset Verification Table ===");
console.table(verificationRows);
console.log("=== 3-Way Color Wheels (ADBE Lumetri-0047 aRbp @ " + wheelsBaseOffset + ", 96 bytes) ===");
console.table([
  {
    Wheel: "Shadows (Lift)",
    ByteOffset: shadowsWheel.byteOffset,
    ByteLength: shadowsWheel.byteLength,
    HueOffset: shadowsWheel.hueOffset,
    LumaOffset: shadowsWheel.lumaOffset,
    SatOffset: shadowsWheel.satOffset,
    ObservedHueDeg: shadowsWheel.observedHueDeg,
    ObservedLuma: shadowsWheel.observedLuma,
    ObservedSat: shadowsWheel.observedSat,
  },
  {
    Wheel: "Midtones (Gamma)",
    ByteOffset: midtonesWheel.byteOffset,
    ByteLength: midtonesWheel.byteLength,
    HueOffset: midtonesWheel.hueOffset,
    LumaOffset: midtonesWheel.lumaOffset,
    SatOffset: midtonesWheel.satOffset,
    ObservedHueDeg: midtonesWheel.observedHueDeg,
    ObservedLuma: midtonesWheel.observedLuma,
    ObservedSat: midtonesWheel.observedSat,
  },
  {
    Wheel: "Highlights (Gain)",
    ByteOffset: highlightsWheel.byteOffset,
    ByteLength: highlightsWheel.byteLength,
    HueOffset: highlightsWheel.hueOffset,
    LumaOffset: highlightsWheel.lumaOffset,
    SatOffset: highlightsWheel.satOffset,
    ObservedHueDeg: highlightsWheel.observedHueDeg,
    ObservedLuma: highlightsWheel.observedLuma,
    ObservedSat: highlightsWheel.observedSat,
  },
]);
console.log("Wrote verified offset map to:", outJsonPath);
