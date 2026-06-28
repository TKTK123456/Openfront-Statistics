import {
  createGameRunner,
  GameRunner,
} from "../OpenFrontIO/src/core/GameRunner";
import {
  GameStartInfo,
  GameStartInfoSchema,
  Turn,
  TurnSchema,
} from "../OpenFrontIO/src/core/Schemas";
import { MapManifest } from "../OpenFrontIO/src/core/game/TerrainMapLoader";
import { GameMapType } from "../OpenFrontIO/src/core/game/Game";
import {
  GameMapLoader,
  MapData,
} from "../OpenFrontIO/src/core/game/GameMapLoader";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import {
  ErrorUpdate,
  GameUpdateViewData,
} from "../OpenFrontIO/src/core/game/GameUpdates";
import { decompressGameRecord } from "../OpenFrontIO/src/core/Util";
import { TileRef } from "../OpenFrontIO/src/core/game/GameMap";
import { GameImpl } from "../OpenFrontIO/src/core/game/GameImpl";

const PROJECT_ROOT = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../OpenFrontIO",
);

const gameID = "rJTLpUjY";
const turnInterval = 100;

async function fetchGame(
  id: string,
): Promise<[GameStartInfo | undefined, Turn[]]> {
  let res = await fetch("https://api.openfront.io/public/game/" + id);
  const json = await res.json();
  const startInfo = GameStartInfoSchema.safeParse(json.info);
  const turns = decompressGameRecord(json).turns;
  return [startInfo.data, turns];
}

const gameInfo = await fetchGame(gameID);
//console.log(gameInfo)

class gameMapLoader implements GameMapLoader {
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
const mapLoader = new gameMapLoader(path.join(PROJECT_ROOT, "/resources/maps"));
let gameRunner: Promise<GameRunner> | null = null;
let gr: GameRunner;

interface updateHandlerInterface {
  ownerId(state: number): number;
  tileUpdate(packedTileUpdates: Uint32Array): void;
  tickHandler(g: GameUpdateViewData | ErrorUpdate): void;
}

class updateHandler {
  private static readonly IS_LAND_BIT = 7;
  private static readonly SHORELINE_BIT = 6;
  private static readonly OCEAN_BIT = 5;
  private static readonly MAGNITUDE_MASK = 0x1f; // 11111 in binary

  // State bits (Uint16Array)
  private static readonly PLAYER_ID_MASK = 0xfff;
  private static readonly FALLOUT_BIT = 13;
  private static readonly DEFENSE_BONUS_BIT = 14;
  public turnInterval: number;

  constructor(turnInterval: number) {
    this.turnInterval = turnInterval;
  }

  ownerId(state: number): number {
    return state & updateHandler.PLAYER_ID_MASK;
  }

  conquredTiles: Map<number, number> = new Map()

  conquredTile(tile: number) {
    if (this.conquredTiles.has(tile)) {
      let frequency = this.conquredTiles.get(tile)
      if (frequency === undefined) return;
      this.conquredTiles.set(tile, frequency+1)
    } else {
      this.conquredTiles.set(tile, 1)
    }
  }

  tickHandler(g: GameUpdateViewData | ErrorUpdate): void {
    if (gr.game.inSpawnPhase() || gr.game.ticks()! % this.turnInterval) return;
    console.log(
      gr.game
        .allPlayers()
        .filter((p) => {
          return p.tiles().size > 1000;
        })
        .map((p) => {
          return p.name();
        }),
    );
    console.log(this.conquredTiles)

    this.conquredTiles.clear();
    console.log(gr.game.ticks() + "/" + gameInfo[1].length);
  }
}
const gameUpdateHandler = new updateHandler(turnInterval);

if (gameInfo[0] !== undefined) {
  gameRunner = createGameRunner(
    gameInfo[0],
    undefined,
    mapLoader,
    gameUpdateHandler.tickHandler.bind(gameUpdateHandler),
  ).then((gr) => {
    return gr;
  });
  gr = await gameRunner;
  console.log(gameInfo[1].length);
  for (let turnNum = 0; turnNum < gameInfo[1].length; turnNum++) {
    const turn = gameInfo[1][turnNum];
    gr.addTurn(turn);
    gr.executeNextTick();
    if (!gr.game.inSpawnPhase()) {
      gr.game.allPlayers().map(p=>{
    const oldConquer = p.conquer.bind(p)
    p.conquer = function(tile: number) {
      gameUpdateHandler.conquredTile(tile)
      return oldConquer(tile)
    }
  })
    }
  }
  console.log("Done");
}
