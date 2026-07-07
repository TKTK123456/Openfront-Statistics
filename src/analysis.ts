import { GameRunner } from "../OpenFrontIO/src/core/GameRunner";
import path from "path";
import { fileURLToPath } from "url";
import { TileConqueredHandler } from "./handlers/conqueredTiles";
import { fetchGame } from "./util/util";
import {
  Config,
  handleGameRunner,
  OtherHandlers,
} from "./GameRunnerHandler/gameRunnerHandler";
import { createTilesConquredHeatmap } from "./visualization/tilesConqured";
import process from "process";
import { parseArgs, ParseArgsOptionsConfig } from "util";
import {
  GameUpdateViewData,
  ErrorUpdate,
} from "../OpenFrontIO/src/core/game/GameUpdates";
import { TradeShipHandler } from "./handlers/tradeShip";
import { tradeShipRoutes } from "./visualization/tradeShip";

const options: ParseArgsOptionsConfig = {
  gameId: {
    type: "string",
    short: "i",
  },
  turnInterval: {
    type: "string",
    short: "p",
    default: "100",
  },
  handlers: {
    type: "string",
    multiple: true,
    short: "t",
    default: ["tilesConquered"],
  },
  out: {
    type: "string",
    short: "o",
    default: "out",
  },
  help: {
    type: "boolean",
    short: "h",
    default: false,
  },
};
function printHelp() {
  console.log(`
Usage:
  npm run analysis -- -i <gameId> [options]

Required:
  -i, --gameId <id>          Game ID to analyze

Options:
  -p, --turnInterval <ms>    Turns between samples (default: 100)
  -t, --handlers <handler>   Handler(s) to enable
                             Default: tilesConquered
                             Can be specified multiple times:
                               -t tilesConquered -t tradeShipRoutes
  -o, --out <folder>         Output folder (default: out)
  -h, --help                 Show this help message

Examples:
  npm run analysis -- -i kgQ2yuYJ
  npm run analysis -- -i kgQ2yuYJ -p 50
  npm run analysis -- -i kgQ2yuYJ -t tilesConquered
  npm run analysis -- -i kgQ2yuYJ -o results
`);
}
const args = parseArgs({ options, args: process.argv.slice(2) }).values;
if (args.help) {
  printHelp();
  process.exit(0);
}
if (
  args.gameId === undefined ||
  args.turnInterval === undefined ||
  args.handlers === undefined ||
  args.out === undefined ||
  typeof args.gameId !== "string" ||
  typeof args.turnInterval !== "string" ||
  !Array.isArray(args.handlers) ||
  typeof args.out !== "string"
) {
  printHelp();
  process.exit(1);
}
let outFolder = path.join(process.cwd(), args.out);
const gameID = args.gameId;
const turnInterval = parseInt(args.turnInterval);

const gameInfo = await fetchGame(gameID);
const totalTurns = gameInfo[1].length;

class Handlers {
  constructor(handlerNames: (string | boolean)[]) {
    if (
      !handlerNames.every((name): name is string => typeof name === "string")
    ) {
      throw new Error("All handler names must be strings");
    }

    this.handlerNames = handlerNames;
  }
  public handlerNames: string[];
  public allHandlers = {} as {
    tilesConquered: TileConqueredHandler;
    tradeShip: TradeShipHandler;
  };

  public allTickHandlers: ((
    g: GameUpdateViewData | ErrorUpdate,
    turnNum: number,
  ) => void)[] = [];

  public otherHandlers: OtherHandlers = {
    players: {
      conquerTiles: [],
    },
    executions: {
      tradeShip: [],
      tradeShipFinish: [],
    },
  };

  public visulizations: (() => void)[] = [];
  init = () => {
    for (const handlerName of this.handlerNames) {
      switch (handlerName) {
        case "tilesConquered":
          this.allHandlers.tilesConquered = new TileConqueredHandler(
            turnInterval,
            gr,
            totalTurns,
          );
          this.allTickHandlers.push(
            this.allHandlers.tilesConquered.tickHandler,
          );
          this.otherHandlers.players?.conquerTiles?.push(
            this.allHandlers.tilesConquered.conqueredTile,
          );
          this.visulizations.push(() => {
            createTilesConquredHeatmap(
              this.allHandlers.tilesConquered,
              gr,
              gameInfo,
              gameRunnerHandler.mapLoader,
              outFolder,
            );
          });
          break;
        case "tradeShipRoutes":
          this.allHandlers.tradeShip = new TradeShipHandler(
            turnInterval,
            gr,
            totalTurns,
          );
          this.otherHandlers.executions?.tradeShip?.push(
            this.allHandlers.tradeShip.tradeShipExecHandler,
          );
          this.otherHandlers.executions?.tradeShipFinish?.push(
            this.allHandlers.tradeShip.tradeShipFinishHandler,
          );
          this.visulizations.push(() => {
            tradeShipRoutes(
              this.allHandlers.tradeShip,
              gr,
              gameInfo,
              gameRunnerHandler.mapLoader,
              outFolder,
            );
          });
      }
    }
  };
}

let gr: GameRunner;
const handlers = new Handlers(args.handlers);

const config: Config = {
  turnInterval,
};

const gameRunnerHandler = new handleGameRunner(gameInfo, config);
await gameRunnerHandler.init();
gr = gameRunnerHandler.gr;
handlers.init();
gameRunnerHandler.setHandlers(handlers.allTickHandlers, handlers.otherHandlers);
gameRunnerHandler.start();
for (const visualization of handlers.visulizations) {
  visualization();
}
