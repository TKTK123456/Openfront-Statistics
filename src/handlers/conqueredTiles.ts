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
  conquestWindow: Map<number, number> = new Map();
  conquestFrames: Map<number, number>[] = [];
  borderFrames: Int32Array[] = [];
  borderOwner: string[][] = [];

  conqueredTile = (tile: number) => {
    this.conquestWindow.set(tile, (this.conquestWindow.get(tile) ?? 0) + 1);
    this.conqueredTilesTotal.set(
      tile,
      (this.conqueredTilesTotal.get(tile) ?? 0) + 1,
    );
  };

  tickHandler = (g: GameUpdateViewData | ErrorUpdate, turnNum: number) => {
    this.conquestFrames.push(new Map(this.conquestWindow));
    this.conquestWindow.clear();
    const border: number[] = [];
    const owner: string[] = [];
    for (const p of this.gr.game.players()) {
      const id = p.id();
      for (const t of p.borderTiles()) {
        owner.push(id);
        border.push(t);
      }
    }
    this.borderFrames.push(Int32Array.from(border));
    this.borderOwner.push(owner);
  };
}
