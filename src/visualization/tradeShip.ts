import { TradeShipHandler } from "src/handlers/tradeShip";
import { gameMapLoader } from "src/util/util";
import { GameRunner } from "../../OpenFrontIO/src/core/GameRunner";
import { GameStartInfo, Turn } from "../../OpenFrontIO/src/core/Schemas";
import { Gradient, heatmapCreator } from "./heatmap";
import fs from "fs";
import { GameMapSize } from "../../OpenFrontIO/src/core/game/Game";
import path from "path";
import { PNG } from "pngjs";
import { createCombinedTimelapse } from "./timelapse";
import { interpolateFrames } from "src/shared/util/util";

interface tradeRouteTimelapseOut {
  routeFrames?: Map<number, number>[];
  background?: Uint8ClampedArray;
  gradient?: Gradient;
}
let heatmapMaker: heatmapCreator;

function routesToTileFrequency(
  routes: Map<string, number>,
  tileFrequency: Map<number, number>,
) {
  const routesObject = Array.from(routes, ([key, amount]) => ({
    route: key.split(",").map(Number),
    amount,
  }));
  routesObject.forEach((r) =>
    r.route.forEach((tile) => {
      tileFrequency.set(tile, (tileFrequency.get(tile) ?? 0) + r.amount);
    }),
  );
}

export async function tradeShipRoutes(
  tradeShipExecHandler: TradeShipHandler,
  gr: GameRunner,
  gameInfo: [GameStartInfo | undefined, Turn[]],
  mapLoader: gameMapLoader,
  outFolder: string,
  options: { createFile?: boolean; newHeatmapCreator?: boolean } = {
    createFile: true,
    newHeatmapCreator: false,
  },
  fileName: string = `trade-ship-${gameInfo[0]?.gameID}`,
) {
  if (gameInfo[0] === undefined) return;
  const gameID = gameInfo[0].gameID;
  if (options.createFile === undefined) {
    options.createFile = true;
  }
  if (options.newHeatmapCreator === undefined) {
    options.newHeatmapCreator = false;
  }
  const map = mapLoader.getMapData(gameInfo[0].config.gameMap);
  fileName = path.join(outFolder, `${fileName}.png`);
  if (!heatmapMaker || options.newHeatmapCreator)
    heatmapMaker = new heatmapCreator(
      map,
      gr.game,
      gameInfo[0].config.gameMapSize === GameMapSize.Compact,
    );
  let tileFrequency: Map<number, number> = new Map();
  routesToTileFrequency(tradeShipExecHandler.allRoutes, tileFrequency);
  const heatmapData = await heatmapMaker.create(tileFrequency);
  if (heatmapData) {
    if (options.createFile) {
      const png = new PNG({
        width: gr.game.width(),
        height: gr.game.height(),
      });
      png.data.set(heatmapData);

      await new Promise<void>((resolve, reject) => {
        if (fileName)
          png
            .pack()
            .pipe(fs.createWriteStream(fileName))
            .on("finish", () => resolve())
            .on("error", reject);
      });
    } else return heatmapData;
  }
}

export async function tradeShipRoutesThroughTime(
  tradeShipExecHandler: TradeShipHandler,
  gr: GameRunner,
  gameInfo: [GameStartInfo | undefined, Turn[]],
  mapLoader: gameMapLoader,
  outFolder: string,
  options: { createFile?: boolean; newHeatmapCreator?: boolean } = {
    createFile: true,
    newHeatmapCreator: false,
  },
  fileName: string = `trade-ship-${gameInfo[0]?.gameID}`,
) {
  if (gameInfo[0] === undefined) return;
  const gameID = gameInfo[0].gameID;
  if (options.createFile === undefined) {
    options.createFile = true;
  }
  if (options.newHeatmapCreator === undefined) {
    options.newHeatmapCreator = false;
  }
  const map = mapLoader.getMapData(gameInfo[0].config.gameMap);
  fileName = path.join(outFolder, `${fileName}.mp4`);
  if (!heatmapMaker || options.newHeatmapCreator)
    heatmapMaker = new heatmapCreator(
      map,
      gr.game,
      gameInfo[0].config.gameMapSize === GameMapSize.Compact,
    );
  const routeFrames: Map<number, number>[] = [];
  for (let i = 0; i < tradeShipExecHandler.allSections.length; i++) {
    let tileFrequency: Map<number, number> = new Map();
    routesToTileFrequency(tradeShipExecHandler.allSections[i], tileFrequency);
    routeFrames.push(tileFrequency);
  }
  const background = await heatmapMaker.mapBackground();
  if (!background) throw new Error("failed to load map background");
  const output: tradeRouteTimelapseOut = {};
  if (options.createFile) {
    const dataFrames = interpolateFrames(routeFrames, 6);
    const outPath: string = fileName;
    await createCombinedTimelapse({
      out: outPath,
      width: gr.game.width(),
      height: gr.game.height(),
      background,
      gradient: heatmapMaker.gradient,
      borderFrames: null,
      dataFrames,
    });
  } else {
    output.background = background;
    output.gradient = heatmapMaker.gradient;
    output.routeFrames = routeFrames;
    return output;
  }
}
