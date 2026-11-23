/**
 * Shared 2D Canvas renderer for the ToneBench isometric 3D LUT Cube mark
 * in calibrated Steel Night x Arctic Ink tones.
 */
export function drawToneBenchCubeCanvas(ctx, x, y, size) {
  const s = size / 48;
  const px = (vx) => x + vx * s;
  const py = (vy) => y + vy * s;

  ctx.save();
  ctx.beginPath();
  ctx.moveTo(px(24), py(4));
  ctx.lineTo(px(41), py(14));
  ctx.lineTo(px(41), py(34));
  ctx.lineTo(px(24), py(44));
  ctx.lineTo(px(7), py(34));
  ctx.lineTo(px(7), py(14));
  ctx.closePath();
  ctx.strokeStyle = "rgba(201, 215, 226, 0.50)";
  ctx.lineWidth = Math.max(1, 1.5 * s);
  ctx.lineJoin = "round";
  ctx.stroke();

  ctx.beginPath();
  ctx.moveTo(px(24), py(4));
  ctx.lineTo(px(24), py(13.5));
  ctx.moveTo(px(41), py(34));
  ctx.lineTo(px(33), py(29.3));
  ctx.moveTo(px(7), py(34));
  ctx.lineTo(px(15), py(29.3));
  ctx.strokeStyle = "rgba(127, 163, 194, 0.44)";
  ctx.lineWidth = Math.max(0.75, 1 * s);
  ctx.lineCap = "round";
  ctx.stroke();

  const topGrad = ctx.createLinearGradient(px(15), py(13.5), px(33), py(24));
  topGrad.addColorStop(0, "#F4F7FB");
  topGrad.addColorStop(1, "#C9D7E2");
  ctx.beginPath();
  ctx.moveTo(px(24), py(13.5));
  ctx.lineTo(px(33), py(18.7));
  ctx.lineTo(px(24), py(24));
  ctx.lineTo(px(15), py(18.7));
  ctx.closePath();
  ctx.fillStyle = topGrad;
  ctx.fill();

  ctx.beginPath();
  ctx.moveTo(px(15), py(18.7));
  ctx.lineTo(px(24), py(24));
  ctx.lineTo(px(24), py(34.5));
  ctx.lineTo(px(15), py(29.3));
  ctx.closePath();
  ctx.fillStyle = "#7FA3C2";
  ctx.fill();

  ctx.beginPath();
  ctx.moveTo(px(24), py(24));
  ctx.lineTo(px(33), py(18.7));
  ctx.lineTo(px(33), py(29.3));
  ctx.lineTo(px(24), py(34.5));
  ctx.closePath();
  ctx.fillStyle = "#4A6B86";
  ctx.fill();

  ctx.beginPath();
  ctx.moveTo(px(15), py(18.7));
  ctx.lineTo(px(24), py(24));
  ctx.lineTo(px(33), py(18.7));
  ctx.moveTo(px(24), py(24));
  ctx.lineTo(px(24), py(34.5));
  ctx.strokeStyle = "rgba(244, 247, 251, 0.68)";
  ctx.lineWidth = Math.max(0.75, 1 * s);
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  ctx.stroke();

  ctx.restore();
}
