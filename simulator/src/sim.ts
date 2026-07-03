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
import { heatmapCreator } from "./visualization/heatmap";
import { encodeVideo } from "./visualization/encode";
import { PNG } from "pngjs";
import { TileConquredHandler } from "./sims/conquredTiles";

const PROJECT_ROOT = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../OpenFrontIO",
);
let outFolder = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  `../out`,
);
const gameID = "kgQ2yuYJ";
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

let tileConquredHandler: TileConquredHandler;
let turnNum = 0;

if (gameInfo[0] !== undefined) {
  const handleGameUpdate = (g: GameUpdateViewData | ErrorUpdate) => {
    if (tileConquredHandler) {
      tileConquredHandler.tickHandler(g, turnNum);
    }
    return null;
  };
  gameRunner = createGameRunner(
    gameInfo[0],
    undefined,
    mapLoader,
    handleGameUpdate,
  ).then((gr) => {
    return gr;
  });
  gr = await gameRunner;
  tileConquredHandler = new TileConquredHandler(turnInterval, gr, totalTurns);
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
          tileConquredHandler.conquredTile(tile);
          return oldConquer(tile);
        };
      });
    }
  }
  let heatmapFilePath = path.join(outFolder, `${gameID}.mp4`);
  fs.mkdirSync(outFolder, { recursive: true });
  const videoData: Uint8ClampedArray[] = [];
  const heatmapData = await heatmapMaker.create(
    tileConquredHandler.conquredTilesTotal,
    0.001,
  );
  if (heatmapData) {
    const png = new PNG({
      width: gr.game.width(),
      height: gr.game.height(),
    });
    png.data.set(heatmapData);

    await new Promise<void>((resolve, reject) => {
      png
        .pack()
        .pipe(fs.createWriteStream(heatmapFilePath + ".png"))
        .on("finish", () => resolve())
        .on("error", reject);
    });
  }
  for (let i = 0; i < tileConquredHandler.conquredTilesFullGame.length; i++) {
    const heatmapData = await heatmapMaker.create(
      tileConquredHandler.conquredTilesFullGame[i],
    );
    console.log(
      `Created heatmap ${i + 1}/${tileConquredHandler.conquredTilesFullGame.length}`,
    );
    if (heatmapData) videoData.push(heatmapData);
  }
  encodeVideo(
    `${heatmapFilePath}`,
    videoData,
    gr.game.width(),
    gr.game.height(),
    10,
  );
  console.log("Done");
}
