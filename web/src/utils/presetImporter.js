import JSZip from "jszip";
import {
  DEFAULT_PARAMS,
  PARAM_LIMITS,
  prepareGrade,
  gradeRGB,
  sanitizeParams,
  clamp,
} from "./gradeEngine.js";
import { UI_PARAM_LIMITS } from "./paramSchema.js";
import { sanitizeMetadataText } from "./hostGuard.js";

// ---------------------------------------------------------------------------
// .cube / .lut parsing
// ---------------------------------------------------------------------------

export function parseLutText(text) {
  const rawLines = text.split(/\r?\n/);
  let title = "";
  let size3d = 0;
  let size1d = 0;
  let dMin = [0, 0, 0];
  let dMax = [1, 1, 1];
  const values = [];

  for (let line of rawLines) {
    line = line.trim();
    if (!line || line.startsWith("#")) continue;

    if (/^TITLE\b/i.test(line)) {
      title = line.replace(/^TITLE\s*/i, "").replace(/^"|"$/g, "").trim();
      continue;
    }

    const hashIdx = line.indexOf("#");
    if (hashIdx !== -1) {
      line = line.slice(0, hashIdx).trim();
      if (!line) continue;
    }

    const first = line.charCodeAt(0);
    const isNumeric = (first >= 48 && first <= 57) || first === 45 || first === 43 || first === 46;
    if (!isNumeric) {
      const parts = line.split(/\s+/);
      const key = parts[0].toUpperCase();
      if (key === "LUT_3D_SIZE") {
        size3d = parseInt(parts[1], 10);
      } else if (key === "LUT_1D_SIZE") {
        size1d = parseInt(parts[1], 10);
      } else if (key === "DOMAIN_MIN" && parts.length >= 4) {
        dMin = parts.slice(1, 4).map(Number);
      } else if (key === "DOMAIN_MAX" && parts.length >= 4) {
        dMax = parts.slice(1, 4).map(Number);
      }
      continue;
    }
    const parts = line.split(/\s+/);
    if (parts.length >= 3) {
      values.push(Number(parts[0]), Number(parts[1]), Number(parts[2]));
    }
  }

  const nodes = values.length / 3;
  if (!size3d && !size1d) {
    // Header-less ".lut": accept a perfect-cube node count as a 3D LUT.
    const cube = Math.round(Math.cbrt(nodes));
    if (cube >= 2 && cube * cube * cube === nodes) size3d = cube;
    else if (nodes >= 2) size1d = nodes;
  }

  if (size3d) {
    if (size3d < 2 || size3d > 129 || nodes !== size3d * size3d * size3d) {
      throw new Error(`Invalid 3D LUT: expected ${size3d}^3 entries, found ${nodes}.`);
    }
  } else if (size1d) {
    if (size1d < 2 || nodes !== size1d) {
      throw new Error(`Invalid 1D LUT: expected ${size1d} entries, found ${nodes}.`);
    }
  } else {
    throw new Error("Could not read any LUT data from this file.");
  }

  for (let i = 0; i < values.length; i++) {
    if (!Number.isFinite(values[i])) throw new Error("LUT contains non-numeric values.");
  }

  const domainOk =
    dMin.length === 3 &&
    dMax.length === 3 &&
    dMin.every(Number.isFinite) &&
    dMax.every(Number.isFinite) &&
    dMin.every((v, i) => dMax[i] > v + 1e-6);

  return {
    title: sanitizeMetadataText(title, "", 64),
    kind: size3d ? "3d" : "1d",
    size: size3d || size1d,
    dMin: domainOk ? dMin : [0, 0, 0],
    dMax: domainOk ? dMax : [1, 1, 1],
    data: Float32Array.from(values),
  };
}

