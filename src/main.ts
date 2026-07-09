import { GameRunner } from "../OpenFrontIO/src/core/GameRunner";
import path from "path";
import fs from "fs";
import { fileURLToPath } from "url";
import { fetchGame } from "./util/util";
import {
  Config,
  handleGameRunner,
} from "./GameRunnerHandler/gameRunnerHandler";
import { heatmapCreator } from "./visualization/heatmap";
import { createCombinedTimelapse } from "./visualization/timelapse";
import { GameMapSize } from "../OpenFrontIO/src/core/game/Game";

const outFolder = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  `../out`,
);
const gameID = process.argv[2] ?? "kgQ2yuYJ";
// Turns condensed into each frame; played back at 30fps.
const turnInterval = 3;

const gameInfo = await fetchGame(gameID);
if (gameInfo[0] === undefined) throw new Error(`could not load game ${gameID}`);
const totalTurns = gameInfo[1].length;

const config: Config = { turnInterval };
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

// Conquest tally for the current window, reset each frame. Kept local so this
// entry point stays independent of the other visualizations' handlers.
const conquestWindow = new Map<number, number>();
gameRunnerHandler.setHandlers([], {
  players: {
    conquerTiles: [
      (tile: number) =>
        conquestWindow.set(tile, (conquestWindow.get(tile) ?? 0) + 1),
    ],
  },
});

// Drive the (sequential) sim. At each frame boundary snapshot the conquest
// window and the current country outlines together, so they stay aligned.
const conquestFrames: Map<number, number>[] = [];
const borderFrames: Int32Array[] = [];
let done = false;
while (!done && gameRunnerHandler.turnNum < totalTurns) {
  done = gameRunnerHandler.tick();
  const turnNum = gameRunnerHandler.turnNum;
  if (gr.game.inSpawnPhase()) continue;
  if (turnNum % turnInterval === 0 || done || turnNum >= totalTurns) {
    conquestFrames.push(new Map(conquestWindow));
    conquestWindow.clear();
    const border: number[] = [];
    for (const p of gr.game.players()) {
      for (const t of p.borderTiles()) border.push(t);
    }
    borderFrames.push(Int32Array.from(border));
    if (borderFrames.length % 100 === 0) {
      console.log(
        `captured frame ${borderFrames.length} (turn ${turnNum}/${totalTurns})`,
      );
    }
  }
}
console.log(
  `Sim done: ${borderFrames.length} frames; rendering across cores...`,
);

fs.mkdirSync(outFolder, { recursive: true });
await createCombinedTimelapse({
  outPath: path.join(outFolder, `${gameID}.mp4`),
  width: gr.game.width(),
  height: gr.game.height(),
  background,
  gradient: heatmap.gradient,
  borderFrames,
  conquestFrames,
});
console.log("Done");
