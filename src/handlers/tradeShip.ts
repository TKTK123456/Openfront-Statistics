import { GameRunner } from "../../OpenFrontIO/src/core/GameRunner";
import { TradeShipExecution } from "../../OpenFrontIO/src/core/execution/TradeShipExecution";
import { TileRef } from "../../OpenFrontIO/src/core/game/GameMap";
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

  public allRoutes: Map<string, number> = new Map();
  private currentSection: Map<string, number> = new Map();
  public allSections: Map<string, number>[] = [];
  private trackingRoutes: Map<number, TileRef[]> = new Map();

  tradeShipExecHandler = (self: TradeShipExecution) => {
    const tradeship = self["tradeShip"];
    if (!tradeship) return;
    const id = tradeship.id();
    let route = this.trackingRoutes.get(id);
    if (!route) {
      route = [];
      this.trackingRoutes.set(id, route);
    }
    route.push(tradeship.tile());
  };

  tradeShipFinishHandler = (self: TradeShipExecution) => {
    const tradeship = self["tradeShip"];
    if (!tradeship) return;
    const id = tradeship.id();
    const route = this.trackingRoutes.get(id) ?? [];
    const key = route.join(",");
    this.allRoutes.set(key, (this.allRoutes.get(key) ?? 0) + 1);
    this.currentSection.set(key, (this.currentSection.get(key) ?? 0) + 1);
    this.trackingRoutes.delete(id);
  };

  tickHandler = (g: GameUpdateViewData | ErrorUpdate, turnNum: number) => {
    if (
      (turnNum + 1) % (this.turnInterval * 6) === 0 ||
      this.gr.game.getWinner() !== null
    ) {
      this.allSections.push(this.currentSection);
      this.currentSection = new Map();
    }
  };
}
