import { GameRunner } from "../OpenFrontIO/src/core/GameRunner";
import path from "path";
import { fileURLToPath } from "url";
import { TileConquredHandler } from "./sims/conqueredTiles";
import { fetchGame, gameMapLoader } from "./util/util";
import { handleGameRunner } from "./GameRunnerHandler/gameRunnerHandler";
import { createVisualization } from "./visualization/tilesConqured";

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

const gameInfo = await fetchGame(gameID);
const totalTurns = gameInfo[1].length;

let gr: GameRunner;

let tileConquredHandler: TileConquredHandler;

const gameRunnerHandler = new handleGameRunner(gameInfo);
await gameRunnerHandler.init();
gr = gameRunnerHandler.gr;
tileConquredHandler = new TileConquredHandler(turnInterval, gr, totalTurns);
gameRunnerHandler.setHandlers([tileConquredHandler.tickHandler], {
  players: {
    conquerTiles: [tileConquredHandler.conqueredTile],
  },
});
gameRunnerHandler.start()
createVisualization(
  tileConquredHandler,
  gr,
  gameInfo,
  gameRunnerHandler.mapLoader,
  outFolder,
);
