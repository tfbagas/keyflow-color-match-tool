// Universal 32^3 (98,304 float32) LUT Core, Tetrahedral Sampler,
// WebGL 512x64 2D-Packed Texture Builder, Iridas .cube Serializer,
// and Keyflow Mobile .kfplug 512x64 PNG + Tetrahedral GLSL ES 1.00 Exporter.
//
// Designed for 1:1 C++ parity with the Keyflow After Effects .aex plugin.
// Indexing order matches Adobe/Iridas .cube: R fastest, G second, B slowest:
//   index = ((b * 32 + g) * 32 + r) * 3

import {
  prepareGrade,
  evaluateGradeRGB,
  sanitizeParams,
} from "../utils/gradeEngine.js";
import {
  applyLogProfileRGB,
  isLogProfileActive,
  resolveLogProfileId,
} from "../utils/logProfiles.js";
import { clamp01, srgbToLinear, linearRgbToOklab } from "./colorSpace.ts";

export const LUT32_SIZE = 32;
export const LUT32_MAX_IDX = LUT32_SIZE - 1; // 31
export const LUT32_NODES = LUT32_SIZE * LUT32_SIZE * LUT32_SIZE; // 32,768
export const LUT32_LENGTH = LUT32_NODES * 3; // 98,304 float32 values

export const LUT32_TEX_COLS = 16;
export const LUT32_TEX_ROWS = 2;
export const LUT32_TEX_WIDTH = LUT32_TEX_COLS * LUT32_SIZE; // 512
export const LUT32_TEX_HEIGHT = LUT32_TEX_ROWS * LUT32_SIZE; // 64

export interface Lut3DObject {
  title: string;
  kind: "3d" | "1d";
  size: number;
  dMin: [number, number, number];
  dMax: [number, number, number];
  data: Float32Array;
  sourceEngine?: string;
  applyPostGrade?: boolean;
  _cachedPayload?: WebGLLutTexturePayload;
}

export interface WebGLLutTexturePayload {
  width: number;
  height: number;
  size: number;
  cols: number;
  rows: number;
  dMin: [number, number, number];
  dMax: [number, number, number];
  floatData: Float32Array;
  byteData: Uint8Array | null;
}

// ---------------------------------------------------------------------------
// Cached Universal Identity 32^3 Cube (98,304 float32 values) + OKLab Twin
// Generated once on module initialization using exact D65 sRGB -> OKLab.
// ---------------------------------------------------------------------------
function buildStandardCube(): {
  srgb: Float32Array;
  oklab: Float32Array;
} {
  const srgb = new Float32Array(LUT32_LENGTH);
  const oklab = new Float32Array(LUT32_LENGTH);
  const invMax = 1.0 / LUT32_MAX_IDX;

  let p = 0;
  for (let b = 0; b < LUT32_SIZE; b++) {
    const bv = b * invMax;
    const lb = srgbToLinear(bv);
    for (let g = 0; g < LUT32_SIZE; g++) {
      const gv = g * invMax;
      const lg = srgbToLinear(gv);
      for (let r = 0; r < LUT32_SIZE; r++) {
        const rv = r * invMax;
        const lr = srgbToLinear(rv);

        srgb[p] = rv;
        srgb[p + 1] = gv;
        srgb[p + 2] = bv;

        linearRgbToOklab(lr, lg, lb, oklab, p);
        p += 3;
      }
    }
  }
  return { srgb, oklab };
}

let cachedCubes: { srgb: Float32Array; oklab: Float32Array } | null = null;

function ensureStandardCubes(): { srgb: Float32Array; oklab: Float32Array } {
  if (!cachedCubes) {
    cachedCubes = buildStandardCube();
  }
  return cachedCubes;
}

/** Lazy identity 32x32x32x3 (98,304 float32) RGB lattice in .cube order. */
export function getStandardCube(): Float32Array {
  return ensureStandardCubes().srgb;
}

/** Lazy precomputed OKLab (L, a, b) lattice matching getStandardCube() for <8ms solves. */
export function getStandardCubeOklab(): Float32Array {
  return ensureStandardCubes().oklab;
}

/** Schedules 32^3 LUT lattice warmup after the initial UI paint when idle. */
export function warmupStandardCube(): void {
  if (cachedCubes) return;
  if (typeof window !== "undefined" && typeof window.requestIdleCallback === "function") {
    window.requestIdleCallback(() => {
      ensureStandardCubes();
    });
  } else {
    setTimeout(() => {
      ensureStandardCubes();
    }, 0);
  }
}

