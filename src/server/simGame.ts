import { fetchGame } from "src/shared/util";
import {
  gameRunnerHandlerConfig,
  handleGameRunner,
  OtherHandlers,
} from "../GameRunnerHandler/gameRunnerHandler";

import { TileConqueredHandler } from "../handlers/conqueredTiles";
import { TradeShipHandler } from "../handlers/tradeShip";
import { WarshipHandler } from "../handlers/warship";

import { GameRunner } from "../../OpenFrontIO/src/core/GameRunner";

export async function simGame(
  gameID: string,
  sendProgress?: (value: number) => void,
) {
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
  const tickHandlers = [
    handlers.tileConqueredHandler.tickHandler,
    handlers.tradeShipHandler.tickHandler,
  ];
  if (sendProgress !== undefined) {
    tickHandlers.push((g, turnNum: number) => {
      sendProgress((turnNum / totalTurns) * 100);
    });
  }
  gameRunnerHandler.setHandlers(tickHandlers, otherHandlers);
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
