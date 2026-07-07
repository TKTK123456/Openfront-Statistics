import path from "path";
import { fileURLToPath } from "url";
import { GameStartInfo, Turn } from "../../OpenFrontIO/src/core/Schemas";
import { gameMapLoader, PROJECT_ROOT } from "../util/util";
import {
  createGameRunner,
  GameRunner,
} from "../../OpenFrontIO/src/core/GameRunner";
import {
  GameUpdateViewData,
  ErrorUpdate,
} from "../../OpenFrontIO/src/core/game/GameUpdates";
import { TradeShipExecution } from "../../OpenFrontIO/src/core/execution/TradeShipExecution";

export interface OtherHandlers {
  players?: {
    conquerTiles?: ((tile: number) => void)[];
  };
  executions?: {
    tradeShip: ((self: TradeShipExecution) => void)[];
    tradeShipFinish: ((self: TradeShipExecution) => void)[];
  };
}

export interface Config {
  turnInterval: number;
}

export class handleGameRunner {
  public gameConfig: GameStartInfo;
  public turns: Turn[];
  public mapLoader = new gameMapLoader(
    path.join(PROJECT_ROOT, "/resources/maps"),
  );
  public gr: GameRunner;
  public turnNum: number;
  public updateHandlers: ((
    g: GameUpdateViewData | ErrorUpdate,
    turnNum: number,
  ) => void)[];
  public config: Config;
  private updateHandler: (g: GameUpdateViewData | ErrorUpdate) => void = (
    g: GameUpdateViewData | ErrorUpdate,
  ) => {
    if (
      (!this.gr.game.inSpawnPhase() &&
        (this.turnNum + 1) % this.config.turnInterval === 0) ||
      (this.turnNum >= this.totalTurns - 1 && this.gr.game.getWinner() == null)
    )
      console.log(this.turnNum + 1 + "/" + this.totalTurns);
    for (const handler of this.updateHandlers) {
      handler(g, this.turnNum);
    }
  };
  private otherHandlers: OtherHandlers | undefined;
  private initializedHandlers: { players: boolean } = { players: false };
  public totalTurns: number;
  constructor(gameInfo: [GameStartInfo | undefined, Turn[]], config: Config) {
    if (gameInfo[0] === undefined) return;
    this.gameConfig = gameInfo[0];
    this.turns = gameInfo[1];
    this.totalTurns = this.turns.length;
    this.config = config;
  }
  async init() {
    const gameRunner = createGameRunner(
      this.gameConfig,
      undefined,
      this.mapLoader,
      this.updateHandler,
    );
    this.gr = await gameRunner;
    this.turnNum = 0;
  }
  setHandlers(
    updateHandlers: ((
      g: GameUpdateViewData | ErrorUpdate,
      turnNum: number,
    ) => void)[],
    otherHandlers?: OtherHandlers,
  ) {
    this.otherHandlers = otherHandlers;
    if (otherHandlers?.players === undefined) {
      this.initializedHandlers.players = true;
    }
    if (otherHandlers?.executions?.tradeShip !== undefined) {
      const oldTick = TradeShipExecution.prototype.tick;
      const tradeShip = otherHandlers.executions.tradeShip;
      TradeShipExecution.prototype.tick = function (ticks: number) {
        for (const handler of tradeShip) {
          handler(this);
        }
        return oldTick.call(this, ticks);
      };
    }
    if (otherHandlers?.executions?.tradeShipFinish !== undefined) {
      const finish = otherHandlers.executions.tradeShipFinish;
      const proto = TradeShipExecution.prototype as any;

      const oldFinish = proto.complete;

      proto.complete = function () {
        for (const handler of finish) {
          handler(this);
        }

        return oldFinish.call(this);
      };
    }
    this.updateHandlers = updateHandlers;
  }
  tick() {
    const gr = this.gr;
    if (!this.initializedHandlers.players && !gr.game.inSpawnPhase()) {
      this.initializedHandlers.players = true;
      const conqueredTileHandlers = this.otherHandlers?.players?.conquerTiles;
      if (conqueredTileHandlers && conqueredTileHandlers.length > 0) {
        gr.game.allPlayers().forEach((p) => {
          const oldConquer = p.conquer.bind(p);
          p.conquer = (tile: number) => {
            for (const handler of conqueredTileHandlers) {
              handler(tile);
            }
            return oldConquer(tile);
          };
        });
      }
    }
    gr.addTurn(this.turns[this.turnNum]);
    gr.executeNextTick();
    this.turnNum++;
    if (gr.game.getWinner() !== null) return true;
    return false;
  }
  start() {
    for (let i = 0; i < this.totalTurns; i++) {
      const isDone = this.tick();
      if (isDone) break;
    }
  }
}
