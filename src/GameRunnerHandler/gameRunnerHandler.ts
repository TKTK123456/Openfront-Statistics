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
import { Unit } from "../../OpenFrontIO/src/core/game/Game";

let originalTradeShipTick: ((ticks: number) => void) | undefined = undefined;
let originalTradeShipComplete: (() => void) | undefined = undefined;

export interface OtherHandlers {
  players?: {
    conquerTiles?: ((tile: number) => void)[];
    unitCaptured?: ((target: Unit) => void)[];
  };
  executions?: {
    tradeShip?: ((self: TradeShipExecution) => void)[];
    tradeShipFinish?: ((self: TradeShipExecution) => void)[];
  };
}

export interface gameRunnerHandlerConfig {
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
  public config: gameRunnerHandlerConfig;
  private updateHandler: (g: GameUpdateViewData | ErrorUpdate) => void = (
    g: GameUpdateViewData | ErrorUpdate,
  ) => {
    if (
      (this.gr.game.inSpawnPhase() ||
        (this.turnNum + 1) % this.config.turnInterval !== 0) &&
      this.turnNum < this.totalTurns - 1 &&
      this.gr.game.getWinner() == null
    )
      return;
    console.log(this.turnNum + 1 + "/" + this.totalTurns);
    for (const handler of this.updateHandlers) {
      handler(g, this.turnNum);
    }
  };
  private otherHandlers: OtherHandlers | undefined;
  private initializedHandlers: { players: boolean } = { players: false };
  public totalTurns: number;
  constructor(
    gameInfo: [GameStartInfo | undefined, Turn[]],
    config: gameRunnerHandlerConfig,
  ) {
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
  private cleanupHandlers: (() => void)[] = [];
  setHandlers(
    updateHandlers: ((
      g: GameUpdateViewData | ErrorUpdate,
      turnNum: number,
    ) => void)[],
    otherHandlers?: OtherHandlers,
  ) {
    this.otherHandlers = otherHandlers;

    if (otherHandlers?.executions?.tradeShip) {
      const oldTick = TradeShipExecution.prototype.tick;
      const tradeShip = otherHandlers.executions.tradeShip;

      TradeShipExecution.prototype.tick = function (ticks: number) {
        for (const handler of tradeShip) {
          handler(this);
        }
        return oldTick.call(this, ticks);
      };

      this.cleanupHandlers.push(() => {
        TradeShipExecution.prototype.tick = oldTick;
      });
    }

    if (otherHandlers?.executions?.tradeShipFinish) {
      const proto = TradeShipExecution.prototype as any;
      const oldComplete = proto.complete;
      const finish = otherHandlers.executions.tradeShipFinish;

      proto.complete = function () {
        for (const handler of finish) {
          handler(this);
        }

        return oldComplete.call(this);
      };

      this.cleanupHandlers.push(() => {
        proto.complete = oldComplete;
      });
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
          const oldConquer = p.conquer;
          this.cleanupHandlers.push(() => {
            p.conquer = oldConquer;
          });
          p.conquer = (tile: number) => {
            for (const handler of conqueredTileHandlers) {
              handler(tile);
            }
            return oldConquer.call(p, tile);
          };
        });
      }
      const unitCapturedHandlers = this.otherHandlers?.players?.unitCaptured;
      if (unitCapturedHandlers && unitCapturedHandlers.length > 0) {
        gr.game.allPlayers().forEach((p) => {
          const oldCapture = p.captureUnit;
          this.cleanupHandlers.push(() => {
            p.captureUnit = oldCapture;
          });
          p.captureUnit = (target: Unit) => {
            for (const handler of unitCapturedHandlers) {
              handler(target);
            }
            return oldCapture.call(p, target);
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
    try {
      for (let i = 0; i < this.totalTurns; i++) {
        if (this.tick()) break;
      }
    } finally {
      for (const cleanup of this.cleanupHandlers) {
        cleanup();
      }
    }
  }
}
