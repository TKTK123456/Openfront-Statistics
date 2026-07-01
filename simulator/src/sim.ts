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
import { GameMapSize, GameMapType } from "../OpenFrontIO/src/core/game/Game";
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
import { heatmapCreator } from "./heatmap";
import { encodeVideo } from "./encode";

const PROJECT_ROOT = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../OpenFrontIO",
);
let outFolder = path.join(path.dirname(fileURLToPath(import.meta.url)), `/out`);
const gameID = "24cQJmGp";
const turnInterval = 100;

function createHeatmap() {}

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
const totalTurns = gameInfo[1].length;

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

let heatmapMaker: heatmapCreator;
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

  conquredTilesShort: Map<number, number> = new Map();
  conquredTilesFullGame: Map<number, number>[] = [];
  conquredTilesMiddleShort: Map<number, number> = new Map();

  conquredTile(tile: number) {
    this.conquredTilesShort.set(
      tile,
      (this.conquredTilesShort.get(tile) ?? 0) + 1,
    );
    this.conquredTilesMiddleShort.set(
      tile,
      (this.conquredTilesMiddleShort.get(tile) ?? 0) + 1,
    );
  }

  tickHandler(g: GameUpdateViewData | ErrorUpdate): void {
    if (
      (!gr.game.inSpawnPhase() &&
        (turnNum + this.turnInterval / 2 + 1) % this.turnInterval === 0) ||
      turnNum >= totalTurns - 1 ||
      gr.game.getWinner() !== null
    ) {
      let tempMap = new Map();
      for (let tile of this.conquredTilesMiddleShort.entries()) {
        tempMap.set(tile[0], tile[1]);
      }
      this.conquredTilesFullGame.push(tempMap);
      this.conquredTilesMiddleShort.clear();
    }
    if (
      (gr.game.inSpawnPhase() || (turnNum + 1) % this.turnInterval !== 0) &&
      turnNum < totalTurns - 1 &&
      gr.game.getWinner() == null
    )
      return;
    console.log(turnNum + 1 + "/" + totalTurns);
    let tempMap = new Map();
    for (let tile of this.conquredTilesShort.entries()) {
      tempMap.set(tile[0], tile[1]);
    }
    this.conquredTilesFullGame.push(tempMap);
    this.conquredTilesShort.clear();
  }
}

const gameUpdateHandler = new updateHandler(turnInterval);
let turnNum = 0;

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
  console.log(totalTurns);
  let wrapped = {
    players: false,
  };
  const map = mapLoader.getMapData(gameInfo[0].config.gameMap);
  heatmapMaker = new heatmapCreator(
    map,
    gr.game,
    gameInfo[0].config.gameMapSize === GameMapSize.Compact,
  );
  for (turnNum = 0; turnNum < totalTurns; turnNum++) {
    const turn = gameInfo[1][turnNum];
    gr.addTurn(turn);
    try {
      gr.executeNextTick();
    } catch (e) {
      console.log(e);
    }
    if (gr.game.getWinner() !== null) break;
    if (!wrapped.players && !gr.game.inSpawnPhase()) {
      wrapped.players = true;
      gr.game.allPlayers().map((p) => {
        const oldConquer = p.conquer.bind(p);
        p.conquer = function (tile: number) {
          gameUpdateHandler.conquredTile(tile);
          return oldConquer(tile);
        };
      });
    }
  }
  let heatmapFilePath = path.join(outFolder, `${gameID}.mp4`);
  fs.mkdirSync(outFolder, { recursive: true });
  const videoData: Uint8ClampedArray[] = [];
  for (let i = 0; i < gameUpdateHandler.conquredTilesFullGame.length; i++) {
    const heatmapData = await heatmapMaker.create(
      gameUpdateHandler.conquredTilesFullGame[i],
    );
    console.log(
      `Created heatmap ${i + 1}/${gameUpdateHandler.conquredTilesFullGame.length}`,
    );
    if (heatmapData) videoData.push(heatmapData);
  }
  encodeVideo(
    `${heatmapFilePath}output.mp4`,
    videoData,
    gr.game.width(),
    gr.game.height(),
    10,
  );
  console.log("Done");
}
