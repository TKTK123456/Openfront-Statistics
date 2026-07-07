import { GameRunner } from "../OpenFrontIO/src/core/GameRunner";
import path from "path";
import { fileURLToPath } from "url";
import { TileConqueredHandler } from "./handlers/conqueredTiles";
import { fetchGame } from "./util/util";
import {
  Config,
  handleGameRunner,
} from "./GameRunnerHandler/gameRunnerHandler";
import { createTilesConquredHeatmap } from "./visualization/tilesConqured";

let outFolder = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  `../out`,
);
const gameID = "kgQ2yuYJ";
const turnInterval = 100;

const gameInfo = await fetchGame(gameID);
const totalTurns = gameInfo[1].length;

let gr: GameRunner;

let tileConqueredHandler: TileConqueredHandler;

const config: Config = {
  turnInterval,
};

const gameRunnerHandler = new handleGameRunner(gameInfo, config);
await gameRunnerHandler.init();
gr = gameRunnerHandler.gr;
tileConqueredHandler = new TileConqueredHandler(turnInterval, gr, totalTurns);
gameRunnerHandler.setHandlers([tileConqueredHandler.tickHandler], {
  players: {
    conquerTiles: [tileConqueredHandler.conqueredTile],
  },
});
gameRunnerHandler.start();
createTilesConquredHeatmap(
  tileConqueredHandler,
  gr,
  gameInfo,
  gameRunnerHandler.mapLoader,
  outFolder,
);
