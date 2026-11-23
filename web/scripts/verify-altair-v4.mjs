import { analyzeEngineAltairV4 } from "../src/utils/altairV4Engine.js";
import { prepareGrade, evaluateGradeRGB } from "../src/utils/gradeEngine.js";
import { srgbToLinearChannel, rgbLinearToOklab } from "../src/utils/colorMatcher.js";
import { buildKfplugPackageData } from "../src/utils/kfplugPackager.js";

const RAD_TO_DEG = 180.0 / Math.PI;

function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function clamp01(v) {
  return Math.min(1.0, Math.max(0.0, v));
}

function toOklab(rgb) {
  const out = [0, 0, 0];
  rgbLinearToOklab(
    srgbToLinearChannel(rgb[0]),
    srgbToLinearChannel(rgb[1]),
    srgbToLinearChannel(rgb[2]),
    out
  );
  const C = Math.hypot(out[1], out[2]);
  let hDeg = Math.atan2(out[2], out[1]) * RAD_TO_DEG;
  if (hDeg < 0) hDeg += 360.0;
  return { L: out[0], a: out[1], b: out[2], C, hDeg };
}

function angleDiffDeg(h1, h2) {
  let d = ((h1 - h2 + 540.0) % 360.0) - 180.0;
  return d;
}

function buildClusterBuffer(clusters, numPixels = 4096, seed = 42) {
  const rng = mulberry32(seed);
  const buf = new Uint8ClampedArray(numPixels * 4);
  let totalW = 0;
  for (const c of clusters) totalW += c.weight;
  const cdf = [];
  let acc = 0;
  for (const c of clusters) {
    acc += c.weight / totalW;
    cdf.push(acc);
  }
  for (let i = 0; i < numPixels; i++) {
    const u = rng();
    let ci = clusters.length - 1;
    for (let k = 0; k < cdf.length; k++) {
      if (u <= cdf[k]) {
        ci = k;
        break;
      }
    }
    const c = clusters[ci];
    const jitter = c.jitter ?? 0.03;
    const r = clamp01(c.rgb[0] + (rng() * 2 - 1) * jitter);
    const g = clamp01(c.rgb[1] + (rng() * 2 - 1) * jitter);
    const b = clamp01(c.rgb[2] + (rng() * 2 - 1) * jitter);
    const idx = i * 4;
    buf[idx] = Math.round(r * 255);
    buf[idx + 1] = Math.round(g * 255);
    buf[idx + 2] = Math.round(b * 255);
    buf[idx + 3] = 255;
  }
  return buf;
}

function evalSwatch(G, rgb) {
  const out = [0, 0, 0];
  evaluateGradeRGB(G, rgb[0], rgb[1], rgb[2], out, false);
  const inLab = toOklab(rgb);
  const outLab = toOklab(out);
  return { inRgb: rgb, outRgb: out, inLab, outLab };
}

function countShadowReversals(G) {
  let prevY = -1;
  let reversals = 0;
  const out = [0, 0, 0];
  for (let code = 0; code <= 32; code++) {
    const v = code / 255.0;
    evaluateGradeRGB(G, v, v, v, out, false);
    const y = 0.2126 * out[0] + 0.7152 * out[1] + 0.0722 * out[2];
    if (prevY >= 0 && y < prevY - 1e-6) reversals++;
    prevY = y;
  }
  return reversals;
}

function fmtSwatch(label, res) {
  const { inLab, outLab, outRgb } = res;
  const dL = outLab.L - inLab.L;
  const dH = angleDiffDeg(outLab.hDeg, inLab.hDeg);
  return (
    `  ${label.padEnd(22)} ` +
    `RGB [${outRgb.map((x) => x.toFixed(3)).join(", ")}] | ` +
    `L ${inLab.L.toFixed(3)}->${outLab.L.toFixed(3)} (${dL >= 0 ? "+" : ""}${dL.toFixed(3)}) | ` +
    `C ${inLab.C.toFixed(3)}->${outLab.C.toFixed(3)} | ` +
    `h ${inLab.hDeg.toFixed(1)}°->${outLab.hDeg.toFixed(1)}° (${dH >= 0 ? "+" : ""}${dH.toFixed(1)}°)`
  );
}

