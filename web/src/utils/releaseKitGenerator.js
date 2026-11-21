// High-DPI 2400x1350 (16:9) Single-Image Release Poster Generator
// Showcases v0.9.0 + v0.9.5 Beta features in a 6-Module Apple Liquid Glass Bento Grid
// Supports Bilingual rendering (English 'en' & Natural Bahasa Indonesia 'id')
import { drawToneBenchCubeCanvas } from "./toneBenchCanvasMark";

function drawRoundedRectPath(ctx, x, y, w, h, r) {
  const rad = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + rad, y);
  ctx.lineTo(x + w - rad, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + rad);
  ctx.lineTo(x + w, y + h - rad);
  ctx.quadraticCurveTo(x + w, y + h, x + w - rad, y + h);
  ctx.lineTo(x + rad, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - rad);
  ctx.lineTo(x, y + rad);
  ctx.quadraticCurveTo(x, y, x + rad, y);
  ctx.closePath();
}

function measureTrackedText(ctx, text, tracking = 0) {
  if (!text) return 0;
  let width = 0;
  for (let i = 0; i < text.length; i += 1) {
    width += ctx.measureText(text[i]).width;
    if (i < text.length - 1) width += tracking;
  }
  return width;
}

function drawTrackedText(ctx, text, x, y, tracking = 0) {
  let cursorX = x;
  for (let i = 0; i < text.length; i += 1) {
    const ch = text[i];
    ctx.fillText(ch, cursorX, y);
    cursorX += ctx.measureText(ch).width + tracking;
  }
}

function drawLiquidGlassBackdrop(ctx, bgCanvas, x, y, w, h, radius, filterStr, refractionScale = 1.03) {
  const cx = x + w / 2;
  const cy = y + h / 2;
  ctx.save();
  drawRoundedRectPath(ctx, x, y, w, h, radius);
  ctx.clip();
  ctx.translate(cx, cy);
  ctx.scale(refractionScale, refractionScale);
  ctx.translate(-cx, -cy);
  ctx.filter = filterStr;
  ctx.drawImage(bgCanvas, 0, 0);
  ctx.filter = "none";
  ctx.restore();
}

