import {
  GameUpdateViewData,
  ErrorUpdate,
} from "../../OpenFrontIO/src/core/game/GameUpdates";
import { GameRunner } from "../../OpenFrontIO/src/core/GameRunner";

export class TileConqueredHandler {
  public turnInterval: number;
  public gr: GameRunner;
  public totalTurns: number;

  constructor(turnInterval: number, gr: GameRunner, totalTurns: number) {
    this.gr = gr;
    this.turnInterval = turnInterval;
    this.totalTurns = totalTurns;
  }

  conqueredTilesTotal: Map<number, number> = new Map();
  conqueredTilesShort: Map<number, number> = new Map();
  conqueredTilesFullGame: Map<number, number>[] = [];
  conqueredTilesMiddleShort: Map<number, number> = new Map();

  conqueredTile = (tile: number) => {
    this.conqueredTilesShort.set(
      tile,
      (this.conqueredTilesShort.get(tile) ?? 0) + 1,
    );
    this.conqueredTilesMiddleShort.set(
      tile,
      (this.conqueredTilesMiddleShort.get(tile) ?? 0) + 1,
    );
    this.conqueredTilesTotal.set(
      tile,
      (this.conqueredTilesTotal.get(tile) ?? 0) + 1,
    );
  };

  tickHandler = (g: GameUpdateViewData | ErrorUpdate, turnNum: number) => {
    if (
      (!this.gr.game.inSpawnPhase() &&
        (turnNum + this.turnInterval / 2 + 1) % this.turnInterval === 0) ||
      turnNum >= this.totalTurns - 1 ||
      this.gr.game.getWinner() !== null
    ) {
      let tempMap = new Map();
      for (let tile of this.conqueredTilesMiddleShort.entries()) {
        tempMap.set(tile[0], tile[1]);
      }
      this.conqueredTilesFullGame.push(tempMap);
      this.conqueredTilesMiddleShort.clear();
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
    for (let tile of this.conqueredTilesShort.entries()) {
      tempMap.set(tile[0], tile[1]);
    }
    this.conqueredTilesFullGame.push(tempMap);
    this.conqueredTilesShort.clear();
  };
}