let failures = 0;
function assertCheck(name, condition, detail) {
  const status = condition ? "PASS" : "FAIL";
  if (!condition) failures++;
  console.log(`  [${status}] ${name}${detail ? ` (${detail})` : ""}`);
}

// =========================================================================
// SCENARIO 1: Bright Cyan-Blue Sky + White Clouds Ref -> Barbie Target
// =========================================================================
console.log("\n=== SCENARIO 1: Bright Cyan-Blue Sky + White Clouds Ref -> Barbie Target ===");
const animeSkyRef = buildClusterBuffer(
  [
    { rgb: [0.24, 0.64, 0.96], weight: 0.28, jitter: 0.04 }, // vibrant anime cyan-blue sky
    { rgb: [0.42, 0.78, 0.98], weight: 0.16, jitter: 0.03 }, // brighter horizon blue sky
    { rgb: [0.95, 0.96, 0.99], weight: 0.38, jitter: 0.025 }, // bright white clouds
    { rgb: [0.74, 0.82, 0.90], weight: 0.10, jitter: 0.03 }, // cool cloud underside
    { rgb: [0.14, 0.20, 0.26], weight: 0.08, jitter: 0.04 }, // dark distant skyline/trees
  ],
  4096,
  101
);

const barbieTgt = buildClusterBuffer(
  [
    { rgb: [0.92, 0.45, 0.68], weight: 0.24, jitter: 0.04 }, // vibrant pink structures/dress
    { rgb: [0.92, 0.92, 0.92], weight: 0.20, jitter: 0.03 }, // white pillars & trim
    { rgb: [0.88, 0.70, 0.58], weight: 0.10, jitter: 0.03 }, // fair warm skin
    { rgb: [0.78, 0.57, 0.44], weight: 0.08, jitter: 0.03 }, // medium warm skin
    { rgb: [0.50, 0.74, 0.92], weight: 0.18, jitter: 0.04 }, // daylight sky
    { rgb: [0.14, 0.18, 0.14], weight: 0.10, jitter: 0.03 }, // dark palms & foliage
    { rgb: [0.28, 0.30, 0.34], weight: 0.10, jitter: 0.04 }, // distant mountains / mid-shadows
  ],
  4096,
  202
);

const p1 = analyzeEngineAltairV4(animeSkyRef, barbieTgt, {
  numPixels: 4096,
  targetNumPixels: 4096,
});
const G1 = prepareGrade(p1);
console.log(
  `  Sliders: ev=${p1.exposure} con=${p1.contrast} sh=${p1.shadows} hi=${p1.highlights} ` +
    `tmp=${p1.temp} tnt=${p1.tint} sat=${p1.sat} vib=${p1.vib} ` +
    `gain=[${p1.gainR},${p1.gainG},${p1.gainB}]`
);

const s1White = evalSwatch(G1, [0.92, 0.92, 0.92]);
const s1WhiteFab = evalSwatch(G1, [0.85, 0.85, 0.85]);
const s1Pink = evalSwatch(G1, [0.92, 0.45, 0.68]);
const s1FairSkin = evalSwatch(G1, [0.88, 0.70, 0.58]);
const s1MedSkin = evalSwatch(G1, [0.78, 0.57, 0.44]);
const s1Sky = evalSwatch(G1, [0.50, 0.74, 0.92]);
const s1DarkPalm = evalSwatch(G1, [0.12, 0.15, 0.12]);
const s1MidShadow = evalSwatch(G1, [0.24, 0.26, 0.28]);
const s1Black = evalSwatch(G1, [0.04, 0.04, 0.04]);

console.log(fmtSwatch("White Pillar", s1White));
console.log(fmtSwatch("White Fabric", s1WhiteFab));
console.log(fmtSwatch("Vibrant Pink", s1Pink));
console.log(fmtSwatch("Fair Skin", s1FairSkin));
console.log(fmtSwatch("Medium Skin", s1MedSkin));
console.log(fmtSwatch("Target Sky", s1Sky));
console.log(fmtSwatch("Dark Palm", s1DarkPalm));
console.log(fmtSwatch("Mid-Shadow Mtn", s1MidShadow));
console.log(fmtSwatch("Deep Black", s1Black));