function createObsidianCausticBackground(width, height) {
  const bg = document.createElement("canvas");
  bg.width = width;
  bg.height = height;
  const ctx = bg.getContext("2d");

  // 1. Deep smoked obsidian base
  ctx.fillStyle = "#060709";
  ctx.fillRect(0, 0, width, height);

  // Subtle top studio ambient radial
  const topGlow = ctx.createRadialGradient(width * 0.5, -height * 0.08, 40, width * 0.5, height * 0.05, width * 0.65);
  topGlow.addColorStop(0, "rgba(255, 255, 255, 0.075)");
  topGlow.addColorStop(0.55, "rgba(235, 240, 250, 0.025)");
  topGlow.addColorStop(1, "rgba(6, 7, 9, 0)");
  ctx.fillStyle = topGlow;
  ctx.fillRect(0, 0, width, height);

  // 2. Diagonal monochrome white/platinum anamorphic liquid light sweeps
  const drawSweep = (cx, cy, rw, rh, angleDeg, peakAlpha) => {
    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate((angleDeg * Math.PI) / 180);
    const grad = ctx.createLinearGradient(-rw, 0, rw, 0);
    grad.addColorStop(0, "rgba(255, 255, 255, 0)");
    grad.addColorStop(0.32, `rgba(255, 255, 255, ${(peakAlpha * 0.42).toFixed(4)})`);
    grad.addColorStop(0.5, `rgba(238, 242, 250, ${peakAlpha.toFixed(4)})`);
    grad.addColorStop(0.68, `rgba(255, 255, 255, ${(peakAlpha * 0.38).toFixed(4)})`);
    grad.addColorStop(1, "rgba(255, 255, 255, 0)");
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.ellipse(0, 0, rw, rh, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  };

  drawSweep(width * 0.28, height * 0.34, width * 0.58, height * 0.22, -24, 0.11);
  drawSweep(width * 0.72, height * 0.62, width * 0.62, height * 0.24, -22, 0.125);
  drawSweep(width * 0.52, height * 0.18, width * 0.46, height * 0.14, 14, 0.065);
  drawSweep(width * 0.18, height * 0.84, width * 0.42, height * 0.18, 18, 0.055);

  // Caustic pools
  const poolA = ctx.createRadialGradient(width * 0.34, height * 0.42, 20, width * 0.34, height * 0.42, width * 0.36);
  poolA.addColorStop(0, "rgba(255, 255, 255, 0.08)");
  poolA.addColorStop(0.5, "rgba(230, 236, 248, 0.03)");
  poolA.addColorStop(1, "rgba(255, 255, 255, 0)");
  ctx.fillStyle = poolA;
  ctx.fillRect(0, 0, width, height);

  const poolB = ctx.createRadialGradient(width * 0.78, height * 0.28, 10, width * 0.78, height * 0.28, width * 0.3);
  poolB.addColorStop(0, "rgba(110, 231, 183, 0.045)");
  poolB.addColorStop(0.55, "rgba(255, 255, 255, 0.025)");
  poolB.addColorStop(1, "rgba(255, 255, 255, 0)");
  ctx.fillStyle = poolB;
  ctx.fillRect(0, 0, width, height);

  // 3. Subtle micro-grain pattern
  const grainCanvas = document.createElement("canvas");
  grainCanvas.width = 96;
  grainCanvas.height = 96;
  const gCtx = grainCanvas.getContext("2d");
  const imgData = gCtx.createImageData(96, 96);
  let seed = 1337;
  for (let i = 0; i < imgData.data.length; i += 4) {
    seed = (seed * 1664525 + 1013904223) >>> 0;
    const v = (seed >>> 24) & 0xff;
    imgData.data[i] = v;
    imgData.data[i + 1] = v;
    imgData.data[i + 2] = v;
    imgData.data[i + 3] = 8;
  }
  gCtx.putImageData(imgData, 0, 0);
  const pattern = ctx.createPattern(grainCanvas, "repeat");
  if (pattern) {
    ctx.fillStyle = pattern;
    ctx.fillRect(0, 0, width, height);
  }

  return bg;
}

function drawLiquidGlassCard(ctx, bgCanvas, x, y, w, h, radius = 24) {
  // Elevation shadow
  ctx.save();
  ctx.shadowColor = "rgba(0, 0, 0, 0.56)";
  ctx.shadowBlur = 38;
  ctx.shadowOffsetY = 14;
  drawRoundedRectPath(ctx, x, y, w, h, radius);
  ctx.fillStyle = "rgba(0, 0, 0, 0.01)";
  ctx.fill();
  ctx.restore();

  // Frosted refraction of caustic backdrop
  drawLiquidGlassBackdrop(
    ctx,
    bgCanvas,
    x,
    y,
    w,
    h,
    radius,
    "blur(24px) saturate(135%) brightness(0.76)",
    1.03
  );

  // Smoked obsidian glass fill
  ctx.save();
  drawRoundedRectPath(ctx, x, y, w, h, radius);
  ctx.clip();
  ctx.fillStyle = "rgba(16, 18, 24, 0.74)";
  ctx.fillRect(x, y, w, h);

  // Top inner specular catchlight
  const catchGrad = ctx.createLinearGradient(x + radius, y, x + w - radius, y);
  catchGrad.addColorStop(0, "rgba(255, 255, 255, 0)");
  catchGrad.addColorStop(0.25, "rgba(255, 255, 255, 0.22)");
  catchGrad.addColorStop(0.75, "rgba(255, 255, 255, 0.22)");
  catchGrad.addColorStop(1, "rgba(255, 255, 255, 0)");
  ctx.strokeStyle = catchGrad;
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(x + radius, y + 1.5);
  ctx.lineTo(x + w - radius, y + 1.5);
  ctx.stroke();
  ctx.restore();

  // 1.5px diagonal Fresnel specular bevel stroke
  ctx.save();
  drawRoundedRectPath(ctx, x, y, w, h, radius);
  const bevel = ctx.createLinearGradient(x, y, x + w, y + h);
  bevel.addColorStop(0, "rgba(255, 255, 255, 0.38)");
  bevel.addColorStop(0.5, "rgba(255, 255, 255, 0.08)");
  bevel.addColorStop(1, "rgba(255, 255, 255, 0.20)");
  ctx.strokeStyle = bevel;
  ctx.lineWidth = 1.5;
  ctx.stroke();
  ctx.restore();
}

function drawInnerPanel(ctx, x, y, w, h, radius = 14, options = {}) {
  const {
    fill = "rgba(255, 255, 255, 0.04)",
    stroke = "rgba(255, 255, 255, 0.11)",
    accentGlow = false,
  } = options;

  ctx.save();
  if (accentGlow) {
    ctx.shadowColor = "rgba(110, 231, 183, 0.16)";
    ctx.shadowBlur = 18;
  }
  drawRoundedRectPath(ctx, x, y, w, h, radius);
  ctx.fillStyle = fill;
  ctx.fill();
  ctx.strokeStyle = stroke;
  ctx.lineWidth = accentGlow ? 1.5 : 1;
  ctx.stroke();
  ctx.restore();
}

function drawPill(ctx, x, y, text, opts = {}) {
  const {
    height = 30,
    fontSize = 13,
    fontWeight = 600,
    padX = 14,
    fill = "rgba(255, 255, 255, 0.06)",
    stroke = "rgba(255, 255, 255, 0.14)",
    textColor = "#E2E4E9",
    dotColor = null,
    tracking = 0,
    fontFamily = '"Instrument Sans", -apple-system, BlinkMacSystemFont, "SF Pro Text", system-ui, sans-serif',
  } = opts;

  ctx.save();
  ctx.font = `${fontWeight} ${fontSize}px ${fontFamily}`;
  const textW = tracking ? measureTrackedText(ctx, text, tracking) : ctx.measureText(text).width;
  const dotSpace = dotColor ? 14 : 0;
  const pillW = Math.round(textW + padX * 2 + dotSpace);

  drawRoundedRectPath(ctx, x, y, pillW, height, height / 2);
  ctx.fillStyle = fill;
  ctx.fill();
  ctx.strokeStyle = stroke;
  ctx.lineWidth = 1;
  ctx.stroke();

  let tx = x + padX;
  if (dotColor) {
    ctx.beginPath();
    ctx.arc(x + padX + 3.5, y + height / 2, 3.5, 0, Math.PI * 2);
    ctx.fillStyle = dotColor;
    ctx.fill();
    tx += dotSpace;
  }

  ctx.fillStyle = textColor;
  ctx.textBaseline = "middle";
  if (tracking) {
    drawTrackedText(ctx, text, tx, y + height / 2 + 0.5, tracking);
  } else {
    ctx.fillText(text, tx, y + height / 2 + 0.5);
  }
  ctx.restore();
  return pillW;
}

function drawPrismBadge(ctx, x, y, size) {
  // Squircle glass badge
  drawInnerPanel(ctx, x, y, size, size, 16, {
    fill: "rgba(8, 9, 12, 0.92)",
    stroke: "rgba(255, 255, 255, 0.24)",
    accentGlow: true,
  });

  const iconSize = size * 0.78;
  drawToneBenchCubeCanvas(
    ctx,
    x + (size - iconSize) / 2,
    y + (size - iconSize) / 2,
    iconSize
  );
}

function drawCardHeader(ctx, cardX, cardY, cardW, pad, eyebrow) {
  ctx.save();
  ctx.font = '700 13px "IBM Plex Mono", ui-monospace, SFMono-Regular, Menlo, monospace';
  ctx.fillStyle = "#6EE7B7";
  ctx.textBaseline = "middle";
  drawTrackedText(ctx, eyebrow, cardX + pad, cardY + 34, 1.5);

  ctx.strokeStyle = "rgba(255, 255, 255, 0.08)";
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(cardX + pad, cardY + 56);
  ctx.lineTo(cardX + cardW - pad, cardY + 56);
  ctx.stroke();
  ctx.restore();
}

function drawCard01Polaris(ctx, x, y, w, h, isId) {
  const pad = 28;
  const innerW = w - pad * 2;
  drawCardHeader(
    ctx,
    x,
    y,
    w,
    pad,
    isId ? "01  -  ALTAIR 4.5 REFRESH & SAINS WARNA" : "01  -  ALTAIR 4.5 REFRESH & COLOR SCIENCE"
  );

  const startY = y + 76;
  const engineGap = 16;
  const engW = (innerW - engineGap * 2) / 3;
  const engH = 204;

  const engines = [
    {
      name: "Altair 4.5 Refresh",
      tag: "CINEMA 32³",
      sub: "Two-Stage Source Normalize + Sigma",
      bullets: isId
        ? ["Normalisasi Sumber D65", "SOT OKLab 3D Halton", "LUT Tetrahedral 32³"]
        : ["Source Normalize D65", "Halton 3D OKLab SOT", "32³ Tetrahedral LUT"],
      pro: true,
    },
    {
      name: "Altair 4.0",
      tag: "CREATIVE",
      sub: "1-Stage OKLab + Filmic",
      bullets: isId
        ? ["Kovarians 3D OKLab", "Kurva Tonal 5-Zona", "Filmic Roll-Off & .kfplug"]
        : ["3D OKLab Transfer", "5-Zone Tonal Curve", "Filmic Roll-Off & .kfplug"],
      pro: false,
    },
    {
      name: "Polaris 3.5",
      tag: "ANIME",
      sub: "Palette Anchor + OKLab",
      bullets: isId
        ? ["Jangkar Palet Cel", "Aman di Warna Kulit", "Hitam Pekat Bersih"]
        : ["Cel Palette Anchor", "Skin-Safe Roll-Off", "Deep Blacks Toe"],
      pro: false,
    },
  ];

  engines.forEach((eng, idx) => {
    const ex = x + pad + idx * (engW + engineGap);
    drawInnerPanel(ctx, ex, startY, engW, engH, 14, {
      fill: eng.pro ? "rgba(110, 231, 183, 0.085)" : "rgba(255, 255, 255, 0.035)",
      stroke: eng.pro ? "rgba(110, 231, 183, 0.48)" : "rgba(255, 255, 255, 0.10)",
      accentGlow: eng.pro,
    });

    // Tag pill
    drawPill(ctx, ex + 14, startY + 14, eng.tag, {
      height: 22,
      fontSize: 10,
      padX: 10,
      tracking: 1.0,
      fill: eng.pro ? "rgba(110, 231, 183, 0.16)" : "rgba(255, 255, 255, 0.06)",
      stroke: eng.pro ? "rgba(110, 231, 183, 0.42)" : "rgba(255, 255, 255, 0.14)",
      textColor: eng.pro ? "#6EE7B7" : "#9CA3AF",
      fontFamily: '"IBM Plex Mono", ui-monospace, monospace',
    });

    ctx.save();
    ctx.font = '700 19px "Instrument Sans", -apple-system, BlinkMacSystemFont, "SF Pro Display", system-ui, sans-serif';
    ctx.fillStyle = eng.pro ? "#F8FAFC" : "#E2E4E9";
    ctx.textBaseline = "top";
    ctx.fillText(eng.name, ex + 14, startY + 48);

    ctx.font = '500 12.5px "Instrument Sans", -apple-system, BlinkMacSystemFont, "SF Pro Text", system-ui, sans-serif';
    ctx.fillStyle = eng.pro ? "#A7F3D0" : "#9CA3AF";
    ctx.fillText(eng.sub, ex + 14, startY + 75);

    ctx.strokeStyle = "rgba(255, 255, 255, 0.08)";
    ctx.beginPath();
    ctx.moveTo(ex + 14, startY + 102);
    ctx.lineTo(ex + engW - 14, startY + 102);
    ctx.stroke();

    ctx.font = '500 12.5px "Instrument Sans", -apple-system, BlinkMacSystemFont, "SF Pro Text", system-ui, sans-serif';
    eng.bullets.forEach((b, bi) => {
      const by = startY + 116 + bi * 25;
      ctx.beginPath();
      ctx.arc(ex + 20, by + 7, 2.5, 0, Math.PI * 2);
      ctx.fillStyle = eng.pro ? "#6EE7B7" : "rgba(255, 255, 255, 0.35)";
      ctx.fill();
      ctx.fillStyle = eng.pro ? "#F1F5F9" : "#CBD5E1";
      ctx.fillText(b, ex + 31, by);
    });
    ctx.restore();
  });

  // Middle Color Science Pipeline Bar
  const pipeY = startY + engH + 20;
  const pipeH = 92;
  drawInnerPanel(ctx, x + pad, pipeY, innerW, pipeH, 14, {
    fill: "rgba(255, 255, 255, 0.03)",
    stroke: "rgba(255, 255, 255, 0.09)",
  });

  ctx.save();
  ctx.font = '600 11.5px "IBM Plex Mono", ui-monospace, monospace';
  ctx.fillStyle = "#9CA3AF";
  ctx.textBaseline = "top";
  drawTrackedText(
    ctx,
    isId ? "PIPELINE SAINS WARNA PERSEPTUAL" : "PERCEPTUAL COLOR PIPELINE",
    x + pad + 16,
    pipeY + 14,
    1.2
  );
  ctx.restore();

  const stages = isId
    ? ["Profil Input", "Gamut OKLab", "Aman Kulit", "Hitam Pekat"]
    : ["Input Profile", "OKLab Gamut", "Skin-Safe", "Deep Blacks"];
  const stW = 142;
  const stGap = 24;
  stages.forEach((st, idx) => {
    const sx = x + pad + 16 + idx * (stW + stGap);
    const sy = pipeY + 40;
    drawInnerPanel(ctx, sx, sy, stW, 36, 10, {
      fill: idx === 1 ? "rgba(110, 231, 183, 0.10)" : "rgba(255, 255, 255, 0.05)",
      stroke: idx === 1 ? "rgba(110, 231, 183, 0.35)" : "rgba(255, 255, 255, 0.12)",
    });
    ctx.save();
    ctx.font = '600 13px "Instrument Sans", -apple-system, BlinkMacSystemFont, "SF Pro Text", system-ui, sans-serif';
    ctx.fillStyle = idx === 1 ? "#6EE7B7" : "#E2E4E9";
    ctx.textBaseline = "middle";
    const tw = ctx.measureText(st).width;
    ctx.fillText(st, sx + (stW - tw) / 2, sy + 18);
    if (idx < stages.length - 1) {
      ctx.fillStyle = "rgba(255, 255, 255, 0.42)";
      ctx.font = '600 14px "Instrument Sans", system-ui, sans-serif';
      ctx.fillText("->", sx + stW + 5, sy + 18);
    }
    ctx.restore();
  });

  // Bottom Feature Pills
  const pillY1 = pipeY + pipeH + 20;
  let px = x + pad;
  const w1 = drawPill(
    ctx,
    px,
    pillY1,
    isId ? "Auto-Normalize Target (Mid-Gray & WB)" : "Auto-Normalize Target (Mid-Gray & WB)",
    {
      height: 36,
      fontSize: 13.5,
      dotColor: "#6EE7B7",
      fill: "rgba(110, 231, 183, 0.08)",
      stroke: "rgba(110, 231, 183, 0.30)",
      textColor: "#F8FAFC",
    }
  );
  px += w1 + 12;
  drawPill(ctx, px, pillY1, isId ? "Pintasan 1 / 2 / 3" : "1 / 2 / 3 Hotkeys", {
    height: 36,
    fontSize: 13.5,
    fill: "rgba(255, 255, 255, 0.055)",
    stroke: "rgba(255, 255, 255, 0.14)",
  });

  const pillY2 = pillY1 + 48;
  drawPill(
    ctx,
    x + pad,
    pillY2,
    isId ? "Popover Perbandingan Engine Langsung" : "Live Engine Comparison Popover",
    {
      height: 36,
      fontSize: 13.5,
      fill: "rgba(255, 255, 255, 0.055)",
      stroke: "rgba(255, 255, 255, 0.14)",
    }
  );
}

function drawCard02LogSampler(ctx, x, y, w, h, isId) {
  const pad = 28;
  const innerW = w - pad * 2;
  drawCardHeader(
    ctx,
    x,
    y,
    w,
    pad,
    isId ? "02  -  CAMERA LOG & VIDEO SAMPLER" : "02  -  CAMERA LOG & VIDEO SAMPLER"
  );

  // Section A: Camera Log Input Profiles
  const secAY = y + 76;
  const secAH = 178;
  drawInnerPanel(ctx, x + pad, secAY, innerW, secAH, 14, {
    fill: "rgba(255, 255, 255, 0.035)",
    stroke: "rgba(255, 255, 255, 0.10)",
  });

  ctx.save();
  ctx.font = '600 16px "Instrument Sans", -apple-system, BlinkMacSystemFont, "SF Pro Display", system-ui, sans-serif';
  ctx.fillStyle = "#F8FAFC";
  ctx.textBaseline = "middle";
  ctx.fillText(
    isId ? "Profil Input Camera Log" : "Camera Log Input Profiles",
    x + pad + 18,
    secAY + 28
  );
  ctx.restore();

  // Simulate Log Input toggle switch UI
  const toggleLabel = isId ? "Simulasi Input Log" : "Simulate Log Input";
  ctx.save();
  ctx.font = '500 13px "Instrument Sans", -apple-system, BlinkMacSystemFont, "SF Pro Text", system-ui, sans-serif';
  ctx.fillStyle = "#A7F3D0";
  ctx.textBaseline = "middle";
  const tlW = ctx.measureText(toggleLabel).width;
  const swW = 42;
  const swH = 22;
  const swX = x + pad + innerW - 18 - swW;
  const swY = secAY + 17;
  ctx.fillText(toggleLabel, swX - tlW - 10, secAY + 28);
  drawRoundedRectPath(ctx, swX, swY, swW, swH, swH / 2);
  ctx.fillStyle = "rgba(110, 231, 183, 0.28)";
  ctx.fill();
  ctx.strokeStyle = "rgba(110, 231, 183, 0.65)";
  ctx.lineWidth = 1;
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(swX + swW - 11, swY + swH / 2, 7.5, 0, Math.PI * 2);
  ctx.fillStyle = "#6EE7B7";
  ctx.fill();
  ctx.restore();

  const logProfiles = [
    { name: "Apple Log", active: true },
    { name: "Sony S-Log3", active: false },
    { name: "ARRI LogC3/C4", active: false },
    { name: "RED Log3G10", active: false },
    { name: "Canon Log 2/3", active: false },
    { name: "V-Log", active: false },
    { name: "D-Log", active: false },
  ];

  let lpX = x + pad + 18;
  let lpY = secAY + 58;
  logProfiles.forEach((lp) => {
    ctx.save();
    ctx.font = '600 13.5px "Instrument Sans", -apple-system, BlinkMacSystemFont, "SF Pro Text", system-ui, sans-serif';
    const estW = ctx.measureText(lp.name).width + 32 + (lp.active ? 14 : 0);
    ctx.restore();
    if (lpX + estW > x + pad + innerW - 16) {
      lpX = x + pad + 18;
      lpY += 48;
    }
    const usedW = drawPill(ctx, lpX, lpY, lp.name, {
      height: 36,
      fontSize: 13.5,
      dotColor: lp.active ? "#6EE7B7" : null,
      fill: lp.active ? "rgba(110, 231, 183, 0.12)" : "rgba(255, 255, 255, 0.055)",
      stroke: lp.active ? "rgba(110, 231, 183, 0.42)" : "rgba(255, 255, 255, 0.13)",
      textColor: lp.active ? "#F8FAFC" : "#CBD5E1",
    });
    lpX += usedW + 10;
  });

  // Section B: Smart Video Sampler
  const secBY = secAY + secAH + 18;
  const secBH = 114;
  drawInnerPanel(ctx, x + pad, secBY, innerW, secBH, 14, {
    fill: "rgba(255, 255, 255, 0.035)",
    stroke: "rgba(255, 255, 255, 0.10)",
  });

  ctx.save();
  ctx.font = '600 16px "Instrument Sans", -apple-system, BlinkMacSystemFont, "SF Pro Display", system-ui, sans-serif';
  ctx.fillStyle = "#F8FAFC";
  ctx.textBaseline = "top";
  ctx.fillText("Smart Video Sampler", x + pad + 18, secBY + 16);

  ctx.font = '500 12.5px "Instrument Sans", -apple-system, BlinkMacSystemFont, "SF Pro Text", system-ui, sans-serif';
  ctx.fillStyle = "#9CA3AF";
  ctx.fillText(
    isId
      ? "Analisis referensi multi-frame otomatis dari berbagai timestamp klip"
      : "Multi-frame median reference analysis across clip timestamps",
    x + pad + 18,
    secBY + 40
  );

  // Timeline bar with 5 sample nodes
  const barX = x + pad + 18;
  const barY = secBY + 74;
  const barW = innerW - 36;
  drawRoundedRectPath(ctx, barX, barY, barW, 10, 5);
  ctx.fillStyle = "rgba(255, 255, 255, 0.08)";
  ctx.fill();

  const sampleFrac = [0.08, 0.28, 0.5, 0.72, 0.92];
  sampleFrac.forEach((f) => {
    const nx = barX + barW * f;
    ctx.beginPath();
    ctx.arc(nx, barY + 5, 8, 0, Math.PI * 2);
    ctx.fillStyle = "rgba(110, 231, 183, 0.25)";
    ctx.fill();
    ctx.beginPath();
    ctx.arc(nx, barY + 5, 4.5, 0, Math.PI * 2);
    ctx.fillStyle = "#6EE7B7";
    ctx.fill();
  });
  ctx.restore();

  // Section C: 1-Frame Video Stepping
  const secCY = secBY + secBH + 18;
  const secCH = 104;
  drawInnerPanel(ctx, x + pad, secCY, innerW, secCH, 14, {
    fill: "rgba(255, 255, 255, 0.035)",
    stroke: "rgba(255, 255, 255, 0.10)",
  });

  ctx.save();
  ctx.font = '600 16px "Instrument Sans", -apple-system, BlinkMacSystemFont, "SF Pro Display", system-ui, sans-serif';
  ctx.fillStyle = "#F8FAFC";
  ctx.textBaseline = "top";
  ctx.fillText(
    isId ? "Navigasi Video Presisi 1-Frame (-1f / +1f)" : "1-Frame Video Stepping (-1f / +1f)",
    x + pad + 18,
    secCY + 16
  );
  ctx.restore();

  const ctrlY = secCY + 52;
  let cx = x + pad + 18;
  const stepBtns = ["-1f", isId ? "Putar" : "Play", "+1f"];
  stepBtns.forEach((lbl) => {
    const bw = drawPill(ctx, cx, ctrlY, lbl, {
      height: 34,
      fontSize: 13,
      padX: 16,
      fill: "rgba(255, 255, 255, 0.07)",
      stroke: "rgba(255, 255, 255, 0.16)",
      fontFamily: '"IBM Plex Mono", ui-monospace, monospace',
    });
    cx += bw + 10;
  });

  drawPill(ctx, cx, ctrlY, "00:04:12:08", {
    height: 34,
    fontSize: 13,
    padX: 14,
    fill: "rgba(0, 0, 0, 0.35)",
    stroke: "rgba(255, 255, 255, 0.10)",
    textColor: "#9CA3AF",
    fontFamily: '"IBM Plex Mono", ui-monospace, monospace',
  });

  const matchLbl = isId ? "Match Frame Ini" : "Match Current Frame";
  ctx.save();
  ctx.font = '600 13.5px "Instrument Sans", -apple-system, BlinkMacSystemFont, "SF Pro Text", system-ui, sans-serif';
  const mEstW = Math.round(ctx.measureText(matchLbl).width + 32 + 14);
  ctx.restore();

  drawPill(ctx, x + pad + innerW - 18 - mEstW, ctrlY, matchLbl, {
    height: 34,
    fontSize: 13.5,
    padX: 16,
    dotColor: "#6EE7B7",
    fill: "rgba(110, 231, 183, 0.12)",
    stroke: "rgba(110, 231, 183, 0.42)",
    textColor: "#F8FAFC",
  });
}

function drawCard03Export(ctx, x, y, w, h, isId) {
  const pad = 28;
  const innerW = w - pad * 2;
  drawCardHeader(
    ctx,
    x,
    y,
    w,
    pad,
    isId ? "03  -  HARDWARE MP4 & EKSPOR 5 FORMAT" : "03  -  HARDWARE MP4 & 5-FORMAT EXPORT"
  );

  // Highlighted Tile 1: MP4 Graded Video
  const t1Y = y + 76;
  const t1H = 112;
  drawInnerPanel(ctx, x + pad, t1Y, innerW, t1H, 16, {
    fill: "rgba(110, 231, 183, 0.085)",
    stroke: "rgba(110, 231, 183, 0.45)",
    accentGlow: true,
  });

  drawPill(ctx, x + pad + 18, t1Y + 18, "WEBCODECS HW", {
    height: 24,
    fontSize: 10.5,
    padX: 10,
    tracking: 1.0,
    dotColor: "#6EE7B7",
    fill: "rgba(110, 231, 183, 0.14)",
    stroke: "rgba(110, 231, 183, 0.38)",
    textColor: "#6EE7B7",
    fontFamily: '"IBM Plex Mono", ui-monospace, monospace',
  });

  ctx.save();
  ctx.font = '700 21px "Instrument Sans", -apple-system, BlinkMacSystemFont, "SF Pro Display", system-ui, sans-serif';
  ctx.fillStyle = "#F8FAFC";
  ctx.textBaseline = "top";
  ctx.fillText(isId ? "Video MP4 Hasil Grade" : "MP4 Graded Video", x + pad + 18, t1Y + 50);

  ctx.font = '500 13.5px "Instrument Sans", -apple-system, BlinkMacSystemFont, "SF Pro Text", system-ui, sans-serif';
  ctx.fillStyle = "#CBD5E1";
  ctx.fillText(
    isId
      ? "Hardware WebCodecs H.264 + AAC  -  0 Frame Terlewat"
      : "Hardware WebCodecs H.264 + AAC  -  0 Dropped Frames",
    x + pad + 18,
    t1Y + 79
  );
  ctx.restore();

  // Highlighted Tile 2: .ffx Two-Way AE Engine
  const t2Y = t1Y + t1H + 16;
  const t2H = 112;
  drawInnerPanel(ctx, x + pad, t2Y, innerW, t2H, 16, {
    fill: "rgba(255, 255, 255, 0.055)",
    stroke: "rgba(255, 255, 255, 0.24)",
  });

  drawPill(ctx, x + pad + 18, t2Y + 18, "TWO-WAY AE ENGINE", {
    height: 24,
    fontSize: 10.5,
    padX: 10,
    tracking: 1.0,
    fill: "rgba(255, 255, 255, 0.09)",
    stroke: "rgba(255, 255, 255, 0.24)",
    textColor: "#F8FAFC",
    fontFamily: '"IBM Plex Mono", ui-monospace, monospace',
  });

  ctx.save();
  ctx.font = '700 21px "Instrument Sans", -apple-system, BlinkMacSystemFont, "SF Pro Display", system-ui, sans-serif';
  ctx.fillStyle = "#F8FAFC";
  ctx.textBaseline = "top";
  ctx.fillText(
    isId ? "Engine Dua Arah .ffx After Effects" : ".ffx Two-Way AE Engine",
    x + pad + 18,
    t2Y + 50
  );

  ctx.font = '500 13.5px "Instrument Sans", -apple-system, BlinkMacSystemFont, "SF Pro Text", system-ui, sans-serif';
  ctx.fillStyle = "#CBD5E1";
  ctx.fillText(
    isId
      ? "Parser Binary RIFX Native + Konverter Langsung .ffx ke .kfplug/.cube"
      : "Native Binary RIFX Parser + Direct .ffx to .kfplug/.cube Converter",
    x + pad + 18,
    t2Y + 79
  );
  ctx.restore();

  // Bottom 3 Glass Tiles
  const t3Y = t2Y + t2H + 18;
  const t3H = 174;
  const tileGap = 16;
  const tileW = (innerW - tileGap * 2) / 3;
  const formats = [
    {
      ext: ".kfplug",
      title: "Keyflow Mobile",
      sub: isId ? "Shader GLSL Native" : "Native GLSL Shader",
      badge: "PLUGIN",
    },
    {
      ext: ".cube",
      title: "33-pt 3D LUT",
      sub: "Premiere / Resolve",
      badge: "3D LUT",
    },
    {
      ext: ".zip",
      title: isId ? "Paket Lengkap" : "All-in-One Bundle",
      sub: "Batch Pack + JSON",
      badge: "ARCHIVE",
    },
  ];

  formats.forEach((fmt, idx) => {
    const fx = x + pad + idx * (tileW + tileGap);
    drawInnerPanel(ctx, fx, t3Y, tileW, t3H, 14, {
      fill: "rgba(255, 255, 255, 0.04)",
      stroke: "rgba(255, 255, 255, 0.13)",
    });

    drawPill(ctx, fx + 14, t3Y + 14, fmt.badge, {
      height: 22,
      fontSize: 10,
      padX: 9,
      tracking: 1.0,
      fill: "rgba(255, 255, 255, 0.07)",
      stroke: "rgba(255, 255, 255, 0.16)",
      textColor: "#9CA3AF",
      fontFamily: '"IBM Plex Mono", ui-monospace, monospace',
    });

    ctx.save();
    ctx.font = '700 24px "IBM Plex Mono", ui-monospace, monospace';
    ctx.fillStyle = "#F8FAFC";
    ctx.textBaseline = "top";
    ctx.fillText(fmt.ext, fx + 14, t3Y + 52);

    ctx.font = '600 14.5px "Instrument Sans", -apple-system, BlinkMacSystemFont, "SF Pro Display", system-ui, sans-serif';
    ctx.fillStyle = "#E2E4E9";
    ctx.fillText(fmt.title, fx + 14, t3Y + 96);

    ctx.font = '500 12.5px "Instrument Sans", -apple-system, BlinkMacSystemFont, "SF Pro Text", system-ui, sans-serif';
    ctx.fillStyle = "#9CA3AF";
    ctx.fillText(fmt.sub, fx + 14, t3Y + 122);
    ctx.restore();
  });
}

function drawCard04Scopes(ctx, x, y, w, h, isId) {
  const pad = 28;
  const innerW = w - pad * 2;
  drawCardHeader(
    ctx,
    x,
    y,
    w,
    pad,
    isId ? "04  -  PRO SCOPES & MONITOR EXPOSURE" : "04  -  PRO SCOPES & EXPOSURE MONITORING"
  );

  const scopeY = y + 76;
  const scopeGap = 16;
  const scopeW = (innerW - scopeGap * 2) / 3;
  const scopeH = 228;

  // 1. Luma / RGB Histogram
  const hX = x + pad;
  drawInnerPanel(ctx, hX, scopeY, scopeW, scopeH, 14, {
    fill: "rgba(8, 10, 14, 0.78)",
    stroke: "rgba(255, 255, 255, 0.12)",
  });
  ctx.save();
  ctx.font = '600 12.5px "Instrument Sans", system-ui, sans-serif';
  ctx.fillStyle = "#E2E4E9";
  ctx.textBaseline = "top";
  ctx.fillText("Luma / RGB Histogram", hX + 14, scopeY + 14);

  const hgX = hX + 14;
  const hgY = scopeY + 46;
  const hgW = scopeW - 28;
  const hgH = 162;
  ctx.strokeStyle = "rgba(255, 255, 255, 0.07)";
  ctx.lineWidth = 1;
  for (let i = 1; i <= 3; i += 1) {
    const gy = hgY + (hgH / 4) * i;
    ctx.beginPath();
    ctx.moveTo(hgX, gy);
    ctx.lineTo(hgX + hgW, gy);
    ctx.stroke();
  }

  const drawHistCurve = (color, fill, phase, amp) => {
    ctx.beginPath();
    ctx.moveTo(hgX, hgY + hgH);
    for (let i = 0; i <= 36; i += 1) {
      const t = i / 36;
      const val =
        Math.exp(-Math.pow((t - 0.32 - phase) / 0.16, 2)) * amp +
        Math.exp(-Math.pow((t - 0.68 + phase) / 0.18, 2)) * (amp * 0.72);
      const px = hgX + t * hgW;
      const py = hgY + hgH - Math.min(1, val) * (hgH - 12);
      ctx.lineTo(px, py);
    }
    ctx.lineTo(hgX + hgW, hgY + hgH);
    ctx.closePath();
    ctx.fillStyle = fill;
    ctx.fill();
    ctx.strokeStyle = color;
    ctx.lineWidth = 1.5;
    ctx.stroke();
  };
  drawHistCurve("rgba(248, 113, 113, 0.85)", "rgba(248, 113, 113, 0.16)", -0.05, 0.82);
  drawHistCurve("rgba(110, 231, 183, 0.85)", "rgba(110, 231, 183, 0.16)", 0.0, 0.90);
  drawHistCurve("rgba(96, 165, 250, 0.85)", "rgba(96, 165, 250, 0.16)", 0.06, 0.78);
  ctx.restore();

  // 2. RGB Parade
  const pX = hX + scopeW + scopeGap;
  drawInnerPanel(ctx, pX, scopeY, scopeW, scopeH, 14, {
    fill: "rgba(8, 10, 14, 0.78)",
    stroke: "rgba(255, 255, 255, 0.12)",
  });
  ctx.save();
  ctx.font = '600 12.5px "Instrument Sans", system-ui, sans-serif';
  ctx.fillStyle = "#E2E4E9";
  ctx.textBaseline = "top";
  ctx.fillText("RGB Parade", pX + 14, scopeY + 14);

  const prX = pX + 14;
  const prY = scopeY + 46;
  const prW = scopeW - 28;
  const prH = 162;
  const colW = (prW - 12) / 3;
  const chColors = [
    "rgba(248, 113, 113, 0.75)",
    "rgba(110, 231, 183, 0.75)",
    "rgba(96, 165, 250, 0.75)",
  ];
  chColors.forEach((col, ci) => {
    const cx0 = prX + ci * (colW + 6);
    ctx.strokeStyle = "rgba(255, 255, 255, 0.06)";
    ctx.strokeRect(cx0, prY, colW, prH);
    ctx.fillStyle = col;
    for (let s = 0; s < 26; s += 1) {
      const t = s / 25;
      const sx = cx0 + 4 + t * (colW - 8);
      const mid = 0.5 + 0.25 * Math.sin(t * 6 + ci * 1.4);
      const spread = 22 + 12 * Math.cos(t * 4 + ci);
      const cy = prY + prH * (1 - mid);
      ctx.fillRect(sx, cy - spread / 2, 2, spread);
    }
  });
  ctx.restore();

  // 3. Rec.709 Vectorscope (Skin-Tone I-Line)
  const vX = pX + scopeW + scopeGap;
  drawInnerPanel(ctx, vX, scopeY, scopeW, scopeH, 14, {
    fill: "rgba(8, 10, 14, 0.78)",
    stroke: "rgba(255, 255, 255, 0.12)",
  });
  ctx.save();
  ctx.font = '600 12.5px "Instrument Sans", system-ui, sans-serif';
  ctx.fillStyle = "#E2E4E9";
  ctx.textBaseline = "top";
  ctx.fillText("Vectorscope (I-Line)", vX + 14, scopeY + 14);

  const vcX = vX + scopeW / 2;
  const vcY = scopeY + 132;
  const vr = 68;
  ctx.strokeStyle = "rgba(255, 255, 255, 0.14)";
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.arc(vcX, vcY, vr, 0, Math.PI * 2);
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(vcX, vcY, vr * 0.5, 0, Math.PI * 2);
  ctx.stroke();

  // Skin-tone I-line (~123 deg in Rec.709)
  ctx.strokeStyle = "rgba(251, 191, 36, 0.75)";
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.moveTo(vcX, vcY);
  ctx.lineTo(vcX - Math.cos(0.58) * vr, vcY - Math.sin(0.58) * vr);
  ctx.stroke();

  // Vector blob cluster
  ctx.fillStyle = "rgba(110, 231, 183, 0.72)";
  for (let k = 0; k < 18; k += 1) {
    const a = -2.55 + (k % 5) * 0.12;
    const rad = 14 + (k % 6) * 5;
    ctx.beginPath();
    ctx.arc(vcX + Math.cos(a) * rad, vcY + Math.sin(a) * rad, 2.2, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();

  // Bottom WebGL Overlays
  const ovY = scopeY + scopeH + 22;
  const ovH = 180;
  drawInnerPanel(ctx, x + pad, ovY, innerW, ovH, 14, {
    fill: "rgba(255, 255, 255, 0.035)",
    stroke: "rgba(255, 255, 255, 0.10)",
  });

  ctx.save();
  ctx.font = '600 12px "IBM Plex Mono", ui-monospace, monospace';
  ctx.fillStyle = "#9CA3AF";
  ctx.textBaseline = "top";
  drawTrackedText(
    ctx,
    isId ? "OVERLAY MONITOR WEBGL" : "WEBGL PREVIEW OVERLAYS",
    x + pad + 18,
    ovY + 16,
    1.2
  );
  ctx.restore();

  const ovCardW = (innerW - 36 - 24) / 3;
  const ovCardY = ovY + 46;
  const ovCardH = 114;

  // False Color IRE
  drawInnerPanel(ctx, x + pad + 18, ovCardY, ovCardW, ovCardH, 12, {
    fill: "rgba(255, 255, 255, 0.04)",
    stroke: "rgba(255, 255, 255, 0.12)",
  });
  ctx.save();
  ctx.font = '600 14.5px "Instrument Sans", system-ui, sans-serif';
  ctx.fillStyle = "#F8FAFC";
  ctx.textBaseline = "top";
  ctx.fillText("False Color IRE", x + pad + 32, ovCardY + 16);
  const fcGrad = ctx.createLinearGradient(x + pad + 32, 0, x + pad + 18 + ovCardW - 14, 0);
  fcGrad.addColorStop(0, "#7C3AED");
  fcGrad.addColorStop(0.25, "#3B82F6");
  fcGrad.addColorStop(0.45, "#22C55E");
  fcGrad.addColorStop(0.62, "#F472B6");
  fcGrad.addColorStop(0.82, "#FACC15");
  fcGrad.addColorStop(1, "#EF4444");
  drawRoundedRectPath(ctx, x + pad + 32, ovCardY + 48, ovCardW - 28, 14, 7);
  ctx.fillStyle = fcGrad;
  ctx.fill();
  ctx.font = '500 11.5px "IBM Plex Mono", ui-monospace, monospace';
  ctx.fillStyle = "#9CA3AF";
  ctx.fillText("0 IRE        55       100", x + pad + 32, ovCardY + 74);
  ctx.restore();

  // Zebra Clipping
  const zX = x + pad + 18 + ovCardW + 12;
  drawInnerPanel(ctx, zX, ovCardY, ovCardW, ovCardH, 12, {
    fill: "rgba(255, 255, 255, 0.04)",
    stroke: "rgba(255, 255, 255, 0.12)",
  });
  ctx.save();
  ctx.font = '600 14.5px "Instrument Sans", system-ui, sans-serif';
  ctx.fillStyle = "#F8FAFC";
  ctx.textBaseline = "top";
  ctx.fillText("Zebra Clipping", zX + 14, ovCardY + 16);
  // Zebra stripes preview box
  const zbX = zX + 14;
  const zbY = ovCardY + 48;
  const zbW = ovCardW - 28;
  drawRoundedRectPath(ctx, zbX, zbY, zbW, 24, 6);
  ctx.save();
  ctx.clip();
  ctx.fillStyle = "rgba(255, 255, 255, 0.12)";
  ctx.fillRect(zbX, zbY, zbW, 24);
  ctx.strokeStyle = "rgba(248, 113, 113, 0.72)";
  ctx.lineWidth = 4;
  for (let s = -24; s < zbW + 24; s += 12) {
    ctx.beginPath();
    ctx.moveTo(zbX + s, zbY + 24);
    ctx.lineTo(zbX + s + 16, zbY);
    ctx.stroke();
  }
  ctx.restore();
  ctx.font = '500 11.5px "IBM Plex Mono", ui-monospace, monospace';
  ctx.fillStyle = "#9CA3AF";
  ctx.fillText("Highlight > 95 IRE", zX + 14, ovCardY + 80);
  ctx.restore();

  // Touch Eyedropper
  const eX = zX + ovCardW + 12;
  drawInnerPanel(ctx, eX, ovCardY, ovCardW, ovCardH, 12, {
    fill: "rgba(255, 255, 255, 0.04)",
    stroke: "rgba(255, 255, 255, 0.12)",
  });
  ctx.save();
  ctx.font = '600 14.5px "Instrument Sans", system-ui, sans-serif';
  ctx.fillStyle = "#F8FAFC";
  ctx.textBaseline = "top";
  ctx.fillText("Touch Eyedropper", eX + 14, ovCardY + 16);
  ctx.font = '600 12px "IBM Plex Mono", ui-monospace, monospace';
  ctx.fillStyle = "#6EE7B7";
  ctx.fillText("R:214 G:182 B:148", eX + 14, ovCardY + 50);
  ctx.fillStyle = "#9CA3AF";
  ctx.fillText(isId ? "68 IRE  -  Aman Kulit" : "68 IRE  -  Skin Safe", eX + 14, ovCardY + 76);
  ctx.restore();
}

function drawCard05Precision(ctx, x, y, w, h, isId) {
  const pad = 28;
  const innerW = w - pad * 2;
  drawCardHeader(
    ctx,
    x,
    y,
    w,
    pad,
    isId ? "05  -  GRADING PRESISI & SENTUHAN OPTIK" : "05  -  PRECISION GRADING & OPTICAL TOUCH"
  );

  // Top Visual Preview: Split Wipe + 2x/4x Optical Glass Loupe + Pinch-to-Zoom
  const prevY = y + 76;
  const prevH = 218;
  drawInnerPanel(ctx, x + pad, prevY, innerW, prevH, 16, {
    fill: "rgba(10, 12, 16, 0.85)",
    stroke: "rgba(255, 255, 255, 0.14)",
  });

  // Simulated split cinema frame inside preview
  const fx = x + pad + 14;
  const fy = prevY + 14;
  const fw = innerW - 28;
  const fh = prevH - 28;
  const splitX = fx + fw * 0.48;

  ctx.save();
  drawRoundedRectPath(ctx, fx, fy, fw, fh, 12);
  ctx.clip();

  // Left: Log / Un-graded side
  const leftGrad = ctx.createLinearGradient(fx, fy, splitX, fy + fh);
  leftGrad.addColorStop(0, "#2B303A");
  leftGrad.addColorStop(1, "#181B22");
  ctx.fillStyle = leftGrad;
  ctx.fillRect(fx, fy, splitX - fx, fh);

  // Right: Graded side
  const rightGrad = ctx.createLinearGradient(splitX, fy, fx + fw, fy + fh);
  rightGrad.addColorStop(0, "#1D3540");
  rightGrad.addColorStop(0.55, "#2C4C4E");
  rightGrad.addColorStop(1, "#121820");
  ctx.fillStyle = rightGrad;
  ctx.fillRect(splitX, fy, fx + fw - splitX, fh);

  // Split divider line
  ctx.strokeStyle = "rgba(255, 255, 255, 0.78)";
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.moveTo(splitX, fy);
  ctx.lineTo(splitX, fy + fh);
  ctx.stroke();

  // Optical Glass Loupe circle overlapping split
  const lCx = splitX + 18;
  const lCy = fy + fh * 0.52;
  const lR = 54;
  ctx.beginPath();
  ctx.arc(lCx, lCy, lR, 0, Math.PI * 2);
  ctx.fillStyle = "rgba(18, 28, 36, 0.86)";
  ctx.fill();
  ctx.strokeStyle = "rgba(255, 255, 255, 0.65)";
  ctx.lineWidth = 2;
  ctx.stroke();

  // Pixel grid inside loupe
  ctx.save();
  ctx.beginPath();
  ctx.arc(lCx, lCy, lR - 2, 0, Math.PI * 2);
  ctx.clip();
  ctx.strokeStyle = "rgba(255, 255, 255, 0.10)";
  ctx.lineWidth = 1;
  for (let gx = lCx - lR; gx <= lCx + lR; gx += 12) {
    ctx.beginPath();
    ctx.moveTo(gx, lCy - lR);
    ctx.lineTo(gx, lCy + lR);
    ctx.stroke();
  }
  for (let gy = lCy - lR; gy <= lCy + lR; gy += 12) {
    ctx.beginPath();
    ctx.moveTo(lCx - lR, gy);
    ctx.lineTo(lCx + lR, gy);
    ctx.stroke();
  }
  ctx.restore();

  // Loupe label
  ctx.font = '700 12px "IBM Plex Mono", ui-monospace, monospace';
  ctx.fillStyle = "#6EE7B7";
  ctx.textBaseline = "middle";
  ctx.fillText("4x LOUPE", lCx - 31, lCy);
  ctx.restore();

  // Overlay pills inside preview
  drawPill(
    ctx,
    fx + 14,
    fy + 14,
    isId ? "Split Vertikal | Horizontal" : "Vertical | Horizontal Split Wipe",
    {
      height: 28,
      fontSize: 12,
      fill: "rgba(14, 16, 22, 0.72)",
      stroke: "rgba(255, 255, 255, 0.22)",
    }
  );
  const zoomLbl = isId ? "Cubit 2 Jari untuk Zoom (1x-4x)" : "2-Finger Pinch-to-Zoom (1x-4x)";
  ctx.save();
  ctx.font = '600 12px "Instrument Sans", -apple-system, BlinkMacSystemFont, "SF Pro Text", system-ui, sans-serif';
  const zEstW = Math.round(ctx.measureText(zoomLbl).width + 28 + 14);
  ctx.restore();
  drawPill(ctx, fx + fw - 14 - zEstW, fy + fh - 40, zoomLbl, {
    height: 28,
    fontSize: 12,
    dotColor: "#6EE7B7",
    fill: "rgba(14, 16, 22, 0.78)",
    stroke: "rgba(110, 231, 183, 0.35)",
  });

  // Bottom 2x2 Precision Workflow Cards
  const gridY = prevY + prevH + 20;
  const gGap = 16;
  const gW = (innerW - gGap) / 2;
  const gH = 88;

  const items = isId
    ? [
        { title: "Mode Slider Presisi 0.01", sub: "Kontrol mikro-presisi saat menggeser" },
        { title: "Ketuk Angka untuk Ketik Nilai", sub: "Input angka langsung via keyboard" },
        { title: "25-Langkah Undo / Redo", sub: "Riwayat penuh tanpa merusak grade" },
        { title: "Slot Snapshot A/B + Salin ke B", sub: "Bandingkan dua versi grade instan" },
      ]
    : [
        { title: "Fine 0.01 Slider Mode", sub: "Micro-precision grading control" },
        { title: "Tap-to-Edit Numeric Readouts", sub: "Direct keyboard value entry" },
        { title: "25-Step Undo / Redo", sub: "Full non-destructive history" },
        { title: "A/B Snapshots + Copy to B", sub: "Instant reference comparison" },
      ];

  items.forEach((item, idx) => {
    const col = idx % 2;
    const row = Math.floor(idx / 2);
    const ix = x + pad + col * (gW + gGap);
    const iy = gridY + row * (gH + gGap);
    drawInnerPanel(ctx, ix, iy, gW, gH, 14, {
      fill: "rgba(255, 255, 255, 0.04)",
      stroke: "rgba(255, 255, 255, 0.11)",
    });

    ctx.save();
    ctx.font = '600 15px "Instrument Sans", -apple-system, BlinkMacSystemFont, "SF Pro Display", system-ui, sans-serif';
    ctx.fillStyle = "#F8FAFC";
    ctx.textBaseline = "top";
    ctx.fillText(item.title, ix + 16, iy + 18);

    ctx.font = '500 12.5px "Instrument Sans", -apple-system, BlinkMacSystemFont, "SF Pro Text", system-ui, sans-serif';
    ctx.fillStyle = "#9CA3AF";
    ctx.fillText(item.sub, ix + 16, iy + 46);
    ctx.restore();
  });
}

function drawCard06StorefrontLooks(ctx, x, y, w, h, isId) {
  const pad = 28;
  const innerW = w - pad * 2;
  drawCardHeader(
    ctx,
    x,
    y,
    w,
    pad,
    isId
      ? "06  -  PROMO QR, LOOKS, BILINGUAL & LIQUID GLASS"
      : "06  -  STOREFRONT QR, LOOKS & LIQUID GLASS"
  );

  // Top Card: Storefront Promo Card + Scannable QR
  const c1Y = y + 76;
  const c1H = 148;
  drawInnerPanel(ctx, x + pad, c1Y, innerW, c1H, 16, {
    fill: "rgba(255, 255, 255, 0.04)",
    stroke: "rgba(255, 255, 255, 0.14)",
  });

  ctx.save();
  ctx.font = '700 18px "Instrument Sans", -apple-system, BlinkMacSystemFont, "SF Pro Display", system-ui, sans-serif';
  ctx.fillStyle = "#F8FAFC";
  ctx.textBaseline = "top";
  ctx.fillText(
    isId ? "Storefront Promo Card + QR Siap Scan" : "Storefront Promo Card + Scannable QR",
    x + pad + 18,
    c1Y + 16
  );

  ctx.font = '500 13px "Instrument Sans", -apple-system, BlinkMacSystemFont, "SF Pro Text", system-ui, sans-serif';
  ctx.fillStyle = "#9CA3AF";
  ctx.fillText(
    isId
      ? "Link Live #g atau URL Toko Kustom  -  5 Sampel Palet"
      : "Live #g Link or Custom Store URL  -  5 Palette Droplets",
    x + pad + 18,
    c1Y + 44
  );
  ctx.restore();

  // 5 Glossy Palette Droplets
  const swatches = ["#1B263B", "#415A77", "#778DA9", "#D4A373", "#E9ECEF"];
  swatches.forEach((hex, idx) => {
    const sx = x + pad + 18 + idx * 46;
    const sy = c1Y + 80;
    ctx.save();
    drawRoundedRectPath(ctx, sx, sy, 36, 36, 10);
    ctx.fillStyle = hex;
    ctx.fill();
    ctx.strokeStyle = "rgba(255, 255, 255, 0.28)";
    ctx.lineWidth = 1;
    ctx.stroke();
    ctx.restore();
  });

  // Mini QR Plate on right
  const qrSize = 100;
  const qrX = x + pad + innerW - 18 - qrSize;
  const qrY = c1Y + 16;
  ctx.save();
  drawRoundedRectPath(ctx, qrX, qrY, qrSize, qrSize, 10);
  ctx.fillStyle = "#FFFFFF";
  ctx.fill();

  const cells = 9;
  const cellPx = 8;
  const qOffX = qrX + (qrSize - cells * cellPx) / 2;
  const qOffY = qrY + (qrSize - cells * cellPx) / 2;
  ctx.fillStyle = "#060709";
  for (let r = 0; r < cells; r += 1) {
    for (let c = 0; c < cells; c += 1) {
      const isCorner =
        (r < 3 && c < 3) || (r < 3 && c >= cells - 3) || (r >= cells - 3 && c < 3);
      if (isCorner || (r * 7 + c * 11) % 3 === 0) {
        ctx.fillRect(qOffX + c * cellPx, qOffY + r * cellPx, cellPx - 1, cellPx - 1);
      }
    }
  }
  ctx.font = '600 9.5px "IBM Plex Mono", ui-monospace, monospace';
  ctx.fillStyle = "#9CA3AF";
  ctx.textBaseline = "top";
  ctx.fillText("SCAN LINK", qrX + 18, qrY + qrSize + 6);
  ctx.restore();

  // Middle Card: Looks Library + Batch .zip Pack
  const c2Y = c1Y + c1H + 14;
  const c2H = 110;
  drawInnerPanel(ctx, x + pad, c2Y, innerW, c2H, 14, {
    fill: "rgba(255, 255, 255, 0.035)",
    stroke: "rgba(255, 255, 255, 0.10)",
  });

  ctx.save();
  ctx.font = '600 16px "Instrument Sans", -apple-system, BlinkMacSystemFont, "SF Pro Display", system-ui, sans-serif';
  ctx.fillStyle = "#F8FAFC";
  ctx.textBaseline = "top";
  ctx.fillText(
    isId ? "Koleksi Looks + Batch Pack (.zip)" : "Looks Library + Batch .zip Pack",
    x + pad + 18,
    c2Y + 14
  );

  ctx.font = '500 12.5px "Instrument Sans", -apple-system, BlinkMacSystemFont, "SF Pro Text", system-ui, sans-serif';
  ctx.fillStyle = "#9CA3AF";
  ctx.fillText(
    isId
      ? "7 Look Bawaan + Simpan Tanpa Batas + Bundel .zip + .json"
      : "7 Built-in + Unlimited Saved + Batch .zip Pack + .json",
    x + pad + 18,
    c2Y + 39
  );
  ctx.restore();

  let lx = x + pad + 18;
  const ly = c2Y + 67;
  ["Kodak 2383", "Teal & Orange", "Fuji 400H", "Cinema Noir"].forEach((lk) => {
    const lw = drawPill(ctx, lx, ly, lk, {
      height: 28,
      fontSize: 12,
      padX: 12,
      fill: "rgba(255, 255, 255, 0.055)",
      stroke: "rgba(255, 255, 255, 0.13)",
    });
    lx += lw + 10;
  });

  // Bottom 2x2 Workspace Polish Pills (including Bilingual UI EN | ID)
  const c3Y = c2Y + c2H + 16;
  const gGap = 14;
  const bW = (innerW - gGap) / 2;
  const bH = 60;
  const polish = isId
    ? [
        { title: "Bilingual UI (EN | ID)", sub: "English & Bahasa Indonesia", accent: true },
        { title: "Spotlight Command Bar (Ctrl+K)", sub: "Pencarian cepat semua fitur", accent: true },
        { title: "Pemulihan Sesi + Demo Instan", sub: "Auto-save & uji coba 1-klik", accent: false },
        { title: "Apple Liquid Glass UI", sub: "Backdrop GPU 120fps presisi", accent: true },
      ]
    : [
        { title: "Bilingual UI (EN | ID)", sub: "English & Bahasa Indonesia", accent: true },
        { title: "Spotlight Command Bar (Ctrl+K)", sub: "Instant studio command search", accent: true },
        { title: "Session Recovery + Instant Demo", sub: "Auto-save & 1-click test look", accent: false },
        { title: "Apple Liquid Glass UI", sub: "120fps GPU caustic backdrop", accent: true },
      ];

  polish.forEach((p, idx) => {
    const col = idx % 2;
    const row = Math.floor(idx / 2);
    const px = x + pad + col * (bW + gGap);
    const py = c3Y + row * (bH + 12);
    drawInnerPanel(ctx, px, py, bW, bH, 12, {
      fill: p.accent ? "rgba(110, 231, 183, 0.08)" : "rgba(255, 255, 255, 0.04)",
      stroke: p.accent ? "rgba(110, 231, 183, 0.34)" : "rgba(255, 255, 255, 0.12)",
    });
    ctx.save();
    ctx.font = '600 13.5px "Instrument Sans", -apple-system, BlinkMacSystemFont, "SF Pro Text", system-ui, sans-serif';
    ctx.fillStyle = p.accent ? "#F8FAFC" : "#E2E4E9";
    ctx.textBaseline = "top";
    ctx.fillText(p.title, px + 14, py + 12);

    ctx.font = '500 11.5px "Instrument Sans", -apple-system, BlinkMacSystemFont, "SF Pro Text", system-ui, sans-serif';
    ctx.fillStyle = p.accent ? "#A7F3D0" : "#9CA3AF";
    ctx.fillText(p.sub, px + 14, py + 34);
    ctx.restore();
  });
}

export function renderReleasePosterCanvas(lang = "en") {
  const isId = lang === "id";
  const width = 2400;
  const height = 1350;

  const bgCanvas = createObsidianCausticBackground(width, height);
  const out = document.createElement("canvas");
  out.width = width;
  out.height = height;
  const ctx = out.getContext("2d");

  // 1. Background
  ctx.drawImage(bgCanvas, 0, 0);

  // 2. Top Poster Header Band
  const padX = 65;
  drawPrismBadge(ctx, padX, 52, 64);

  ctx.save();
  ctx.font = '700 42px "Bricolage Grotesque", "Instrument Sans", -apple-system, BlinkMacSystemFont, "SF Pro Display", system-ui, sans-serif';
  ctx.fillStyle = "#F8FAFC";
  ctx.textBaseline = "top";
  ctx.shadowColor = "rgba(0, 0, 0, 0.45)";
  ctx.shadowBlur = 12;
  const titleText = "ToneBench";
  const titleX = padX + 84;
  const titleY = 50;
  ctx.fillText(titleText, titleX, titleY);
  const titleW = ctx.measureText(titleText).width;
  ctx.restore();

  drawPill(ctx, titleX + titleW + 18, 56, "v0.9.5 Beta", {
    height: 34,
    fontSize: 15,
    padX: 16,
    dotColor: "#6EE7B7",
    fill: "rgba(110, 231, 183, 0.14)",
    stroke: "rgba(110, 231, 183, 0.45)",
    textColor: "#6EE7B7",
    fontFamily: '"IBM Plex Mono", ui-monospace, monospace',
  });

  drawPill(
    ctx,
    titleX,
    102,
    isId
      ? "Rilis Fitur Gabungan v0.9.0 + v0.9.5  -  Bilingual EN | ID"
      : "v0.9.0 + v0.9.5 Combined Feature Release  -  Bilingual EN | ID",
    {
      height: 30,
      fontSize: 13.5,
      padX: 14,
      fill: "rgba(255, 255, 255, 0.055)",
      stroke: "rgba(255, 255, 255, 0.14)",
      textColor: "#CBD5E1",
    }
  );

  // Right header pills
  const rightBadges = isId
    ? [
        { label: "100% DI BROWSER", dot: "#6EE7B7" },
        { label: "TANPA UPLOAD SERVER", dot: null },
        { label: "BILINGUAL EN | ID", dot: null },
        { label: "60FPS WEBGL", dot: null },
      ]
    : [
        { label: "100% CLIENT-SIDE", dot: "#6EE7B7" },
        { label: "ZERO SERVER UPLOAD", dot: null },
        { label: "BILINGUAL EN | ID", dot: null },
        { label: "60FPS WEBGL", dot: null },
      ];
  ctx.save();
  ctx.font = '600 13px "IBM Plex Mono", ui-monospace, monospace';
  const badgeWidths = rightBadges.map((b) => {
    const tw = measureTrackedText(ctx, b.label, 1.4);
    return Math.round(tw + 32 + (b.dot ? 14 : 0));
  });
  ctx.restore();

  const totalRightW = badgeWidths.reduce((a, b) => a + b, 0) + (rightBadges.length - 1) * 12;
  let rx = width - padX - totalRightW;
  rightBadges.forEach((b, idx) => {
    drawPill(ctx, rx, 72, b.label, {
      height: 38,
      fontSize: 13,
      padX: 16,
      tracking: 1.4,
      dotColor: b.dot,
      fill: "rgba(255, 255, 255, 0.06)",
      stroke: "rgba(255, 255, 255, 0.18)",
      textColor: "#F8FAFC",
      fontFamily: '"IBM Plex Mono", ui-monospace, monospace',
    });
    rx += badgeWidths[idx] + 12;
  });

  // 3. 3x2 Apple Liquid Glass Bento Grid
  const cardW = 740;
  const cardH = 532;
  const colGap = 25;
  const rowGap = 24;
  const gridTop = 178;

  const cards = [
    { col: 0, row: 0, draw: drawCard01Polaris },
    { col: 1, row: 0, draw: drawCard02LogSampler },
    { col: 2, row: 0, draw: drawCard03Export },
    { col: 0, row: 1, draw: drawCard04Scopes },
    { col: 1, row: 1, draw: drawCard05Precision },
    { col: 2, row: 1, draw: drawCard06StorefrontLooks },
  ];

  cards.forEach(({ col, row, draw }) => {
    const cx = padX + col * (cardW + colGap);
    const cy = gridTop + row * (cardH + rowGap);
    drawLiquidGlassCard(ctx, bgCanvas, cx, cy, cardW, cardH, 24);
    draw(ctx, cx, cy, cardW, cardH, isId);
  });

  // 4. Bottom Footer Strip
  ctx.save();
  ctx.strokeStyle = "rgba(255, 255, 255, 0.08)";
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(padX, 1284);
  ctx.lineTo(width - padX, 1284);
  ctx.stroke();

  ctx.font = '500 14px "Instrument Sans", -apple-system, BlinkMacSystemFont, "SF Pro Text", system-ui, sans-serif';
  ctx.fillStyle = "rgba(226, 228, 233, 0.65)";
  ctx.textBaseline = "middle";
  ctx.fillText(
    isId
      ? "ToneBench oleh TFBAGAS  -  Studio Transfer Warna 3D OKLab, .cube LUT & Plugin di Browser"
      : "ToneBench by TFBAGAS  -  Client-Side 3D OKLab Color Transfer & LUT/Plugin Studio",
    padX,
    1315
  );

  const rightFooter = isId
    ? "Ringkasan Rilis v0.9.5 Beta (EN | ID)"
    : "v0.9.5 Beta Release Overview (EN | ID)";
  ctx.font = '600 14px "IBM Plex Mono", ui-monospace, monospace';
  ctx.fillStyle = "#6EE7B7";
  const rfW = ctx.measureText(rightFooter).width;
  ctx.fillText(rightFooter, width - padX - rfW, 1315);
  ctx.restore();

  return out;
}

export async function renderReleasePosterBlob(lang = "en") {
  const canvas = renderReleasePosterCanvas(lang);
  const blob = await new Promise((resolve, reject) => {
    canvas.toBlob(
      (b) => (b ? resolve(b) : reject(new Error("Failed to encode release poster PNG."))),
      "image/png"
    );
  });

  const suffix = lang === "id" ? "_ID" : "_EN";
  return {
    blob,
    width: canvas.width,
    height: canvas.height,
    fileName: `ToneBench_v0.9.5_Beta_Release${suffix}.png`,
  };
}
