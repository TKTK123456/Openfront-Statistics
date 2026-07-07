import { gameMapLoader } from "src/util/util";
import { GameRunner } from "../../OpenFrontIO/src/core/GameRunner";
import { GameStartInfo, Turn } from "../../OpenFrontIO/src/core/Schemas";
import { createTilesConquredHeatmap } from "./tilesConqured";
import { TileConqueredHandler } from "src/handlers/conqueredTiles";

export class visualizations {
  private gr: GameRunner;
  private gameInfo: [GameStartInfo | undefined, Turn[]];
  private mapLoader: gameMapLoader;
  private outFolder: string;
  constructor(
    gr: GameRunner,
    gameInfo: [GameStartInfo | undefined, Turn[]],
    mapLoader: gameMapLoader,
    outFolder: string,
  ) {
    this.gr = gr;
    this.gameInfo = gameInfo;
    this.mapLoader = mapLoader;
    this.outFolder = outFolder;
  }

  async conquredTilesHeatmap(
    dataHandler: TileConqueredHandler,
    fileNames?: {
      video?: string;
      full?: string;
    },
  ) {
    if (this.gameInfo[0] === undefined) return;
    const gameID = this.gameInfo[0].gameID;
    if (fileNames === undefined) fileNames = {};
    if (fileNames.video === undefined)
      fileNames.video = "conqured-tiles-" + gameID;
    if (fileNames.full === undefined)
      fileNames.full = "conqured-tiles-" + gameID;
    return await createTilesConquredHeatmap(
      dataHandler,
      this.gr,
      this.gameInfo,
      this.mapLoader,
      this.outFolder,
      fileNames,
    );
  }
}