const kf1 = buildKfplugPackageData(p1, "AnimeSky_Barbie", "TFBAGAS", "Sky to Barbie test");
const fragBytes1 = Buffer.byteLength(kf1.shaderPass0, "utf8");
const rev1 = countShadowReversals(G1);

assertCheck(
  "White Pillar stays neutral (C < 0.025)",
  s1White.outLab.C < 0.025,
  `C=${s1White.outLab.C.toFixed(4)}`
);
assertCheck(
  "White Pillar stays bright (L > 0.89)",
  s1White.outLab.L > 0.89,
  `L=${s1White.outLab.L.toFixed(4)}`
);
assertCheck(
  "White Fabric stays neutral (C < 0.028)",
  s1WhiteFab.outLab.C < 0.028,
  `C=${s1WhiteFab.outLab.C.toFixed(4)}`
);
assertCheck(
  "Vibrant Pink retains clean chroma (C > 0.09)",
  s1Pink.outLab.C > 0.09,
  `C=${s1Pink.outLab.C.toFixed(4)}`
);
assertCheck(
  "Vibrant Pink avoids muddy brown collapse (hue stays pink/magenta [315..360 or 0..20])",
  s1Pink.outLab.hDeg >= 315.0 || s1Pink.outLab.hDeg <= 20.0,
  `h=${s1Pink.outLab.hDeg.toFixed(1)}°`
);
assertCheck(
  "Fair Skin keeps warmth & saturation (h in [28,58], C >= 0.82*inC)",
  s1FairSkin.outLab.hDeg >= 28.0 &&
    s1FairSkin.outLab.hDeg <= 58.0 &&
    s1FairSkin.outLab.C >= s1FairSkin.inLab.C * 0.82,
  `h=${s1FairSkin.outLab.hDeg.toFixed(1)}°, C=${s1FairSkin.outLab.C.toFixed(3)}/${s1FairSkin.inLab.C.toFixed(3)}`
);
assertCheck(
  "Medium Skin keeps warmth & saturation (h in [28,58], C >= 0.82*inC)",
  s1MedSkin.outLab.hDeg >= 28.0 &&
    s1MedSkin.outLab.hDeg <= 58.0 &&
    s1MedSkin.outLab.C >= s1MedSkin.inLab.C * 0.82,
  `h=${s1MedSkin.outLab.hDeg.toFixed(1)}°, C=${s1MedSkin.outLab.C.toFixed(3)}/${s1MedSkin.inLab.C.toFixed(3)}`
);
assertCheck(
  "Target Sky adopts crisp anime sky mood (b < -0.07, C >= 0.085)",
  s1Sky.outLab.b < -0.07 && s1Sky.outLab.C >= 0.085,
  `b=${s1Sky.outLab.b.toFixed(4)}, C=${s1Sky.outLab.C.toFixed(4)}`
);
assertCheck(
  "Dark Palm shadow anchor stays deep (dL <= +0.020)",
  s1DarkPalm.outLab.L - s1DarkPalm.inLab.L <= 0.020,
  `dL=${(s1DarkPalm.outLab.L - s1DarkPalm.inLab.L).toFixed(4)}`
);
assertCheck(
  "Mid-Shadow mountain avoids milky haze lift (dL <= +0.025)",
  s1MidShadow.outLab.L - s1MidShadow.inLab.L <= 0.025,
  `dL=${(s1MidShadow.outLab.L - s1MidShadow.inLab.L).toFixed(4)}`
);
assertCheck("Zero shadow reversals (0..32)", rev1 === 0, `rev=${rev1}`);
assertCheck(
  ".kfplug valid & pass0.frag < 29.5 KB",
  kf1.validation.valid && fragBytes1 < 29500,
  `valid=${kf1.validation.valid}, size=${fragBytes1} B`
);

