import { TileConqueredHandler } from "src/handlers/conqueredTiles";
import { GameRunner } from "../../OpenFrontIO/src/core/GameRunner";
import path from "path";
import { GameStartInfo, Turn } from "../../OpenFrontIO/src/core/Schemas";
import { gameMapLoader } from "src/util/util";
import { PNG } from "pngjs";
import { GameMapSize } from "../../OpenFrontIO/src/core/game/Game";
import { Gradient, heatmapCreator } from "./heatmap";
import fs from "fs";
import { createCombinedTimelapse } from "./timelapse";

let heatmapMaker: heatmapCreator;
interface HeatmapOutput {
  fullGame?: Uint8ClampedArray;
  borderFrames?: Int32Array[];
  conquestFrames?: Map<number, number>[];
  background?: Uint8ClampedArray;
  gradient?: Gradient;
}
export async function createTilesConquredHeatmap(
  tileConqueredHandler: TileConqueredHandler,
  gr: GameRunner,
  gameInfo: [GameStartInfo | undefined, Turn[]],
  mapLoader: gameMapLoader,
  outFolder: string,
  options: {
    video?: boolean;
    fullGame?: boolean;
    createFiles?: boolean;
    newHeatmapCreator?: boolean;
  } = {
    video: true,
    fullGame: true,
    createFiles: true,
    newHeatmapCreator: false,
  },
  fileNames?: {
    video?: string;
    full?: string;
  },
) {
  if (gameInfo[0] === undefined) return;
  const gameID = gameInfo[0].gameID;
  if (options.video === undefined) {
    options.video = true;
  }
  if (options.fullGame === undefined) {
    options.fullGame = true;
  }
  if (options.createFiles === undefined) {
    options.createFiles = true;
  }

  if (options.newHeatmapCreator === undefined) {
    options.newHeatmapCreator = false;
  }
  if (fileNames === undefined) fileNames = {};
  if (fileNames.video === undefined)
    fileNames.video = "conqured-tiles-" + gameID;
  if (fileNames.full === undefined) fileNames.full = "conqured-tiles-" + gameID;
  const map = mapLoader.getMapData(gameInfo[0].config.gameMap);
  if (!heatmapMaker || options.newHeatmapCreator)
    heatmapMaker = new heatmapCreator(
      map,
      gr.game,
      gameInfo[0].config.gameMapSize === GameMapSize.Compact,
    );
  if (options.createFiles) {
    fileNames.video = path.join(outFolder, `${fileNames.video}.mp4`);
    fileNames.full = path.join(outFolder, `${fileNames.full}.png`);
    fs.mkdirSync(outFolder, { recursive: true });
  }
  const output: HeatmapOutput = {};
  if (options.fullGame) {
    const heatmapData = await heatmapMaker.create(
      tileConqueredHandler.conqueredTilesTotal,
    );
    if (heatmapData) {
      if (options.createFiles) {
        const png = new PNG({
          width: gr.game.width(),
          height: gr.game.height(),
        });
        png.data.set(heatmapData);

        await new Promise<void>((resolve, reject) => {
          if (fileNames.full)
            png
              .pack()
              .pipe(fs.createWriteStream(fileNames.full))
              .on("finish", () => resolve())
              .on("error", reject);
        });
      } else {
        output.fullGame = heatmapData;
      }
    }
  }
  if (options.video) {
    const borderFrames: Int32Array[] = tileConqueredHandler.borderFrames;
    const conquestFrames: Map<number, number>[] =
      tileConqueredHandler.conquestFrames;

    const background = await heatmapMaker.mapBackground();
    if (!background) throw new Error("failed to load map background");
    if (options.createFiles) {
      const outPath: string = fileNames.video;

      await createCombinedTimelapse({
        outPath,
        width: gr.game.width(),
        height: gr.game.height(),
        background,
        gradient: heatmapMaker.gradient,
        borderFrames,
        conquestFrames,
      });
    } else {
      output.background = background;
      output.gradient = heatmapMaker.gradient;
      output.borderFrames = borderFrames;
      output.conquestFrames = conquestFrames;
    }
  }
  if (!options.createFiles) return output;
}
