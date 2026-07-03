import { TileConquredHandler } from "src/sims/conqueredTiles";
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

export async function createVisualization(
  tileConquredHandler: TileConquredHandler,
  gr: GameRunner,
  gameInfo: [GameStartInfo | undefined, Turn[]],
  mapLoader: gameMapLoader,
  outFolder: string,
) {
  if (gameInfo[0] === undefined) return;
  const gameID = gameInfo[0].gameID;
  const map = mapLoader.getMapData(gameInfo[0].config.gameMap);
  heatmapMaker = new heatmapCreator(
    map,
    gr.game,
    gameInfo[0].config.gameMapSize === GameMapSize.Compact,
  );
  let heatmapFilePath = path.join(outFolder, `${gameID}.mp4`);
  fs.mkdirSync(outFolder, { recursive: true });
  const videoData: Uint8ClampedArray[] = [];
  const heatmapData = await heatmapMaker.create(
    tileConquredHandler.conqueredTilesTotal,
    0.001,
  );
  if (heatmapData) {
    const png = new PNG({
      width: gr.game.width(),
      height: gr.game.height(),
    });
    png.data.set(heatmapData);

    await new Promise<void>((resolve, reject) => {
      png
        .pack()
        .pipe(fs.createWriteStream(heatmapFilePath + ".png"))
        .on("finish", () => resolve())
        .on("error", reject);
    });
  }
  for (let i = 0; i < tileConquredHandler.conqueredTilesFullGame.length; i++) {
    const heatmapData = await heatmapMaker.create(
      tileConquredHandler.conqueredTilesFullGame[i],
    );
    console.log(
      `Created heatmap ${i + 1}/${tileConquredHandler.conqueredTilesFullGame.length}`,
    );
    if (heatmapData) videoData.push(heatmapData);
  }
  encodeVideo(
    `${heatmapFilePath}`,
    videoData,
    gr.game.width(),
    gr.game.height(),
    10,
  );
  console.log("Done");
}