// =========================================================================
// SCENARIO 1B: Pure High-Key Saturated Sky + 50% White Clouds (Zero Shadows Ref)
// -> Bright Pink + Warm Skin + White Pillar + Dark Palm/Mountain Target
// =========================================================================
console.log("\n=== SCENARIO 1B: Pure High-Key White Clouds + Saturated Blue Sky Ref -> Barbie Target ===");
const pureHighKeyCloudRef = buildClusterBuffer(
  [
    { rgb: [0.22, 0.62, 0.96], weight: 0.36, jitter: 0.03 }, // saturated cyan-blue sky
    { rgb: [0.48, 0.79, 0.98], weight: 0.14, jitter: 0.03 }, // bright sky gradient
    { rgb: [0.95, 0.96, 0.99], weight: 0.50, jitter: 0.02 }, // massive high-key white clouds (L > 0.92)
  ],
  4096,
  155
);
const p1b = analyzeEngineAltairV4(pureHighKeyCloudRef, barbieTgt, {
  numPixels: 4096,
  targetNumPixels: 4096,
});
const G1b = prepareGrade(p1b);
console.log(
  `  Sliders: ev=${p1b.exposure} con=${p1b.contrast} sh=${p1b.shadows} hi=${p1b.highlights} ` +
    `tmp=${p1b.temp} tnt=${p1b.tint} sat=${p1b.sat} vib=${p1b.vib}`
);
const s1bWhite = evalSwatch(G1b, [0.92, 0.92, 0.92]);
const s1bTrim = evalSwatch(G1b, [0.84, 0.84, 0.84]);
const s1bPink = evalSwatch(G1b, [0.92, 0.45, 0.68]);
const s1bMedSkin = evalSwatch(G1b, [0.78, 0.57, 0.44]);
const s1bPalm = evalSwatch(G1b, [0.10, 0.14, 0.10]);
const s1bMtn = evalSwatch(G1b, [0.22, 0.24, 0.28]);
console.log(fmtSwatch("White Pillar 0.92", s1bWhite));
console.log(fmtSwatch("White Trim 0.84", s1bTrim));
console.log(fmtSwatch("Vibrant Pink", s1bPink));
console.log(fmtSwatch("Medium Skin", s1bMedSkin));
console.log(fmtSwatch("Dark Palm", s1bPalm));
console.log(fmtSwatch("Distant Mtn", s1bMtn));

const kf1b = buildKfplugPackageData(p1b, "HighKeyCloud_Barbie", "TFBAGAS", "High-key cloud test");
const fragBytes1b = Buffer.byteLength(kf1b.shaderPass0, "utf8");

assertCheck(
  "High-key ref: White Pillar stays neutral (C < 0.025)",
  s1bWhite.outLab.C < 0.025,
  `C=${s1bWhite.outLab.C.toFixed(4)}`
);
assertCheck(
  "High-key ref: White Trim 0.84 stays neutral (C < 0.025)",
  s1bTrim.outLab.C < 0.025,
  `C=${s1bTrim.outLab.C.toFixed(4)}`
);
assertCheck(
  "High-key ref: Vibrant Pink stays vivid (C > 0.09, hue clean pink)",
  s1bPink.outLab.C > 0.09 && (s1bPink.outLab.hDeg >= 315.0 || s1bPink.outLab.hDeg <= 20.0),
  `C=${s1bPink.outLab.C.toFixed(4)}, h=${s1bPink.outLab.hDeg.toFixed(1)}°`
);
assertCheck(
  "High-key ref: Medium Skin retains warmth & chroma",
  s1bMedSkin.outLab.hDeg >= 28.0 &&
    s1bMedSkin.outLab.hDeg <= 58.0 &&
    s1bMedSkin.outLab.C >= s1bMedSkin.inLab.C * 0.82,
  `h=${s1bMedSkin.outLab.hDeg.toFixed(1)}°, C=${s1bMedSkin.outLab.C.toFixed(3)}/${s1bMedSkin.inLab.C.toFixed(3)}`
);
assertCheck(
  "High-key ref: Contrast never flattens below 0.99 & shadows <= 0.01",
  p1b.contrast >= 0.99 && p1b.shadows <= 0.01,
  `con=${p1b.contrast}, sh=${p1b.shadows}`
);
assertCheck(
  "High-key ref: Dark Palm & Distant Mtn avoid milky haze lift (dL <= +0.015)",
  s1bPalm.outLab.L - s1bPalm.inLab.L <= 0.015 &&
    s1bMtn.outLab.L - s1bMtn.inLab.L <= 0.015,
  `palm dL=${(s1bPalm.outLab.L - s1bPalm.inLab.L).toFixed(4)}, mtn dL=${(s1bMtn.outLab.L - s1bMtn.inLab.L).toFixed(4)}`
);
assertCheck(
  "High-key ref: .kfplug valid & pass0.frag < 29.5 KB",
  kf1b.validation.valid && fragBytes1b < 29500,
  `valid=${kf1b.validation.valid}, size=${fragBytes1b} B`
);