export function cloneStandardCube(): Float32Array {
  return new Float32Array(getStandardCube());
}

// ---------------------------------------------------------------------------
// Exact Tetrahedral Interpolation for 32^3 (and general N^3) 3D LUTs
// Guarantees strict neutral-gray diagonal linearity and zero hue banding on
// smooth gradients (skin tones, skies).
// ---------------------------------------------------------------------------
const DEFAULT_DMIN: readonly [number, number, number] = [0, 0, 0];
const DEFAULT_DMAX: readonly [number, number, number] = [1, 1, 1];

export function sampleLut3DTetrahedral(
  lutData: Float32Array,
  size: number,
  r: number,
  g: number,
  b: number,
  out: number[] | Float32Array,
  dMin: readonly number[] = DEFAULT_DMIN,
  dMax: readonly number[] = DEFAULT_DMAX
): void {
  const maxIdx = size - 1;
  const spanR = dMax[0] - dMin[0];
  const spanG = dMax[1] - dMin[1];
  const spanB = dMax[2] - dMin[2];

  const nr = clamp01((r - dMin[0]) / (spanR > 1e-6 ? spanR : 1.0));
  const ng = clamp01((g - dMin[1]) / (spanG > 1e-6 ? spanG : 1.0));
  const nb = clamp01((b - dMin[2]) / (spanB > 1e-6 ? spanB : 1.0));

  const x = nr * maxIdx;
  const y = ng * maxIdx;
  const z = nb * maxIdx;

  const x0 = Math.floor(x);
  const y0 = Math.floor(y);
  const z0 = Math.floor(z);
  const x1 = x0 < maxIdx ? x0 + 1 : maxIdx;
  const y1 = y0 < maxIdx ? y0 + 1 : maxIdx;
  const z1 = z0 < maxIdx ? z0 + 1 : maxIdx;

  const fx = x - x0;
  const fy = y - y0;
  const fz = z - z0;

  const strideG = size;
  const strideB = size * size;
  const i000 = (z0 * strideB + y0 * strideG + x0) * 3;
  const i111 = (z1 * strideB + y1 * strideG + x1) * 3;

  let iA: number;
  let iB: number;
  let wA: number;
  let wB: number;
  let wC: number;

  if (fx >= fy) {
    if (fy >= fz) {
      // fx >= fy >= fz -> (000, 100, 110, 111)
      iA = (z0 * strideB + y0 * strideG + x1) * 3;
      iB = (z0 * strideB + y1 * strideG + x1) * 3;
      wA = fx;
      wB = fy;
      wC = fz;
    } else if (fx >= fz) {
      // fx >= fz > fy -> (000, 100, 101, 111)
      iA = (z0 * strideB + y0 * strideG + x1) * 3;
      iB = (z1 * strideB + y0 * strideG + x1) * 3;
      wA = fx;
      wB = fz;
      wC = fy;
    } else {
      // fz > fx >= fy -> (000, 001, 101, 111)
      iA = (z1 * strideB + y0 * strideG + x0) * 3;
      iB = (z1 * strideB + y0 * strideG + x1) * 3;
      wA = fz;
      wB = fx;
      wC = fy;
    }
  } else if (fz > fy) {
    // fz > fy > fx -> (000, 001, 011, 111)
    iA = (z1 * strideB + y0 * strideG + x0) * 3;
    iB = (z1 * strideB + y1 * strideG + x0) * 3;
    wA = fz;
    wB = fy;
    wC = fx;
  } else if (fz > fx) {
    // fy >= fz > fx -> (000, 010, 011, 111)
    iA = (z0 * strideB + y1 * strideG + x0) * 3;
    iB = (z1 * strideB + y1 * strideG + x0) * 3;
    wA = fy;
    wB = fz;
    wC = fx;
  } else {
    // fy > fx >= fz -> (000, 010, 110, 111)
    iA = (z0 * strideB + y1 * strideG + x0) * 3;
    iB = (z0 * strideB + y1 * strideG + x1) * 3;
    wA = fy;
    wB = fx;
    wC = fz;
  }

  const v000r = lutData[i000];
  const vAr = lutData[iA];
  const vBr = lutData[iB];
  const v111r = lutData[i111];
  out[0] = v000r + wA * (vAr - v000r) + wB * (vBr - vAr) + wC * (v111r - vBr);

  const v000g = lutData[i000 + 1];
  const vAg = lutData[iA + 1];
  const vBg = lutData[iB + 1];
  const v111g = lutData[i111 + 1];
  out[1] = v000g + wA * (vAg - v000g) + wB * (vBg - vAg) + wC * (v111g - vBg);

  const v000b = lutData[i000 + 2];
  const vAb = lutData[iA + 2];
  const vBb = lutData[iB + 2];
  const v111b = lutData[i111 + 2];
  out[2] = v000b + wA * (vAb - v000b) + wB * (vBb - vAb) + wC * (v111b - vBb);
}

