import { parentPort, workerData } from "worker_threads";

// Pure-JS composite frame renderer (no OpenFront imports), run in a worker.
// Per frame: terrain background -> thin black outline of every spawned country
// -> conquest heatmap blended on top. Heat intensity scales with how often a
// tile was taken in the window (a tile hit in all 3 turns burns hotter).
const { width, height, radius, gradient, frequencyWorth } = workerData;
const background = new Uint8ClampedArray(workerData.background);
const radiusSq = radius * radius;

const lerp = (a, b, t) => a + (b - a) * t;

function interpolateColor(t) {
  t = Math.max(0, Math.min(1, t));
  let start = gradient[0];
  let end = gradient[gradient.length - 1];
  for (let i = 0; i < gradient.length - 1; i++) {
    if (t >= gradient[i].stop && t <= gradient[i + 1].stop) {
      start = gradient[i];
      end = gradient[i + 1];
      break;
    }
  }
  const lt = (t - start.stop) / (end.stop - start.stop);
  return [
    Math.round(lerp(start.color[0], end.color[0], lt)),
    Math.round(lerp(start.color[1], end.color[1], lt)),
    Math.round(lerp(start.color[2], end.color[2], lt)),
    Math.round(lerp(start.color[3], end.color[3], lt)),
  ];
}

function render(borderTiles, tiles, counts) {
  // Base = terrain + black country outlines (drawn under the heat).
  const base = new Uint8ClampedArray(background);
  for (let k = 0; k < borderTiles.length; k++) {
    const idx = borderTiles[k] * 4;
    base[idx] = 0;
    base[idx + 1] = 0;
    base[idx + 2] = 0;
    base[idx + 3] = 255;
  }

  const heatAlpha = new Float32Array(width * height);
  let maxHeat = 0;
  for (let k = 0; k < tiles.length; k++) {
    const ref = tiles[k];
    const value = counts[k] * frequencyWorth;
    const x = ref % width;
    const y = (ref / width) | 0;
    const xStart = Math.max(0, Math.floor(x - radius));
    const xEnd = Math.min(width - 1, Math.ceil(x + radius));
    const yStart = Math.max(0, Math.floor(y - radius));
    const yEnd = Math.min(height - 1, Math.ceil(y + radius));
    for (let py = yStart; py <= yEnd; py++) {
      for (let px = xStart; px <= xEnd; px++) {
        const dx = px - x;
        const dy = py - y;
        const distSq = dx * dx + dy * dy;
        if (distSq > radiusSq) continue;
        const norm = Math.sqrt(distSq) / radius;
        heatAlpha[py * width + px] += value * Math.exp(-3 * norm * norm);
      }
    }
  }
  for (const v of heatAlpha) if (v > maxHeat) maxHeat = v;

  const out = new Uint8ClampedArray(width * height * 4);
  const denom = maxHeat > 0 ? Math.log2(maxHeat + 1) : 0;
  for (let i = 0; i < width * height; i++) {
    const idx = i * 4;
    const alpha = maxHeat > 0 ? Math.log2(heatAlpha[i] + 1) / denom : 0;
    const [r, g, b, a] = interpolateColor(alpha);
    const ha = a / 255;
    if (ha === 0) {
      out[idx] = base[idx];
      out[idx + 1] = base[idx + 1];
      out[idx + 2] = base[idx + 2];
      out[idx + 3] = 255;
      continue;
    }
    out[idx] = Math.round(r * ha + base[idx] * (1 - ha));
    out[idx + 1] = Math.round(g * ha + base[idx + 1] * (1 - ha));
    out[idx + 2] = Math.round(b * ha + base[idx + 2] * (1 - ha));
    out[idx + 3] = 255;
  }
  return out;
}

parentPort.on("message", (m) => {
  const rgba = render(
    new Int32Array(m.borderTiles),
    new Int32Array(m.tiles),
    new Float64Array(m.counts),
  );
  parentPort.postMessage({ i: m.i, rgba: rgba.buffer }, [rgba.buffer]);
});
