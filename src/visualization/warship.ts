import { WarshipHandler } from "src/handlers/warship";
import { gameMapLoader } from "src/util/util";
import { GameRunner } from "../../OpenFrontIO/src/core/GameRunner";
import { GameStartInfo, Turn } from "../../OpenFrontIO/src/core/Schemas";
import { heatmapCreator } from "./heatmap";
import fs from "fs";
import { GameMapSize } from "../../OpenFrontIO/src/core/game/Game";
import path from "path";
import { PNG } from "pngjs";

let heatmapMaker: heatmapCreator;

export async function piratingHeatmap(
  warshipHandler: WarshipHandler,
  gr: GameRunner,
  gameInfo: [GameStartInfo | undefined, Turn[]],
  mapLoader: gameMapLoader,
  outFolder: string,
  fileName: string = `pirating-${gameInfo[0]?.gameID}`,
) {
  if (gameInfo[0] === undefined) return;
  const gameID = gameInfo[0].gameID;
  const map = mapLoader.getMapData(gameInfo[0].config.gameMap);
  fileName = path.join(outFolder, `${fileName}.png`);
  if (!heatmapMaker)
    heatmapMaker = new heatmapCreator(
      map,
      gr.game,
      gameInfo[0].config.gameMapSize === GameMapSize.Compact,
    );
  let tileFrequency: Map<number, number> = warshipHandler.capturedShipTiles;
  const heatmapData = await heatmapMaker.create(tileFrequency);
  if (heatmapData) {
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
  }
  console.log("Done");
}