/** Fast specialized tetrahedral evaluation for 32^3 Float32Array LUTs. */
export function evaluateLut32Tetrahedral(
  lut32: Float32Array,
  r: number,
  g: number,
  b: number,
  out: number[] | Float32Array
): void {
  const x = clamp01(r) * 31.0;
  const y = clamp01(g) * 31.0;
  const z = clamp01(b) * 31.0;

  const x0 = x | 0;
  const y0 = y | 0;
  const z0 = z | 0;
  const x1 = x0 < 31 ? x0 + 1 : 31;
  const y1 = y0 < 31 ? y0 + 1 : 31;
  const z1 = z0 < 31 ? z0 + 1 : 31;

  const fx = x - x0;
  const fy = y - y0;
  const fz = z - z0;

  const i000 = ((z0 << 10) + (y0 << 5) + x0) * 3;
  const i111 = ((z1 << 10) + (y1 << 5) + x1) * 3;

  let iA: number;
  let iB: number;
  let wA: number;
  let wB: number;
  let wC: number;

  if (fx >= fy) {
    if (fy >= fz) {
      iA = ((z0 << 10) + (y0 << 5) + x1) * 3;
      iB = ((z0 << 10) + (y1 << 5) + x1) * 3;
      wA = fx;
      wB = fy;
      wC = fz;
    } else if (fx >= fz) {
      iA = ((z0 << 10) + (y0 << 5) + x1) * 3;
      iB = ((z1 << 10) + (y0 << 5) + x1) * 3;
      wA = fx;
      wB = fz;
      wC = fy;
    } else {
      iA = ((z1 << 10) + (y0 << 5) + x0) * 3;
      iB = ((z1 << 10) + (y0 << 5) + x1) * 3;
      wA = fz;
      wB = fx;
      wC = fy;
    }
  } else if (fz > fy) {
    iA = ((z1 << 10) + (y0 << 5) + x0) * 3;
    iB = ((z1 << 10) + (y1 << 5) + x0) * 3;
    wA = fz;
    wB = fy;
    wC = fx;
  } else if (fz > fx) {
    iA = ((z0 << 10) + (y1 << 5) + x0) * 3;
    iB = ((z1 << 10) + (y1 << 5) + x0) * 3;
    wA = fy;
    wB = fz;
    wC = fx;
  } else {
    iA = ((z0 << 10) + (y1 << 5) + x0) * 3;
    iB = ((z0 << 10) + (y1 << 5) + x1) * 3;
    wA = fy;
    wB = fx;
    wC = fz;
  }

  const r0 = lut32[i000];
  const rA = lut32[iA];
  const rB = lut32[iB];
  out[0] = r0 + wA * (rA - r0) + wB * (rB - rA) + wC * (lut32[i111] - rB);

  const g0 = lut32[i000 + 1];
  const gA = lut32[iA + 1];
  const gB = lut32[iB + 1];
  out[1] = g0 + wA * (gA - g0) + wB * (gB - gA) + wC * (lut32[i111 + 1] - gB);

  const b0 = lut32[i000 + 2];
  const bA = lut32[iA + 2];
  const bB = lut32[iB + 2];
  out[2] = b0 + wA * (bA - b0) + wB * (bB - bA) + wC * (lut32[i111 + 2] - bB);
}

// ---------------------------------------------------------------------------
// Baking & Composition Helpers -> 32^3 Float32Array
// ---------------------------------------------------------------------------
export function bakeParamsToLut32(
  params: Record<string, unknown>,
  inputProfile = "rec709"
): Float32Array {
  const G = prepareGrade(sanitizeParams(params));
  const resolvedProfile = resolveLogProfileId(inputProfile);
  const standardCube = getStandardCube();
  const out = new Float32Array(LUT32_LENGTH);
  const rgb = [0, 0, 0];

  for (let i = 0; i < LUT32_LENGTH; i += 3) {
    evaluateGradeRGB(
      G,
      standardCube[i],
      standardCube[i + 1],
      standardCube[i + 2],
      rgb,
      resolvedProfile
    );
    out[i] = clamp01(rgb[0]);
    out[i + 1] = clamp01(rgb[1]);
    out[i + 2] = clamp01(rgb[2]);
  }
  return out;
}

