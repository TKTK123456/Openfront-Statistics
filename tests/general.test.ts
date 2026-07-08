import { GameRunner } from "../OpenFrontIO/src/core/GameRunner";
import path from "path";
import { fileURLToPath } from "url";
import { TileConqueredHandler } from "../src/handlers/conqueredTiles";
import { fetchGame } from "../src/util/util";
import {
  Config,
  handleGameRunner,
} from "../src/GameRunnerHandler/gameRunnerHandler";
import { createTilesConquredHeatmap } from "../src/visualization/tilesConqured";
import { TradeShipExecution } from "../OpenFrontIO/src/core/execution/TradeShipExecution";
import { TradeShipHandler } from "../src/handlers/tradeShip";
import { tradeShipRoutes } from "../src/visualization/tradeShip";

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
const tradeShipHandler = new TradeShipHandler(turnInterval, gr, totalTurns);
//tileConqueredHandler = new TileConqueredHandler(turnInterval, gr, totalTurns);
gameRunnerHandler.setHandlers([tradeShipHandler.tickHandler], {
  /*players: {
    conquerTiles: [tileConqueredHandler.conqueredTile],
  },*/
  executions: {
    tradeShip: [tradeShipHandler.tradeShipExecHandler],
    tradeShipFinish: [tradeShipHandler.tradeShipFinishHandler],
  },
});
gameRunnerHandler.start();
tradeShipRoutes(
  tradeShipHandler,
  gr,
  gameInfo,
  gameRunnerHandler.mapLoader,
  outFolder,
);
