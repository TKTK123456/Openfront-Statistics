import path from "path";
import fs from "fs";
import {
  GameMapLoader,
  MapData,
} from "../../OpenFrontIO/src/core/game/GameMapLoader";
import { GameMapType } from "../../OpenFrontIO/src/core/game/Maps.gen";
import { MapManifest } from "../../OpenFrontIO/src/core/game/TerrainMapLoader";
import {
  GameStartInfo,
  Turn,
  GameStartInfoSchema,
} from "../../OpenFrontIO/src/core/Schemas";
import { decompressGameRecord } from "../../OpenFrontIO/src/core/Util";
import { fileURLToPath } from "url";
import { WebSocket } from "ws";
import { PNG } from "pngjs";

export class gameMapLoader implements GameMapLoader {
  constructor(private mapsDir: string) {}

  getMapData(map: GameMapType): MapData {
    const key = Object.keys(GameMapType).find(
      (k) => GameMapType[k as keyof typeof GameMapType] === map,
    );
    if (key === undefined) {
      throw new Error(`unknown map: ${map}`);
    }
    const dir = path.join(this.mapsDir, key.toLowerCase());
    const readBin = (name: string) => async () =>
      new Uint8Array(fs.readFileSync(path.join(dir, name)));
    return {
      mapBin: readBin("map.bin"),
      map4xBin: readBin("map4x.bin"),
      map16xBin: readBin("map16x.bin"),
      manifest: async () =>
        JSON.parse(
          fs.readFileSync(path.join(dir, "manifest.json"), "utf8"),
        ) as MapManifest,
      webpPath: path.join(dir, "thumbnail.webp"),
    };
  }
}

export async function fetchGame(
  id: string,
): Promise<[GameStartInfo | undefined, Turn[]]> {
  let res = await fetch("https://api.openfront.io/public/game/" + id);
  const json = await res.json();
  const startInfo = GameStartInfoSchema.safeParse(json.info);
  const turns = decompressGameRecord(json).turns;
  return [startInfo.data, turns];
}

export const PROJECT_ROOT = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../../OpenFrontIO",
);

export function sendImage(ws: WebSocket, type: number, data: Buffer) {
  const packet = Buffer.allocUnsafe(1 + data.length);

  packet.writeUInt8(type, 0);
  data.copy(packet, 1);

  ws.send(packet, { binary: true });
}

export function createImageBuffer(
  config: {
    width: number;
    height: number;
  },
  data: Uint8ClampedArray,
) {
  const img = new PNG(config);
  img.data.set(data);
  return PNG.sync.write(img);
}

export function interpolateFrames(
  frames: Map<number, number>[],
  factor: number,
): Map<number, number>[] {
  if (frames.length <= 1 || factor <= 1) return frames;

  const result: Map<number, number>[] = [];

  for (let i = 0; i < frames.length - 1; i++) {
    const current = frames[i];
    const next = frames[i + 1];

    // Original frame
    result.push(current);

    // Interpolated frames
    for (let step = 1; step < factor; step++) {
      const t = step / factor;
      const interpolated = new Map<number, number>();

      const keys = new Set([...current.keys(), ...next.keys()]);

      for (const key of keys) {
        const a = current.get(key) ?? 0;
        const b = next.get(key) ?? 0;

        const value = a + (b - a) * t;

        // Skip values that are effectively zero
        //if (value > 0.0001) {
          interpolated.set(key, value);
        //}
      }

      result.push(interpolated);
    }
  }
  result.push(frames[frames.length - 1]);

  return result;
}
