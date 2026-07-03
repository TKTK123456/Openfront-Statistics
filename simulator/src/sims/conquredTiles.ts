import {
  GameUpdateViewData,
  ErrorUpdate,
} from "../../OpenFrontIO/src/core/game/GameUpdates";
import { GameRunner } from "../../OpenFrontIO/src/core/GameRunner";

export class TileConquredHandler {
  public turnInterval: number;
  public gr: GameRunner;
  public totalTurns: number;

  constructor(turnInterval: number, gr: GameRunner, totalTurns: number) {
    this.gr = gr;
    this.turnInterval = turnInterval;
    this.totalTurns = totalTurns;
  }

  conquredTilesTotal: Map<number, number> = new Map();
  conquredTilesShort: Map<number, number> = new Map();
  conquredTilesFullGame: Map<number, number>[] = [];
  conquredTilesMiddleShort: Map<number, number> = new Map();

  conquredTile(tile: number) {
    this.conquredTilesShort.set(
      tile,
      (this.conquredTilesShort.get(tile) ?? 0) + 1,
    );
    this.conquredTilesMiddleShort.set(
      tile,
      (this.conquredTilesMiddleShort.get(tile) ?? 0) + 1,
    );
    this.conquredTilesTotal.set(
      tile,
      (this.conquredTilesTotal.get(tile) ?? 0) + 1,
    );
  }

  tickHandler(g: GameUpdateViewData | ErrorUpdate, turnNum: number): void {
    if (
      (!this.gr.game.inSpawnPhase() &&
        (turnNum + this.turnInterval / 2 + 1) % this.turnInterval === 0) ||
      turnNum >= this.totalTurns - 1 ||
      this.gr.game.getWinner() !== null
    ) {
      let tempMap = new Map();
      for (let tile of this.conquredTilesMiddleShort.entries()) {
        tempMap.set(tile[0], tile[1]);
      }
      this.conquredTilesFullGame.push(tempMap);
      this.conquredTilesMiddleShort.clear();
    }
    if (
      (this.gr.game.inSpawnPhase() ||
        (turnNum + 1) % this.turnInterval !== 0) &&
      turnNum < this.totalTurns - 1 &&
      this.gr.game.getWinner() == null
    )
      return;
    console.log(turnNum + 1 + "/" + this.totalTurns);
    let tempMap = new Map();
    for (let tile of this.conquredTilesShort.entries()) {
      tempMap.set(tile[0], tile[1]);
    }
    this.conquredTilesFullGame.push(tempMap);
    this.conquredTilesShort.clear();
  }
}
