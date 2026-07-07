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
import { TradeShipExecution } from "../OpenFrontIO/src/core/execution/TradeShipExecution";
import { TradeShipHandler } from "./handlers/tradeShip";
import { tradeShipRoutes } from "./visualization/tradeShip";

let outFolder = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  `../out`,
);
const gameID = "mW2bSxT1";
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
