import { GameRunner } from "../OpenFrontIO/src/core/GameRunner";
import path from "path";
import fs from "fs";
import { fileURLToPath } from "url";
import { fetchGame } from "./shared/util/util";
import {
  gameRunnerHandlerConfig,
  handleGameRunner,
} from "./GameRunnerHandler/gameRunnerHandler";
import { heatmapCreator } from "./visualization/heatmap";
import { createCombinedTimelapse } from "./visualization/timelapse";
import { GameMapSize } from "../OpenFrontIO/src/core/game/Game";
import { TileConqueredHandler } from "./handlers/conqueredTiles";

const outFolder = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  `../out`,
);
const gameID = process.argv[2] ?? "kgQ2yuYJ";
// Turns condensed into each frame; played back at 30fps.
const turnInterval = 17;

const gameInfo = await fetchGame(gameID);
if (gameInfo[0] === undefined) throw new Error(`could not load game ${gameID}`);
const totalTurns = gameInfo[1].length;

const config: gameRunnerHandlerConfig = { turnInterval };
const gameRunnerHandler = new handleGameRunner(gameInfo, config);
await gameRunnerHandler.init();
const gr: GameRunner = gameRunnerHandler.gr;

// Terrain background + gradient, shared by every render worker.
const heatmap = new heatmapCreator(
  gameRunnerHandler.mapLoader.getMapData(gameInfo[0].config.gameMap),
  gr.game,
  gameInfo[0].config.gameMapSize === GameMapSize.Compact,
);
const background = await heatmap.mapBackground();
if (!background) throw new Error("failed to load map background");

const tilesConquredHandler = new TileConqueredHandler(
  turnInterval,
  gr,
  totalTurns,
);

gameRunnerHandler.setHandlers([tilesConquredHandler.tickHandler], {
  players: {
    conquerTiles: [tilesConquredHandler.conqueredTile],
  },
});
gameRunnerHandler.start();
console.log(
  `Sim done: ${tilesConquredHandler.borderFrames.length} frames; rendering across cores...`,
);
const borderFrames: Int32Array[] = tilesConquredHandler.borderFrames;
const conquestFrames: Map<number, number>[] =
  tilesConquredHandler.conquestFrames;
fs.mkdirSync(outFolder, { recursive: true });
await createCombinedTimelapse({
  out: path.join(outFolder, `${gameID}.mp4`),
  width: gr.game.width(),
  height: gr.game.height(),
  background,
  gradient: heatmap.gradient,
  borderFrames,
  dataFrames: conquestFrames,
});
console.log("Done");
