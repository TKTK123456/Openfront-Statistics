import { GameRunner } from "../../OpenFrontIO/src/core/GameRunner";
import { TradeShipExecution } from "../../OpenFrontIO/src/core/execution/TradeShipExecution";
import {
  GameUpdateViewData,
  ErrorUpdate,
} from "../../OpenFrontIO/src/core/game/GameUpdates";

export class TradeShipHandler {
  public turnInterval: number;
  public gr: GameRunner;
  public totalTurns: number;

  constructor(turnInterval: number, gr: GameRunner, totalTurns: number) {
    this.gr = gr;
    this.turnInterval = turnInterval;
    this.totalTurns = totalTurns;
  }

  tickHandler = (g: GameUpdateViewData | ErrorUpdate, turnNum: number) => {};
}
