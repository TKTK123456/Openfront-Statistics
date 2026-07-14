import { GameRunner } from "../OpenFrontIO/src/core/GameRunner";
import path from "path";
import { fileURLToPath } from "url";
import { TileConqueredHandler } from "./handlers/conqueredTiles";
import { fetchGame } from "./util/util";
import {
  gameRunnerHandlerConfig,
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
import { WarshipHandler } from "./handlers/warship";
import { piratingHeatmap } from "./visualization/warship";
import { GameStartInfo, Turn } from "../OpenFrontIO/src/core/Schemas";
const startTime = Date.now();
const HANDLER_NAMES = ["tilesConquered", "tradeShipRoutes", "pirating", "all"];
type HandlerName = (typeof HANDLER_NAMES)[number];
class Handlers {
  public turnInterval: number;
  public gr: GameRunner;
  public totalTurns: number;
  public gameRunnerHandler: handleGameRunner;
  public gameInfo: [GameStartInfo | undefined, Turn[]];
  public outFolder: string;
  constructor(
    handlerNames: (string | boolean)[],
    turnInterval: number,
    gr: GameRunner,
    totalTurns: number,
    gameRunnerHandler: handleGameRunner,
    gameInfo: [GameStartInfo | undefined, Turn[]],
    outFolder: string,
  ) {
    if (
      !handlerNames.every(
        (name): name is HandlerName =>
          typeof name === "string" && name in this.handlerInits,
      )
    ) {
      throw new Error("All handler names must be strings");
    }
    this.turnInterval = turnInterval;
    this.gr = gr;
    this.totalTurns = totalTurns;
    this.handlerNames = handlerNames;
    this.gameRunnerHandler = gameRunnerHandler;
    this.gameInfo = gameInfo;
    this.outFolder = outFolder;
  }
  public handlerNames: HandlerName[];
  public allHandlers = {} as {
    tilesConquered: TileConqueredHandler;
    tradeShip: TradeShipHandler;
    warships: WarshipHandler;
  };

  public allTickHandlers: ((
    g: GameUpdateViewData | ErrorUpdate,
    turnNum: number,
  ) => void)[] = [];

  public otherHandlers: OtherHandlers = {
    players: {
      conquerTiles: [],
      unitCaptured: [],
    },
    executions: {
      tradeShip: [],
      tradeShipFinish: [],
    },
  };
  public handlerInits: Record<HandlerName, () => void> = {
    all: () => {
      const entries = Object.entries(this.handlerInits).filter(
        (k) => k[0] !== "all",
      );

      for (const [, func] of entries) {
        func();
      }
    },
    tilesConquered: () => {
      const allHandlers = this.allHandlers;
      const visualizations = this.visualizations;
      const otherHandlers = this.otherHandlers;
      allHandlers.tilesConquered = new TileConqueredHandler(
        this.turnInterval,
        this.gr,
        this.totalTurns,
      );
      this.allTickHandlers.push(allHandlers.tilesConquered.tickHandler);
      otherHandlers.players?.conquerTiles?.push(
        allHandlers.tilesConquered.conqueredTile,
      );
      visualizations.push(async () => {
        return await createTilesConquredHeatmap(
          allHandlers.tilesConquered,
          this.gr,
          this.gameInfo,
          this.gameRunnerHandler.mapLoader,
          this.outFolder,
        );
      });
    },
    tradeShipRoutes: () => {
      const allHandlers = this.allHandlers;
      const visualizations = this.visualizations;
      const otherHandlers = this.otherHandlers;
      allHandlers.tradeShip = new TradeShipHandler(
        this.turnInterval,
        this.gr,
        this.totalTurns,
      );
      otherHandlers.executions?.tradeShip?.push(
        allHandlers.tradeShip.tradeShipExecHandler,
      );
      otherHandlers.executions?.tradeShipFinish?.push(
        allHandlers.tradeShip.tradeShipFinishHandler,
      );
      visualizations.push(async () => {
        return await tradeShipRoutes(
          allHandlers.tradeShip,
          this.gr,
          this.gameInfo,
          this.gameRunnerHandler.mapLoader,
          this.outFolder,
        );
      });
    },
    pirating: () => {
      const allHandlers = this.allHandlers;
      const visualizations = this.visualizations;
      const otherHandlers = this.otherHandlers;
      allHandlers.warships ??= new WarshipHandler(
        this.turnInterval,
        this.gr,
        this.totalTurns,
      );
      otherHandlers.players?.unitCaptured?.push(
        allHandlers.warships.capturedTradeShip,
      );
      visualizations.push(async () => {
        return await piratingHeatmap(
          allHandlers.warships,
          this.gr,
          this.gameInfo,
          this.gameRunnerHandler.mapLoader,
          this.outFolder,
        );
      });
    },
  };
  public visualizations: Array<() => Promise<void>> = [];
  init = () => {
    for (const handlerName of this.handlerNames) {
      this.handlerInits[handlerName]();
    }
  };
}
function printHelp() {
  console.log(`
Usage:
  npm run analysis -- -i <gameId> [options]

Required:
  -i, --gameId <id>          Game ID to analyze

Options:
  -p, --turnInterval <ms>    Turns between samples (default: 100)
  -t, --handlers <handler>   Handler(s) to enable
                             Default: all
                             Can be specified multiple times
                             Options are: ${HANDLER_NAMES.slice(0, -1).join(", ")} and ${HANDLER_NAMES.at(-1)}
  -o, --out <folder>         Output folder (default: out)
  -h, --help                 Show this help message

Examples:
  npm run analysis -- -i kgQ2yuYJ
  npm run analysis -- -i kgQ2yuYJ -p 50
  npm run analysis -- -i kgQ2yuYJ -t all
  npm run analysis -- -i kgQ2yuYJ -o results
`);
}
const main = async () => {
  const options: ParseArgsOptionsConfig = {
    gameId: {
      type: "string",
      short: "i",
    },
    turnInterval: {
      type: "string",
      short: "p",
      default: "17",
    },
    handlers: {
      type: "string",
      multiple: true,
      short: "t",
      default: ["all"],
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

  let gr: GameRunner;
  const config: gameRunnerHandlerConfig = {
    turnInterval,
  };

  const gameRunnerHandler = new handleGameRunner(gameInfo, config);
  await gameRunnerHandler.init();
  gr = gameRunnerHandler.gr;
  const handlers = new Handlers(
    args.handlers,
    turnInterval,
    gr,
    totalTurns,
    gameRunnerHandler,
    gameInfo,
    outFolder,
  );
  handlers.init();
  gameRunnerHandler.setHandlers(
    handlers.allTickHandlers,
    handlers.otherHandlers,
  );
  gameRunnerHandler.start();
  await Promise.all(
    handlers.visualizations.map((visualization) => visualization()),
  );
};
try {
  await main();
  console.log(`Took ${Date.now() - startTime}ms`);
} catch (err) {
  console.error(err);
  printHelp();
  process.exit(1);
}
