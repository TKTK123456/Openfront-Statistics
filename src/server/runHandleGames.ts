import { Worker } from "worker_threads";

export interface GameHanlderWorkerResult {
  width: number;
  height: number;
  fullGame: Uint8ClampedArray;
  borderFrames: Int32Array[];
  conquestFrames: {
    [k: string]: number;
  }[];
  background: Uint8ClampedArray<ArrayBufferLike> | undefined;
  tradeShipRoutesOutput: Uint8ClampedArray<ArrayBufferLike>;
  pirating: Uint8ClampedArray<ArrayBufferLike>;
}

export function runGameHanlderWorker(
  gameID: string,
): Promise<GameHanlderWorkerResult> {
  return new Promise((resolve, reject) => {
    const worker = new Worker(
      new URL("../workers/handleGame.ts", import.meta.url),
    );

    worker.on("message", (data) => {
      if (data.error) {
        reject(new Error(data.error));
      } else {
        resolve(data);
      }

      worker.terminate();
    });

    worker.on("error", reject);

    worker.postMessage(gameID);
  });
}
