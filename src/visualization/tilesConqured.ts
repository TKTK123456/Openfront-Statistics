import { TileConqueredHandler } from "src/handlers/conqueredTiles";
import { GameRunner } from "../../OpenFrontIO/src/core/GameRunner";
import path from "path";
import { GameStartInfo, Turn } from "../../OpenFrontIO/src/core/Schemas";
import { gameMapLoader } from "src/util/util";
import { PNG } from "pngjs";
import { GameMapSize } from "../../OpenFrontIO/src/core/game/Game";
import { encodeVideo } from "./encode";
import { heatmapCreator } from "./heatmap";
import fs from "fs";

let heatmapMaker: heatmapCreator;

export async function createTilesConquredHeatmap(
  tileConqueredHandler: TileConqueredHandler,
  gr: GameRunner,
  gameInfo: [GameStartInfo | undefined, Turn[]],
  mapLoader: gameMapLoader,
  outFolder: string,
  options: {
    video?: boolean;
    fullGame?: boolean;
  } = {
    video: true,
    fullGame: true,
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
    options.fullGame === true;
  }
  if (fileNames === undefined) fileNames = {};
  if (fileNames.video === undefined)
    fileNames.video = "conqured-tiles-" + gameID;
  if (fileNames.full === undefined) fileNames.full = "conqured-tiles-" + gameID;
  const map = mapLoader.getMapData(gameInfo[0].config.gameMap);
  if (!heatmapMaker)
    heatmapMaker = new heatmapCreator(
      map,
      gr.game,
      gameInfo[0].config.gameMapSize === GameMapSize.Compact,
    );
  fileNames.video = path.join(outFolder, `${fileNames.video}.mp4`);
  fileNames.full = path.join(outFolder, `${fileNames.full}.png`);
  fs.mkdirSync(outFolder, { recursive: true });
  const videoData: Uint8ClampedArray[] = [];
  if (options.fullGame) {
    const heatmapData = await heatmapMaker.create(
      tileConqueredHandler.conqueredTilesTotal,
    );
    if (heatmapData) {
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
    }
  }
  if (options.video) {
    for (
      let i = 0;
      i < tileConqueredHandler.conqueredTilesFullGame.length;
      i++
    ) {
      const heatmapData = await heatmapMaker.create(
        tileConqueredHandler.conqueredTilesFullGame[i],
      );
      console.log(
        `Created heatmap ${i + 1}/${tileConqueredHandler.conqueredTilesFullGame.length}`,
      );
      if (heatmapData) videoData.push(heatmapData);
    }
    encodeVideo(
      `${fileNames.video}`,
      videoData,
      gr.game.width(),
      gr.game.height(),
      10,
    );
  }
  console.log("Done");
}
