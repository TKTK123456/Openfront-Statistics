import { createHeatmap } from "src/visualization/heatmap";
import { parentPort, workerData } from "worker_threads";

interface GradientStop {
  stop: number;
  color: [number, number, number, number];
}

interface WorkerData {
  width: number;
  height: number;
  radius: number;
  gradient: GradientStop[];
  background: ArrayBufferLike;
}

interface RenderMessage {
  i: number;
  borderTiles: ArrayBufferLike;
  tiles: ArrayBufferLike;
  counts: ArrayBufferLike;
}

const { width, height, radius, gradient } = workerData as WorkerData;

const background = new Uint8ClampedArray((workerData as WorkerData).background);

const radiusSq = radius * radius;

function render(
  borderTiles: Int32Array,
  tiles: Int32Array,
  counts: Float64Array,
): Uint8ClampedArray {
  // Base = terrain + black country outlines
  const base = new Uint8ClampedArray(background);

  for (let k = 0; k < borderTiles.length; k++) {
    const idx = borderTiles[k] * 4;
    base[idx] = 0;
    base[idx + 1] = 0;
    base[idx + 2] = 0;
    base[idx + 3] = 255;
  }

  return createHeatmap({
    tileFrequencies: { tiles, counts },
    width,
    height,
    radius,
    radiusSq,
    gradient,
    base,
  });
}

parentPort?.on("message", (m: RenderMessage) => {
  const rgba = render(
    new Int32Array(m.borderTiles),
    new Int32Array(m.tiles),
    new Float64Array(m.counts),
  );

  parentPort?.postMessage(
    {
      i: m.i,
      rgba: rgba.buffer,
    },
    [rgba.buffer as ArrayBuffer],
  );
});
