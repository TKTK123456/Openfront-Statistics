import { VideoEncoder } from "./encode";
import { Gradient } from "./heatmap";
import { renderFramesToVideo } from "../util/renderPool";

// One combined timelapse: terrain + black country outlines under a
// count-weighted conquest heatmap. Frames are rendered across a worker pool
// and streamed to the encoder in order.
export async function createCombinedTimelapse(opts: {
  outPath: string;
  width: number;
  height: number;
  background: Uint8ClampedArray;
  gradient: Gradient;
  borderFrames: Int32Array[];
  conquestFrames: Map<number, number>[];
}) {
  const { outPath, width, height, background, gradient } = opts;
  const frameCount = Math.min(
    opts.borderFrames.length,
    opts.conquestFrames.length,
  );

  const encoder = new VideoEncoder(outPath, width, height, 30);
  await encoder.open();

  await renderFramesToVideo({
    workerUrl: new URL("../workers/timelapseWorker.mjs", import.meta.url),
    workerData: {
      background: background.buffer,
      width,
      height,
      radius: 10,
      gradient,
      frequencyWorth: 0.01,
    },
    frameCount,
    frameInput: (i) => {
      const border = opts.borderFrames[i];
      const window = opts.conquestFrames[i];
      const tiles = new Int32Array(window.size);
      const counts = new Float64Array(window.size);
      let k = 0;
      for (const [tile, count] of window) {
        tiles[k] = tile;
        counts[k] = count;
        k++;
      }
      return {
        message: {
          borderTiles: border.buffer,
          tiles: tiles.buffer,
          counts: counts.buffer,
        },
        transfer: [border.buffer, tiles.buffer, counts.buffer],
      };
    },
    encoder,
    onProgress: (n) => {
      if (n % 100 === 0 || n === frameCount) {
        console.log(`Encoded frame ${n}/${frameCount}`);
      }
    },
  });

  await encoder.close();
}
