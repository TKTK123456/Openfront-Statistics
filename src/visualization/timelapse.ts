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
    workerUrl: new URL("../workers/timelapseWorker.ts", import.meta.url),
    workerData: {
      background: background.buffer,
      width,
      height,
      radius: 10,
      gradient
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
      const borderBuffer = border.buffer as ArrayBuffer;
      const tilesBuffer = tiles.buffer as ArrayBuffer;
      const countsBuffer = counts.buffer as ArrayBuffer;

      return {
        message: {
          borderTiles: borderBuffer,
          tiles: tilesBuffer,
          counts: countsBuffer,
        },
        transfer: [borderBuffer, tilesBuffer, countsBuffer],
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