// =========================================================================
// SCENARIO 2: Moody Cool Blue Night Ref -> Neutral Daylight Target
// (Ensures scene-wide cool illuminants are NOT over-damped by sky detector!)
// =========================================================================
console.log("\n=== SCENARIO 2: Moody Cool Blue Night Ref -> Neutral Daylight Target ===");
const moodyBlueRef = buildClusterBuffer(
  [
    { rgb: [0.06, 0.14, 0.24], weight: 0.35, jitter: 0.03 }, // deep blue shadows
    { rgb: [0.16, 0.30, 0.48], weight: 0.35, jitter: 0.04 }, // cool blue midtones
    { rgb: [0.38, 0.56, 0.76], weight: 0.20, jitter: 0.04 }, // cool highlights
    { rgb: [0.68, 0.78, 0.88], weight: 0.10, jitter: 0.03 }, // pale moon highlight
  ],
  4096,
  303
);
const neutralDayTgt = buildClusterBuffer(
  [
    { rgb: [0.15, 0.15, 0.15], weight: 0.22, jitter: 0.04 },
    { rgb: [0.48, 0.48, 0.46], weight: 0.34, jitter: 0.05 },
    { rgb: [0.76, 0.75, 0.72], weight: 0.24, jitter: 0.04 },
    { rgb: [0.78, 0.57, 0.44], weight: 0.20, jitter: 0.03 },
  ],
  4096,
  404
);
const p2 = analyzeEngineAltairV4(moodyBlueRef, neutralDayTgt, {
  numPixels: 4096,
  targetNumPixels: 4096,
});
const G2 = prepareGrade(p2);
const s2Mid = evalSwatch(G2, [0.50, 0.50, 0.50]);
console.log(
  `  Sliders: ev=${p2.exposure} con=${p2.contrast} tmp=${p2.temp} tnt=${p2.tint}`
);
console.log(fmtSwatch("Neutral Midtone", s2Mid));
assertCheck(
  "Scene-wide moody blue night ref still shifts midtones cool (temp <= -0.15, b < -0.04)",
  p2.temp <= -0.15 && s2Mid.outLab.b < -0.04,
  `temp=${p2.temp}, outB=${s2Mid.outLab.b.toFixed(4)}`
);

// =========================================================================
// SCENARIO 3: Bright Barbie Pink Ref -> Dark Cinema Target
// (Ensures commit 4bab3ef improvements stay intact!)
// =========================================================================
console.log("\n=== SCENARIO 3: Bright Barbie Pink Ref -> Dark Cinema Target ===");
const darkCinemaTgt = buildClusterBuffer(
  [
    { rgb: [0.08, 0.09, 0.10], weight: 0.35, jitter: 0.03 },
    { rgb: [0.22, 0.24, 0.26], weight: 0.35, jitter: 0.04 },
    { rgb: [0.46, 0.44, 0.42], weight: 0.20, jitter: 0.05 },
    { rgb: [0.78, 0.57, 0.44], weight: 0.10, jitter: 0.03 },
  ],
  4096,
  505
);
const p3 = analyzeEngineAltairV4(barbieTgt, darkCinemaTgt, {
  numPixels: 4096,
  targetNumPixels: 4096,
});
const G3 = prepareGrade(p3);
const s3Dark = evalSwatch(G3, [0.10, 0.11, 0.12]);
const s3Mid = evalSwatch(G3, [0.42, 0.42, 0.42]);
console.log(`  Sliders: ev=${p3.exposure} con=${p3.contrast} sh=${p3.shadows} tmp=${p3.temp} tnt=${p3.tint}`);
console.log(fmtSwatch("Dark Shadow", s3Dark));
console.log(fmtSwatch("Mid Gray", s3Mid));
assertCheck(
  "Dark cinema target shadows stay deep (dL <= +0.025)",
  s3Dark.outLab.L - s3Dark.inLab.L <= 0.025,
  `dL=${(s3Dark.outLab.L - s3Dark.inLab.L).toFixed(4)}`
);
assertCheck(
  "Dark cinema target picks up Barbie pink/warm mood (a > +0.025)",
  s3Mid.outLab.a > 0.025,
  `outA=${s3Mid.outLab.a.toFixed(4)}`
);