export function makeLutSampler(lut) {
  const N = lut.size;
  const d = lut.data;
  const norm = (v, c) => {
    const range = lut.dMax[c] - lut.dMin[c];
    return clamp((v - lut.dMin[c]) / (range > 1e-6 ? range : 1), 0, 1);
  };

  if (lut.kind === "1d") {
    return (r, g, b, out) => {
      const rgb = [r, g, b];
      for (let c = 0; c < 3; c++) {
        const x = norm(rgb[c], c) * (N - 1);
        const i0 = Math.floor(x);
        const i1 = Math.min(N - 1, i0 + 1);
        const f = x - i0;
        out[c] = d[i0 * 3 + c] * (1 - f) + d[i1 * 3 + c] * f;
      }
    };
  }

  // Standard Adobe/Resolve .cube 3D LUT: R varies fastest, G second, B slowest.
  // Tetrahedral interpolation for exact vertex & diagonal fidelity.
  return (r, g, b, out) => {
    const x = norm(r, 0) * (N - 1);
    const y = norm(g, 1) * (N - 1);
    const z = norm(b, 2) * (N - 1);
    const x0 = Math.floor(x);
    const y0 = Math.floor(y);
    const z0 = Math.floor(z);
    const x1 = Math.min(N - 1, x0 + 1);
    const y1 = Math.min(N - 1, y0 + 1);
    const z1 = Math.min(N - 1, z0 + 1);
    const fx = x - x0;
    const fy = y - y0;
    const fz = z - z0;

    const i000 = ((z0 * N + y0) * N + x0) * 3;
    const i111 = ((z1 * N + y1) * N + x1) * 3;

    if (fx >= fy) {
      if (fy >= fz) {
        // fx >= fy >= fz
        const i100 = ((z0 * N + y0) * N + x1) * 3;
        const i110 = ((z0 * N + y1) * N + x1) * 3;
        for (let c = 0; c < 3; c++) {
          const v000 = d[i000 + c];
          const v100 = d[i100 + c];
          const v110 = d[i110 + c];
          const v111 = d[i111 + c];
          out[c] = v000 + fx * (v100 - v000) + fy * (v110 - v100) + fz * (v111 - v110);
        }
      } else if (fx >= fz) {
        // fx >= fz > fy
        const i100 = ((z0 * N + y0) * N + x1) * 3;
        const i101 = ((z1 * N + y0) * N + x1) * 3;
        for (let c = 0; c < 3; c++) {
          const v000 = d[i000 + c];
          const v100 = d[i100 + c];
          const v101 = d[i101 + c];
          const v111 = d[i111 + c];
          out[c] = v000 + fx * (v100 - v000) + fz * (v101 - v100) + fy * (v111 - v101);
        }
      } else {
        // fz > fx >= fy
        const i001 = ((z1 * N + y0) * N + x0) * 3;
        const i101 = ((z1 * N + y0) * N + x1) * 3;
        for (let c = 0; c < 3; c++) {
          const v000 = d[i000 + c];
          const v001 = d[i001 + c];
          const v101 = d[i101 + c];
          const v111 = d[i111 + c];
          out[c] = v000 + fz * (v001 - v000) + fx * (v101 - v001) + fy * (v111 - v101);
        }
      }
    } else if (fz > fy) {
      // fz > fy > fx
      const i001 = ((z1 * N + y0) * N + x0) * 3;
      const i011 = ((z1 * N + y1) * N + x0) * 3;
      for (let c = 0; c < 3; c++) {
        const v000 = d[i000 + c];
        const v001 = d[i001 + c];
        const v011 = d[i011 + c];
        const v111 = d[i111 + c];
        out[c] = v000 + fz * (v001 - v000) + fy * (v011 - v001) + fx * (v111 - v011);
      }
    } else if (fz > fx) {
      // fy >= fz > fx
      const i010 = ((z0 * N + y1) * N + x0) * 3;
      const i011 = ((z1 * N + y1) * N + x0) * 3;
      for (let c = 0; c < 3; c++) {
        const v000 = d[i000 + c];
        const v010 = d[i010 + c];
        const v011 = d[i011 + c];
        const v111 = d[i111 + c];
        out[c] = v000 + fy * (v010 - v000) + fz * (v011 - v010) + fx * (v111 - v011);
      }
    } else {
      // fy > fx >= fz
      const i010 = ((z0 * N + y1) * N + x0) * 3;
      const i110 = ((z0 * N + y1) * N + x1) * 3;
      for (let c = 0; c < 3; c++) {
        const v000 = d[i000 + c];
        const v010 = d[i010 + c];
        const v110 = d[i110 + c];
        const v111 = d[i111 + c];
        out[c] = v000 + fy * (v010 - v000) + fx * (v110 - v010) + fz * (v111 - v110);
      }
    }
  };
}

export function evaluate3DLut(lut, r, g, b, out = [0, 0, 0]) {
  const sample = makeLutSampler(lut);
  sample(r, g, b, out);
  return out;
}

// UI ranges used while fitting (keeps fitted values inside slider ranges).
const FIT_LIMITS = Object.fromEntries(
  Object.entries(UI_PARAM_LIMITS).filter(([k]) => k !== "gradeMix")
);

