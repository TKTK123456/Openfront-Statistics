import { VideoEncoder } from "./encode";
import { Gradient } from "./heatmap";
import { renderFramesToVideo } from "../util/renderPool";
import { WebSocket } from "ws";

// One combined timelapse: terrain + black country outlines under a
// count-weighted conquest heatmap. Frames are rendered across a worker pool
// and streamed to the encoder in order.
export async function createCombinedTimelapse(opts: {
  out: string | WebSocket;
  width: number;
  height: number;
  background: Uint8ClampedArray;
  gradient: Gradient;
  borderFrames: Int32Array[] | null;
  dataFrames: Map<number, number>[];
  wsType?: string;
}) {
  const { out, width, height, background, gradient, wsType } = opts;
  if (opts.borderFrames === null) {
    opts.borderFrames = Array.from(
      { length: opts.dataFrames.length },
      () => new Int32Array(0),
    );
  }
  const frameCount = Math.min(opts.borderFrames.length, opts.dataFrames.length);
  let encoder: VideoEncoder | WebSocket;
  if (out instanceof WebSocket) {
    encoder = out;
  } else {
    encoder = new VideoEncoder(out, width, height, 30);
    await encoder.open();
  }

  await renderFramesToVideo({
    workerUrl: new URL("../workers/timelapseWorker.ts", import.meta.url),
    workerData: {
      background: background.buffer,
      width,
      height,
      radius: 10,
      gradient,
    },
    frameCount,
    frameInput: (i) => {
      if (opts.borderFrames === null) {
        opts.borderFrames = Array.from(
          { length: opts.dataFrames.length },
          () => new Int32Array(0),
        );
      }
      const border = opts.borderFrames[i];
      const window = opts.dataFrames[i];
      const tiles = new Int32Array(window.size);
      const counts = new Float64Array(window.size);
      let k = 0;
      for (const [tile, count] of window) {
        tiles[k] = tile;
        counts[k] = count;
        k++;
      }
      const borderBuffer = border.slice().buffer as ArrayBuffer;
      const tilesBuffer = tiles.slice().buffer as ArrayBuffer;
      const countsBuffer = counts.slice().buffer as ArrayBuffer;
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
    wsType,
  });

  if (!(out instanceof WebSocket)) await encoder.close();
}