export function createLut32Object(
  data: Float32Array,
  options: {
    title?: string;
    sourceEngine?: string;
    applyPostGrade?: boolean;
  } = {}
): Lut3DObject {
  return {
    title: options.title || "Keyflow_Altair_Refresh",
    kind: "3d",
    size: LUT32_SIZE,
    dMin: [0, 0, 0],
    dMax: [1, 1, 1],
    data,
    sourceEngine: options.sourceEngine,
    applyPostGrade: Boolean(options.applyPostGrade),
  };
}

/**
 * Composes an active LUT (32^3 or arbitrary 3D/1D LUT) with Match Intensity alpha
 * y = (1 - alpha) * x + alpha * LUT(x), optional Camera Log input transform,
 * and optional post-LUT manual grading trims into a clean 32^3 Float32Array.
 */
export function composeLutTo32(
  activeLut: Lut3DObject | Float32Array,
  mixAlpha = 1.0,
  postGradeParams: Record<string, unknown> | null = null,
  inputProfile = "rec709"
): Float32Array {
  const alpha = clamp01(Number.isFinite(mixAlpha) ? mixAlpha : 1.0);
  const resolvedProfile = resolveLogProfileId(inputProfile);
  const useLog = isLogProfileActive(resolvedProfile);
  const G = postGradeParams ? prepareGrade(sanitizeParams(postGradeParams)) : null;

  const isRaw32 = activeLut instanceof Float32Array;
  const lutData = isRaw32 ? activeLut : activeLut.data;
  const lutSize = isRaw32 ? LUT32_SIZE : activeLut.size;
  const lutKind = isRaw32 ? "3d" : activeLut.kind || "3d";
  const dMin = isRaw32 ? ([0, 0, 0] as const) : activeLut.dMin || [0, 0, 0];
  const dMax = isRaw32 ? ([1, 1, 1] as const) : activeLut.dMax || [1, 1, 1];

  const standardCube = getStandardCube();
  const out = new Float32Array(LUT32_LENGTH);
  const inBuf = [0, 0, 0];
  const sampled = [0, 0, 0];
  const graded = [0, 0, 0];

  for (let i = 0; i < LUT32_LENGTH; i += 3) {
    let inR = standardCube[i];
    let inG = standardCube[i + 1];
    let inB = standardCube[i + 2];

    if (useLog) {
      applyLogProfileRGB(inR, inG, inB, resolvedProfile, inBuf);
      inR = inBuf[0];
      inG = inBuf[1];
      inB = inBuf[2];
    }

    if (lutKind === "1d") {
      const rgbIn = [inR, inG, inB];
      for (let c = 0; c < 3; c++) {
        const span = dMax[c] - dMin[c];
        const norm = clamp01((rgbIn[c] - dMin[c]) / (span > 1e-6 ? span : 1.0));
        const pos = norm * (lutSize - 1);
        const idx0 = Math.floor(pos);
        const idx1 = Math.min(lutSize - 1, idx0 + 1);
        const f = pos - idx0;
        sampled[c] = lutData[idx0 * 3 + c] * (1 - f) + lutData[idx1 * 3 + c] * f;
      }
    } else if (
      lutSize === LUT32_SIZE &&
      dMin[0] === 0 &&
      dMin[1] === 0 &&
      dMin[2] === 0 &&
      dMax[0] === 1 &&
      dMax[1] === 1 &&
      dMax[2] === 1
    ) {
      if (!useLog) {
        sampled[0] = lutData[i];
        sampled[1] = lutData[i + 1];
        sampled[2] = lutData[i + 2];
      } else {
        evaluateLut32Tetrahedral(lutData, inR, inG, inB, sampled);
      }
    } else {
      sampleLut3DTetrahedral(lutData, lutSize, inR, inG, inB, sampled, dMin, dMax);
    }

    let r = clamp01(inR + (sampled[0] - inR) * alpha);
    let g = clamp01(inG + (sampled[1] - inG) * alpha);
    let b = clamp01(inB + (sampled[2] - inB) * alpha);

    if (G) {
      evaluateGradeRGB(G, r, g, b, graded, "rec709");
      r = clamp01(graded[0]);
      g = clamp01(graded[1]);
      b = clamp01(graded[2]);
    }

    out[i] = r;
    out[i + 1] = g;
    out[i + 2] = b;
  }

  return out;
}

