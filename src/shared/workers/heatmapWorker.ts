/// <reference lib="webworker" />

import { createHeatmap, heatmapCreator } from "src/visualization/heatmap";
import { PNG } from "pngjs/browser";

const ctx = self as unknown as DedicatedWorkerGlobalScope;

ctx.onmessage = (e) => {
  const { idx, frame, width, height } = e.data;

  const pixels = createHeatmap(
    frame,
    height,
    width,
    10,
    100,
    null,
    heatmapCreator.defaultGradient,
  );

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