// Extracts tone curve + grading parameters from a LUT by least-squares fit of
// the Color Match Engine v2 equation (coordinate descent over a sample grid).
export function fitParamsToLut(lut) {
  const sample = makeLutSampler(lut);
  const pts = [];
  const tmp = [0, 0, 0];

  const grid = 6;
  for (let b = 0; b < grid; b++)
    for (let g = 0; g < grid; g++)
      for (let r = 0; r < grid; r++) {
        const x = r / (grid - 1), y = g / (grid - 1), z = b / (grid - 1);
        sample(x, y, z, tmp);
        pts.push({ r: x, g: y, b: z, tr: tmp[0], tg: tmp[1], tb: tmp[2], w: 1 });
      }
  // Neutral ramp carries the tonal curve: weight it higher.
  for (let i = 0; i <= 24; i++) {
    const v = i / 24;
    sample(v, v, v, tmp);
    pts.push({ r: v, g: v, b: v, tr: tmp[0], tg: tmp[1], tb: tmp[2], w: 3 });
  }

  const out = [0, 0, 0];
  // Small ridge penalty keeps the solution sparse among near-equivalent fits.
  const REG = 0.004;
  const loss = (params) => {
    const G = prepareGrade(params);
    let e = 0;
    for (const p of pts) {
      gradeRGB(G, p.r, p.g, p.b, out);
      const dr = out[0] - p.tr, dg = out[1] - p.tg, db = out[2] - p.tb;
      e += p.w * (dr * dr + dg * dg + db * db);
    }
    for (const key of Object.keys(FIT_LIMITS)) {
      const dv = params[key] - DEFAULT_PARAMS[key];
      e += REG * dv * dv;
    }
    return e;
  };

  let best = { ...DEFAULT_PARAMS };
  let bestLoss = loss(best);
  const keys = Object.keys(FIT_LIMITS);
  let step = 0.25;

  for (let round = 0; round < 14; round++) {
    for (let sweep = 0; sweep < 2; sweep++) {
      for (const key of keys) {
        const [lo, hi] = FIT_LIMITS[key];
        const scale = key === "exposure" ? 1.5 : 1;
        for (const dir of [1, -1]) {
          const cand = { ...best, [key]: clamp(best[key] + dir * step * scale, lo, hi) };
          const l = loss(cand);
          if (l < bestLoss - 1e-9) {
            best = cand;
            bestLoss = l;
          }
        }
      }
    }
    step *= 0.62;
  }

  let totalW = 0;
  for (const p of pts) totalW += p.w;
  const rms = Math.sqrt(bestLoss / (totalW * 3));

  const rounded = {};
  for (const key of Object.keys(best)) rounded[key] = Math.round(best[key] * 100) / 100;
  rounded.gradeMix = 1.0;
  return { params: sanitizeParams(rounded), rms };
}

export async function importLutFile(file) {
  if (file.size > 40 * 1024 * 1024) throw new Error("LUT file is too large (limit 40 MB).");
  const text = await file.text();
  const lut = parseLutText(text);
  const { params, rms } = fitParamsToLut(lut);
  const baseName = file.name.replace(/\.[^/.]+$/, "");
  return {
    kind: lut.kind === "3d" ? `3D LUT ${lut.size}^3` : `1D LUT ${lut.size}`,
    name: lut.title || sanitizeMetadataText(baseName, "Imported LUT", 48),
    author: "",
    description: "",
    params,
    rms,
  };
}

// ---------------------------------------------------------------------------
// .kfplug import
// ---------------------------------------------------------------------------

export async function importKfplugFile(file) {
  if (file.size > 40 * 1024 * 1024) throw new Error("Plugin file is too large (limit 40 MB).");

  let zip;
  try {
    zip = await JSZip.loadAsync(file);
  } catch {
    throw new Error("This .kfplug file could not be opened as a plugin archive.");
  }

  const readJson = async (entry) => {
    const text = await entry.async("string");
    if (text.length > 2 * 1024 * 1024) throw new Error("Plugin metadata is unexpectedly large.");
    return JSON.parse(text);
  };

  let manifest = {};
  const manifestEntry = zip.file("manifest.json");
  if (manifestEntry) {
    try {
      manifest = await readJson(manifestEntry);
    } catch {
      manifest = {};
    }
  }

  const effectEntry = zip.file(/^effects\/[^/]+\/effect\.json$/)[0];
  if (!effectEntry) throw new Error("No effect.json found in this plugin.");

  let effect;
  try {
    effect = await readJson(effectEntry);
  } catch {
    throw new Error("effect.json in this plugin is not valid JSON.");
  }

  const source =
    (effect.presets && effect.presets[0] && effect.presets[0].values) ||
    effect.newInstanceValues ||
    null;
  if (!source || typeof source !== "object") {
    throw new Error("No grading parameters found in this plugin.");
  }

  const known = Object.keys(source).filter((k) => k in PARAM_LIMITS);
  if (known.length === 0) {
    throw new Error("This plugin does not use the Match Grade parameter set.");
  }

  const hybridMeta = effect.cinemaHybrid && typeof effect.cinemaHybrid === "object"
    ? effect.cinemaHybrid
    : {};
  const params = sanitizeParams({ ...DEFAULT_PARAMS, ...source, ...hybridMeta });

  const rawName = manifest.name || effect.name || file.name.replace(/\.[^/.]+$/, "");
  const wrapped = /^Match Grade \((.*)\)$/.exec(String(rawName));
  const name = sanitizeMetadataText(wrapped ? wrapped[1] : String(rawName), "Imported Plugin", 64);

  return {
    kind: "KFPLUG",
    name,
    author: sanitizeMetadataText(manifest.author, "", 64),
    description: sanitizeMetadataText(manifest.description, "", 200),
    params,
    rms: null,
  };
}