// ---------------------------------------------------------------------------
// Unified Packer 1: WebGL 512x64 2D-Packed Texture (16 cols x 2 rows of 32x32)
// Zero wasted texels, power-of-two dimensions, WebGL1/ES 1.00 compatible.
// ---------------------------------------------------------------------------
export function packLut32ToWebGLTexture512x64(
  lut32: Float32Array
): WebGLLutTexturePayload {
  const width = LUT32_TEX_WIDTH; // 512
  const height = LUT32_TEX_HEIGHT; // 64
  const cols = LUT32_TEX_COLS; // 16
  const rows = LUT32_TEX_ROWS; // 2
  const floatData = new Float32Array(width * height * 4);
  const byteData = new Uint8Array(width * height * 4);

  for (let b = 0; b < LUT32_SIZE; b++) {
    const tileX = b & 15; // b % 16
    const tileY = b >> 4; // Math.floor(b / 16)
    const basePx = tileX << 5; // tileX * 32
    const basePy = tileY << 5; // tileY * 32

    for (let g = 0; g < LUT32_SIZE; g++) {
      const py = basePy + g;
      const rowOffset = py * width + basePx;
      const srcRow = ((b << 5) + g) << 5;
      for (let r = 0; r < LUT32_SIZE; r++) {
        const srcIdx = (srcRow + r) * 3;
        const dstIdx = (rowOffset + r) * 4;
        const rv = clamp01(lut32[srcIdx]);
        const gv = clamp01(lut32[srcIdx + 1]);
        const bv = clamp01(lut32[srcIdx + 2]);

        floatData[dstIdx] = rv;
        floatData[dstIdx + 1] = gv;
        floatData[dstIdx + 2] = bv;
        floatData[dstIdx + 3] = 1.0;

        byteData[dstIdx] = Math.round(rv * 255.0);
        byteData[dstIdx + 1] = Math.round(gv * 255.0);
        byteData[dstIdx + 2] = Math.round(bv * 255.0);
        byteData[dstIdx + 3] = 255;
      }
    }
  }

  return {
    width,
    height,
    size: LUT32_SIZE,
    cols,
    rows,
    dMin: [0, 0, 0],
    dMax: [1, 1, 1],
    floatData,
    byteData,
  };
}

// ---------------------------------------------------------------------------
// Unified Packer 2: Iridas .cube Serializer (32^3 = 32,768 rows, .6f)
// ---------------------------------------------------------------------------
export function serializeCube32(
  lut32: Float32Array,
  title = "Keyflow_Altair_Refresh"
): string {
  const safeTitle = String(title || "Keyflow_Altair_Refresh")
    .replace(/[\r\n"]+/g, " ")
    .trim()
    .slice(0, 64) || "Keyflow_Altair_Refresh";

  const lines = new Array<string>(LUT32_NODES + 5);
  lines[0] = "# Created by ToneBench v0.9.6a";
  lines[1] = `TITLE "${safeTitle}"`;
  lines[2] = "LUT_3D_SIZE 32";
  lines[3] = "DOMAIN_MIN 0.0 0.0 0.0";
  lines[4] = "DOMAIN_MAX 1.0 1.0 1.0";

  let row = 5;
  for (let i = 0; i < LUT32_LENGTH; i += 3) {
    const r = clamp01(Number.isFinite(lut32[i]) ? lut32[i] : 0.0);
    const g = clamp01(Number.isFinite(lut32[i + 1]) ? lut32[i + 1] : 0.0);
    const b = clamp01(Number.isFinite(lut32[i + 2]) ? lut32[i + 2] : 0.0);
    lines[row++] = `${r.toFixed(6)} ${g.toFixed(6)} ${b.toFixed(6)}`;
  }

  return `${lines.join("\n")}\n`;
}

// ---------------------------------------------------------------------------
// Unified Packer 3: Keyflow Mobile .kfplug 512x64 Lossless PNG + GLSL ES 1.00
// Pure TypeScript deterministic PNG encoder (zero DOM/Canvas dependency,
// works identically in Browser main thread and Web Worker).
// ---------------------------------------------------------------------------
const CRC32_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) {
      c = (c & 1) !== 0 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    }
    table[n] = c >>> 0;
  }
  return table;
})();

