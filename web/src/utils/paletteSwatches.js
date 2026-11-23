function rgbToHex(r, g, b) {
  const h = (v) => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, "0");
  return `#${h(r)}${h(g)}${h(b)}`.toUpperCase();
}

export function extractPaletteSwatches(sourceCanvas, count = 5) {
  if (!sourceCanvas) {
    return ["#1B263B", "#415A77", "#778DA9", "#D4A373", "#E9ECEF"].slice(0, count);
  }
  const sampleW = 48;
  const sampleH = 48;
  const tmp = document.createElement("canvas");
  tmp.width = sampleW;
  tmp.height = sampleH;
  const tctx = tmp.getContext("2d", { willReadFrequently: true });
  tctx.drawImage(sourceCanvas, 0, 0, sampleW, sampleH);
  const { data } = tctx.getImageData(0, 0, sampleW, sampleH);

  // Quantize into 5-bit RGB buckets and pick diverse prominent colors
  const buckets = new Map();
  for (let i = 0; i < data.length; i += 4) {
    if (data[i + 3] < 128) continue;
    const r = data[i];
    const g = data[i + 1];
    const b = data[i + 2];
    const qr = r >> 4;
    const qg = g >> 4;
    const qb = b >> 4;
    const key = (qr << 8) | (qg << 4) | qb;
    const entry = buckets.get(key);
    if (entry) {
      entry.r += r;
      entry.g += g;
      entry.b += b;
      entry.n += 1;
    } else {
      buckets.set(key, { r, g, b, n: 1 });
    }
  }

  const sorted = [...buckets.values()]
    .map((e) => ({
      r: e.r / e.n,
      g: e.g / e.n,
      b: e.b / e.n,
      n: e.n,
    }))
    .sort((a, b) => b.n - a.n);

  const picked = [];
  const minDistSq = 36 * 36;
  for (const c of sorted) {
    const tooClose = picked.some((p) => {
      const dr = p.r - c.r;
      const dg = p.g - c.g;
      const db = p.b - c.b;
      return dr * dr + dg * dg + db * db < minDistSq;
    });
    if (!tooClose) {
      picked.push(c);
      if (picked.length >= count) break;
    }
  }
  while (picked.length < count && sorted.length > picked.length) {
    picked.push(sorted[picked.length]);
  }
  const fallbackSwatches = ["#1B263B", "#415A77", "#778DA9", "#D4A373", "#E9ECEF"];
  picked.sort(
    (a, b) =>
      0.2126 * a.r + 0.7152 * a.g + 0.0722 * a.b - (0.2126 * b.r + 0.7152 * b.g + 0.0722 * b.b)
  );
  const hexes = picked.map((c) => rgbToHex(c.r, c.g, c.b));
  while (hexes.length < count) {
    hexes.push(fallbackSwatches[hexes.length % fallbackSwatches.length]);
  }
  return hexes.slice(0, count);
}
