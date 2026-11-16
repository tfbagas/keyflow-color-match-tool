import { simulateGradePixels } from "./previewRenderer.js";
import { DEFAULT_PARAMS } from "./gradeEngine.js";

export const SAMPLE_LOOKS = [
  {
    id: "flatLog",
    label: "Flat Log Cinema",
    fileName: "Sample_Flat_Log_Cinema.png",
    params: { contrast: 0.6, pivot: 0.45, shadows: 0.32, highlights: -0.4, sat: 0.8, vib: 0.1, exposure: 0.05, liftR: 0.52, liftG: 0.5, liftB: 0.5, gainR: 0.5, gainG: 0.5, gainB: 0.5 },
  },
  {
    id: "warmFilm",
    label: "Warm Daylight Film",
    fileName: "Sample_Warm_Daylight_Film.png",
    params: { exposure: 0.1, contrast: 1.12, temp: 0.32, tint: 0.04, sat: 1.06, vib: 0.1, liftR: 0.55, liftG: 0.51, liftB: 0.46, gainR: 0.57, gainG: 0.52, gainB: 0.44 },
  },
  {
    id: "coolTeal",
    label: "Cool Moody Teal",
    fileName: "Sample_Cool_Moody_Teal.png",
    params: { exposure: -0.28, contrast: 1.2, temp: -0.38, tint: -0.08, sat: 0.88, vib: -0.05, liftR: 0.4, liftG: 0.53, liftB: 0.6, gainR: 0.52, gainG: 0.52, gainB: 0.56, highlights: -0.1 },
  },
  {
    id: "animePastel",
    label: "Soft Anime Pastel",
    fileName: "Sample_Soft_Anime_Pastel.png",
    params: { exposure: 0.28, contrast: 0.78, sat: 0.9, vib: 0.35, temp: 0.04, tint: 0.12, shadows: 0.18, highlights: -0.12, liftR: 0.56, liftG: 0.5, liftB: 0.58, gainR: 0.54, gainG: 0.52, gainB: 0.5 },
  },
];

// Balanced neutral architectural/daylight test scene (neutral overcast sky, slate ridge,
// neutral mid-gray foreground, skin disc, color patches) so look presets show true cast direction.
export function drawNeutralScene(ctx, w, h) {
  const sky = ctx.createLinearGradient(0, 0, 0, h * 0.52);
  sky.addColorStop(0, "#8f98a3");
  sky.addColorStop(0.6, "#b4bcc4");
  sky.addColorStop(1, "#dce0e4");
  ctx.fillStyle = sky;
  ctx.fillRect(0, 0, w, h);

  ctx.fillStyle = "#696d73";
  ctx.beginPath();
  ctx.moveTo(0, h * 0.52);
  ctx.lineTo(w * 0.22, h * 0.34);
  ctx.lineTo(w * 0.5, h * 0.50);
  ctx.lineTo(w * 0.78, h * 0.28);
  ctx.lineTo(w, h * 0.48);
  ctx.lineTo(w, h * 0.52);
  ctx.closePath();
  ctx.fill();

  const ground = ctx.createLinearGradient(0, h * 0.52, 0, h);
  ground.addColorStop(0, "#767a75");
  ground.addColorStop(0.5, "#545753");
  ground.addColorStop(1, "#2a2b2a");
  ctx.fillStyle = ground;
  ctx.fillRect(0, h * 0.52, w, h * 0.48);

  const sun = ctx.createRadialGradient(w * 0.74, h * 0.2, 4, w * 0.74, h * 0.2, w * 0.14);
  sun.addColorStop(0, "rgba(255,250,240,0.95)");
  sun.addColorStop(1, "rgba(255,250,240,0)");
  ctx.fillStyle = sun;
  ctx.fillRect(0, 0, w, h);

  ctx.fillStyle = "#c68e72";
  ctx.beginPath();
  ctx.arc(w * 0.3, h * 0.72, h * 0.1, 0, Math.PI * 2);
  ctx.fill();

  const patches = ["#d14949", "#d98a3c", "#e0c341", "#4ba366", "#457ec4", "#f0f0f0", "#808080", "#1c1c1c"];
  const size = Math.round(w * 0.04);
  patches.forEach((col, i) => {
    ctx.fillStyle = col;
    ctx.fillRect(Math.round(w * 0.06) + i * (size + 4), h - size - 18, size, size);
  });
}

export function renderLookSample(id, w = 960, h = 540) {
  const look = SAMPLE_LOOKS.find((l) => l.id === id) || SAMPLE_LOOKS[0];
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d");
  drawNeutralScene(ctx, w, h);

  const src = ctx.getImageData(0, 0, w, h);
  const dst = ctx.createImageData(w, h);
  simulateGradePixels(src.data, dst.data, { ...DEFAULT_PARAMS, ...look.params });
  ctx.putImageData(dst, 0, 0);
  return { canvas, fileName: look.fileName };
}
