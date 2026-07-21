import { Worker } from "worker_threads";
import { WebSocket } from "ws";
import { Game } from "./main";

export interface GameHanlderWorkerResult {
  width: number;
  height: number;
  fullGame: Uint8ClampedArray;
  borderFrames: Int32Array[];
  conquestFrames: Map<number, number>[];
  background: Uint8ClampedArray<ArrayBufferLike> | undefined;
  tradeShipRoutesOutput: Uint8ClampedArray<ArrayBufferLike>;
  pirating: Uint8ClampedArray<ArrayBufferLike>;
  tradeShipRoutesTime: Map<number, number>[];
}

export function runGame(
  gameID: string,
  info: { ws?: WebSocket; cache?: Map<string, Game> },
): Promise<GameHanlderWorkerResult> {
  const { ws, cache } = info;
  return new Promise((resolve, reject) => {
    const worker = new Worker(
      new URL("../workers/handleGame.ts", import.meta.url),
    );

    worker.on("message", (data) => {
      switch (data.type) {
        case "error":
          reject(new Error(data.error));
          worker.terminate();
          break;
        case "finish":
          data.fullGame = new Uint8ClampedArray(data.fullGame);
          data.background = new Uint8ClampedArray(data.background);
          data.tradeShipRoutesOutput = new Uint8ClampedArray(
            data.tradeShipRoutesOutput,
          );
          data.pirating = new Uint8ClampedArray(data.pirating);
          resolve(data);
          worker.terminate();
          break;
        case "progress":
          if (ws === undefined) break;
          ws.send(JSON.stringify(data));
          break;
      }
    });

    worker.on("error", reject);

    worker.postMessage(gameID);
  });
}