// =========================================================================
// SCENARIO 4: Extreme Warm Tungsten Ref -> Portrait Target (Skin Drift)
// =========================================================================
console.log("\n=== SCENARIO 4: Heavy Warm Tungsten Ref -> Portrait Target ===");
const tungstenRef = buildClusterBuffer(
  [
    { rgb: [0.24, 0.14, 0.05], weight: 0.25, jitter: 0.03 },
    { rgb: [0.68, 0.46, 0.16], weight: 0.45, jitter: 0.05 },
    { rgb: [0.95, 0.78, 0.42], weight: 0.30, jitter: 0.04 },
  ],
  4096,
  606
);
const portraitTgt = buildClusterBuffer(
  [
    { rgb: [0.91, 0.76, 0.67], weight: 0.18, jitter: 0.025 },
    { rgb: [0.78, 0.57, 0.44], weight: 0.18, jitter: 0.025 },
    { rgb: [0.64, 0.46, 0.34], weight: 0.12, jitter: 0.025 },
    { rgb: [0.22, 0.26, 0.32], weight: 0.32, jitter: 0.05 },
    { rgb: [0.82, 0.84, 0.86], weight: 0.20, jitter: 0.04 },
  ],
  4096,
  707
);
const p4 = analyzeEngineAltairV4(tungstenRef, portraitTgt, {
  numPixels: 4096,
  targetNumPixels: 4096,
});
const G4 = prepareGrade(p4);
const s4Fair = evalSwatch(G4, [0.91, 0.76, 0.67]);
const s4Med = evalSwatch(G4, [0.78, 0.57, 0.44]);
const fairDrift = Math.abs(angleDiffDeg(s4Fair.outLab.hDeg, s4Fair.inLab.hDeg));
const medDrift = Math.abs(angleDiffDeg(s4Med.outLab.hDeg, s4Med.inLab.hDeg));
console.log(fmtSwatch("Fair Skin", s4Fair));
console.log(fmtSwatch("Medium Skin", s4Med));
assertCheck(
  "Fair skin drift < 10° under tungsten",
  fairDrift < 10.0,
  `drift=${fairDrift.toFixed(2)}°`
);
assertCheck(
  "Medium skin drift < 8° under tungsten",
  medDrift < 8.0,
  `drift=${medDrift.toFixed(2)}°`
);

// =========================================================================
// SCENARIO 5: Identity Self-Match
// =========================================================================
console.log("\n=== SCENARIO 5: Identity Self-Match ===");
const p5 = analyzeEngineAltairV4(barbieTgt, barbieTgt, {
  numPixels: 4096,
  targetNumPixels: 4096,
});
const G5 = prepareGrade(p5);
const s5White = evalSwatch(G5, [1.0, 1.0, 1.0]);
const s5Pink = evalSwatch(G5, [0.92, 0.45, 0.68]);
const dE5Pink = Math.hypot(
  s5Pink.outLab.L - s5Pink.inLab.L,
  s5Pink.outLab.a - s5Pink.inLab.a,
  s5Pink.outLab.b - s5Pink.inLab.b
);
console.log(fmtSwatch("Pure White", s5White));
console.log(fmtSwatch("Pink Self", s5Pink));
assertCheck(
  "Self-match filmic white ceiling >= 0.975 & neutral (C < 0.002)",
  s5White.outRgb[0] >= 0.975 &&
    s5White.outRgb[1] >= 0.975 &&
    s5White.outRgb[2] >= 0.975 &&
    s5White.outLab.C < 0.002,
  `rgb=${s5White.outRgb.map((v) => v.toFixed(4)).join(",")}, C=${s5White.outLab.C.toFixed(4)}`
);
assertCheck(
  "Self-match pink dE < 0.035",
  dE5Pink < 0.035,
  `dE=${dE5Pink.toFixed(4)}`
);

console.log(`\nTotal failures: ${failures}`);
if (failures > 0) process.exit(1);
