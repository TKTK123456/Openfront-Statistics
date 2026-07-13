import { Unit, UnitType } from "../../OpenFrontIO/src/core/game/Game";
import {
  GameUpdateViewData,
  ErrorUpdate,
} from "../../OpenFrontIO/src/core/game/GameUpdates";
import { GameRunner } from "../../OpenFrontIO/src/core/GameRunner";

export class WarshipHandler {
  public turnInterval: number;
  public gr: GameRunner;
  public totalTurns: number;

  constructor(turnInterval: number, gr: GameRunner, totalTurns: number) {
    this.gr = gr;
    this.turnInterval = turnInterval;
    this.totalTurns = totalTurns;
  }

  public capturedShipTiles: Map<number, number> = new Map();

  capturedTradeShip = (target: Unit) => {
    if (target.type() !== UnitType.TradeShip) return;
    const tile = target.tile();
    this.capturedShipTiles.set(
      tile,
      (this.capturedShipTiles.get(tile) ?? 0) + 1,
    );
  };

  tickHandler = (g: GameUpdateViewData | ErrorUpdate, turnNum: number) => {};
}