function crc32(bytes: Uint8Array, offset: number, length: number): number {
  let c = 0xffffffff;
  const end = offset + length;
  for (let i = offset; i < end; i++) {
    c = CRC32_TABLE[(c ^ bytes[i]) & 0xff] ^ (c >>> 8);
  }
  return (c ^ 0xffffffff) >>> 0;
}

function adler32(bytes: Uint8Array): number {
  let s1 = 1;
  let s2 = 0;
  for (let i = 0; i < bytes.length; i++) {
    s1 = (s1 + bytes[i]) % 65521;
    s2 = (s2 + s1) % 65521;
  }
  return ((s2 << 16) | s1) >>> 0;
}

function writeU32BE(buf: Uint8Array, offset: number, val: number): void {
  buf[offset] = (val >>> 24) & 0xff;
  buf[offset + 1] = (val >>> 16) & 0xff;
  buf[offset + 2] = (val >>> 8) & 0xff;
  buf[offset + 3] = val & 0xff;
}

function makePngChunk(type: string, data: Uint8Array): Uint8Array {
  const chunk = new Uint8Array(12 + data.length);
  writeU32BE(chunk, 0, data.length);
  chunk[4] = type.charCodeAt(0);
  chunk[5] = type.charCodeAt(1);
  chunk[6] = type.charCodeAt(2);
  chunk[7] = type.charCodeAt(3);
  chunk.set(data, 8);
  const crc = crc32(chunk, 4, 4 + data.length);
  writeU32BE(chunk, 8 + data.length, crc);
  return chunk;
}

/**
 * Encodes an RGBA Uint8Array into a valid lossless PNG (zlib stored blocks,
 * filter-none scanlines). At 512x64 RGBA, raw PNG is ~131 KB and compresses
 * cleanly inside the .kfplug DEFLATE zip archive.
 */
export function encodeRgbaToPng(
  rgba: Uint8Array,
  width: number,
  height: number
): Uint8Array {
  const rowBytes = width * 4;
  const rawScanlines = new Uint8Array((rowBytes + 1) * height);
  for (let y = 0; y < height; y++) {
    const dst = y * (rowBytes + 1);
    rawScanlines[dst] = 0; // PNG filter type 0 (None)
    rawScanlines.set(rgba.subarray(y * rowBytes, (y + 1) * rowBytes), dst + 1);
  }

  // Wrap raw scanlines in valid RFC 1950 zlib stream with uncompressed DEFLATE blocks
  const maxBlock = 65535;
  const numBlocks = Math.ceil(rawScanlines.length / maxBlock);
  const zlibOut = new Uint8Array(2 + rawScanlines.length + numBlocks * 5 + 4);
  zlibOut[0] = 0x78; // CMF: Deflate, 32K window
  zlibOut[1] = 0x01; // FLG: no dict, check bits (0x7801 % 31 === 0)

  let srcPos = 0;
  let dstPos = 2;
  for (let b = 0; b < numBlocks; b++) {
    const len = Math.min(maxBlock, rawScanlines.length - srcPos);
    const isFinal = b === numBlocks - 1 ? 1 : 0;
    zlibOut[dstPos++] = isFinal; // BFINAL | BTYPE=00 (stored)
    zlibOut[dstPos++] = len & 0xff;
    zlibOut[dstPos++] = (len >>> 8) & 0xff;
    const nlen = ~len & 0xffff;
    zlibOut[dstPos++] = nlen & 0xff;
    zlibOut[dstPos++] = (nlen >>> 8) & 0xff;
    zlibOut.set(rawScanlines.subarray(srcPos, srcPos + len), dstPos);
    srcPos += len;
    dstPos += len;
  }
  writeU32BE(zlibOut, dstPos, adler32(rawScanlines));

  const ihdr = new Uint8Array(13);
  writeU32BE(ihdr, 0, width);
  writeU32BE(ihdr, 4, height);
  ihdr[8] = 8; // bit depth 8
  ihdr[9] = 6; // color type 6 (RGBA)
  ihdr[10] = 0; // compression
  ihdr[11] = 0; // filter
  ihdr[12] = 0; // interlace

  const sig = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]);
  const ihdrChunk = makePngChunk("IHDR", ihdr);
  const idatChunk = makePngChunk("IDAT", zlibOut);
  const iendChunk = makePngChunk("IEND", new Uint8Array(0));

  const png = new Uint8Array(
    sig.length + ihdrChunk.length + idatChunk.length + iendChunk.length
  );
  let off = 0;
  png.set(sig, off);
  off += sig.length;
  png.set(ihdrChunk, off);
  off += ihdrChunk.length;
  png.set(idatChunk, off);
  off += idatChunk.length;
  png.set(iendChunk, off);
  return png;
}

