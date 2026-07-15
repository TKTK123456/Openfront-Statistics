import { fetchGame } from "src/util/util";
import {
  gameRunnerHandlerConfig,
  handleGameRunner,
  OtherHandlers,
} from "../GameRunnerHandler/gameRunnerHandler";

import { TileConqueredHandler } from "../handlers/conqueredTiles";
import { TradeShipHandler } from "../handlers/tradeShip";
import { WarshipHandler } from "../handlers/warship";

import { GameRunner } from "../../OpenFrontIO/src/core/GameRunner";
import { heatmapCreator } from "src/visualization/heatmap";
import { GameMapSize } from "../../OpenFrontIO/src/core/game/Game";
import path from "path";
import { fileURLToPath } from "url";
export async function simGame(gameID: string) {
  const GRHC: gameRunnerHandlerConfig = { turnInterval: 17 };
  const gameInfo = await fetchGame(gameID);
  if (gameInfo[0] === undefined)
    throw new Error(`could not load game ${gameID}`);
  const totalTurns = gameInfo[1].length;
  const gameRunnerHandler = new handleGameRunner(gameInfo, GRHC);
  await gameRunnerHandler.init();
  const gr: GameRunner = gameRunnerHandler.gr;
  const handlers: {
    tileConqueredHandler: TileConqueredHandler;
    tradeShipHandler: TradeShipHandler;
    warshipHandler: WarshipHandler;
  } = {
    tileConqueredHandler: new TileConqueredHandler(
      GRHC.turnInterval,
      gr,
      totalTurns,
    ),
    tradeShipHandler: new TradeShipHandler(GRHC.turnInterval, gr, totalTurns),
    warshipHandler: new WarshipHandler(GRHC.turnInterval, gr, totalTurns),
  };
  const otherHandlers: OtherHandlers = {
    players: {
      conquerTiles: [handlers.tileConqueredHandler.conqueredTile],
      unitCaptured: [handlers.warshipHandler.capturedTradeShip],
    },
    executions: {
      tradeShip: [handlers.tradeShipHandler.tradeShipExecHandler],
      tradeShipFinish: [handlers.tradeShipHandler.tradeShipFinishHandler],
    },
  };
  gameRunnerHandler.setHandlers(
    [handlers.tileConqueredHandler.tickHandler],
    otherHandlers,
  );
  gameRunnerHandler.start();
  return {
    gr,
    gameInfo,
    mapLoader: gameRunnerHandler.mapLoader,
    tileConqueredHandler: handlers.tileConqueredHandler,
    tradeShipHandler: handlers.tradeShipHandler,
    warshipHandler: handlers.warshipHandler,
  };
}
