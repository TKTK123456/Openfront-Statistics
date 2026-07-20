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
