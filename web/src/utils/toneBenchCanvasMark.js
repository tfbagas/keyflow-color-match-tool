/**
 * Shared 2D Canvas renderer for the ToneBench Isometric 3D LUT Cube mark.
 * Used by both Promo Cards (imageExporter.js) and Release Posters (releaseKitGenerator.js).
 */
export function drawToneBenchCubeCanvas(ctx, x, y, size) {
  const s = size / 48;
  const px = (vx) => x + vx * s;
  const py = (vy) => y + vy * s;

  ctx.save();
  // Outer Calibration Wireframe Cube
  ctx.beginPath();
  ctx.moveTo(px(24), py(4));
  ctx.lineTo(px(41), py(14));
  ctx.lineTo(px(41), py(34));
  ctx.lineTo(px(24), py(44));
  ctx.lineTo(px(7), py(34));
  ctx.lineTo(px(7), py(14));
  ctx.closePath();
  ctx.strokeStyle = "rgba(255, 255, 255, 0.42)";
  ctx.lineWidth = Math.max(1, 1.5 * s);
  ctx.lineJoin = "round";
  ctx.stroke();

  // Connecting projection lines
  ctx.beginPath();
  ctx.moveTo(px(24), py(4));
  ctx.lineTo(px(24), py(13.5));
  ctx.moveTo(px(41), py(34));
  ctx.lineTo(px(33), py(29.3));
  ctx.moveTo(px(7), py(34));
  ctx.lineTo(px(15), py(29.3));
  ctx.strokeStyle = "rgba(52, 211, 153, 0.28)";
  ctx.lineWidth = Math.max(0.75, 1 * s);
  ctx.lineCap = "round";
  ctx.stroke();

  // Inner Solid 3D LUT Cube — Top facet
  const topGrad = ctx.createLinearGradient(px(15), py(13.5), px(33), py(24));
  topGrad.addColorStop(0, "#5EEAD4");
  topGrad.addColorStop(1, "#34D399");
  ctx.beginPath();
  ctx.moveTo(px(24), py(13.5));
  ctx.lineTo(px(33), py(18.7));
  ctx.lineTo(px(24), py(24));
  ctx.lineTo(px(15), py(18.7));
  ctx.closePath();
  ctx.fillStyle = topGrad;
  ctx.fill();

  // Inner Solid 3D LUT Cube — Left facet
  ctx.beginPath();
  ctx.moveTo(px(15), py(18.7));
  ctx.lineTo(px(24), py(24));
  ctx.lineTo(px(24), py(34.5));
  ctx.lineTo(px(15), py(29.3));
  ctx.closePath();
  ctx.fillStyle = "#10B981";
  ctx.fill();

  // Inner Solid 3D LUT Cube — Right facet
  ctx.beginPath();
  ctx.moveTo(px(24), py(24));
  ctx.lineTo(px(33), py(18.7));
  ctx.lineTo(px(33), py(29.3));
  ctx.lineTo(px(24), py(34.5));
  ctx.closePath();
  ctx.fillStyle = "#047857";
  ctx.fill();

  // Inner ridge highlight
  ctx.beginPath();
  ctx.moveTo(px(15), py(18.7));
  ctx.lineTo(px(24), py(24));
  ctx.lineTo(px(33), py(18.7));
  ctx.moveTo(px(24), py(24));
  ctx.lineTo(px(24), py(34.5));
  ctx.strokeStyle = "rgba(255, 255, 255, 0.55)";
  ctx.lineWidth = Math.max(0.75, 1 * s);
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  ctx.stroke();

  ctx.restore();
}
