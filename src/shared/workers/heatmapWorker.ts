/// <reference lib="webworker" />

import {
  createHeatmap,
  Gradient,
  heatmapCreator,
} from "src/visualization/heatmap";
import { PNG } from "pngjs/browser";

const ctx = self as unknown as DedicatedWorkerGlobalScope;

ctx.onmessage = (e) => {
  const { idx, frame, width, height } = e.data;
  let gradient = heatmapCreator.defaultGradient;
  const pixels = createHeatmap({
    tileFrequencies: frame,
    width,
    height,
    radius: 10,
    radiusSq: 100,
    gradient,
    base: null,
  });

  const png = new PNG({
    width,
    height,
  });

  png.data.set(pixels);

  const buffer = PNG.sync.write(png);

  // Make a real ArrayBuffer, not ArrayBufferLike
  const arrayBuffer = buffer.buffer.slice(
    buffer.byteOffset,
    buffer.byteOffset + buffer.byteLength,
  ) as ArrayBuffer;

  ctx.postMessage(
    {
      idx,
      buffer: arrayBuffer,
    },
    [arrayBuffer],
  );
};