/** Encodes a 32^3 Float32Array LUT directly into a 512x64 lossless PNG texture. */
export function encodeLut32ToPng512x64(lut32: Float32Array): Uint8Array {
  const packed = packLut32ToWebGLTexture512x64(lut32);
  return encodeRgbaToPng(packed.byteData as Uint8Array, packed.width, packed.height);
}

/**
 * Pure GLSL ES 1.00 tetrahedral lookup for a 512x64 2D-packed 32^3 LUT texture
 * (16 cols x 2 rows of 32x32 slices, uniform sampler2D uLutTex).
 * 1:1 twin of evaluateLut32Tetrahedral() and PREVIEW_FRAGMENT kfSampleLut3D().
 */
export const GLSL_TETRAHEDRAL_LUT32_512X64 = `vec3 kfFetchLut32Node(float rIdx, float gIdx, float bIdx) {
    float tileY = floor((bIdx + 0.001) / 16.0);
    float tileX = floor(bIdx - tileY * 16.0 + 0.5);
    float px = tileX * 32.0 + rIdx;
    float py = tileY * 32.0 + gIdx;
    vec2 uv = (vec2(px, py) + vec2(0.5)) / vec2(512.0, 64.0);
    return texture2D(uLutTex, uv).rgb;
}

vec3 kfSampleLut32Tetrahedral(vec3 rgb) {
    vec3 pos = clamp(rgb, 0.0, 1.0) * 31.0;
    vec3 i0 = min(floor(pos), vec3(31.0));
    vec3 i1 = min(i0 + vec3(1.0), vec3(31.0));
    vec3 f = pos - i0;

    vec3 c000 = kfFetchLut32Node(i0.r, i0.g, i0.b);
    vec3 c111 = kfFetchLut32Node(i1.r, i1.g, i1.b);

    if (f.r >= f.g) {
        if (f.g >= f.b) {
            vec3 c100 = kfFetchLut32Node(i1.r, i0.g, i0.b);
            vec3 c110 = kfFetchLut32Node(i1.r, i1.g, i0.b);
            return c000 + f.r * (c100 - c000) + f.g * (c110 - c100) + f.b * (c111 - c110);
        } else if (f.r >= f.b) {
            vec3 c100 = kfFetchLut32Node(i1.r, i0.g, i0.b);
            vec3 c101 = kfFetchLut32Node(i1.r, i0.g, i1.b);
            return c000 + f.r * (c100 - c000) + f.b * (c101 - c100) + f.g * (c111 - c101);
        } else {
            vec3 c001 = kfFetchLut32Node(i0.r, i0.g, i1.b);
            vec3 c101 = kfFetchLut32Node(i1.r, i0.g, i1.b);
            return c000 + f.b * (c001 - c000) + f.r * (c101 - c001) + f.g * (c111 - c101);
        }
    } else {
        if (f.b > f.g) {
            vec3 c001 = kfFetchLut32Node(i0.r, i0.g, i1.b);
            vec3 c011 = kfFetchLut32Node(i0.r, i1.g, i1.b);
            return c000 + f.b * (c001 - c000) + f.g * (c011 - c001) + f.r * (c111 - c011);
        } else if (f.b > f.r) {
            vec3 c010 = kfFetchLut32Node(i0.r, i1.g, i0.b);
            vec3 c011 = kfFetchLut32Node(i0.r, i1.g, i1.b);
            return c000 + f.g * (c010 - c000) + f.b * (c011 - c010) + f.r * (c111 - c011);
        } else {
            vec3 c010 = kfFetchLut32Node(i0.r, i1.g, i0.b);
            vec3 c110 = kfFetchLut32Node(i1.r, i1.g, i0.b);
            return c000 + f.g * (c010 - c000) + f.r * (c110 - c010) + f.b * (c111 - c110);
        }
    }
}
`;
