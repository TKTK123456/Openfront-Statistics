import { simGame } from "src/server/simGame";
import { createTilesConquredHeatmap } from "src/visualization/tilesConqured";
import { tradeShipRoutes } from "src/visualization/tradeShip";
import { piratingHeatmap } from "src/visualization/warship";
import { parentPort } from "worker_threads";

if (!parentPort) {
  throw new Error("Worker has no parentPort");
}

parentPort.on("message", async (gameID: string) => {
  try {
    const handlers = await simGame(gameID);

    const output = await createTilesConquredHeatmap(
      handlers.tileConqueredHandler,
      handlers.gr,
      handlers.gameInfo,
      handlers.mapLoader,
      "",
      {
        createFiles: false,
        newHeatmapCreator: true,
      },
    );

    const tradeShipRoutesOutput = await tradeShipRoutes(
      handlers.tradeShipHandler,
      handlers.gr,
      handlers.gameInfo,
      handlers.mapLoader,
      "",
      { createFile: false, newHeatmapCreator: true },
    );
    const pirating = await piratingHeatmap(
      handlers.warshipHandler,
      handlers.gr,
      handlers.gameInfo,
      handlers.mapLoader,
      "",
      { createFile: false, newHeatmapCreator: true },
    );
    if (
      output?.fullGame === undefined ||
      output.borderFrames === undefined ||
      output.conquestFrames === undefined ||
      tradeShipRoutesOutput === undefined ||
      pirating === undefined ||
      output.ownerFrames === undefined
    ) {
      throw new Error("Missing heatmap output");
    }
    parentPort!.postMessage({
      width: handlers.gr.game.width(),
      height: handlers.gr.game.height(),

      fullGame: output.fullGame,

      borderFrames: output.borderFrames,

      conquestFrames: output.conquestFrames.map((frame) =>
        Object.fromEntries(frame),
      ),
      background: output.background,
      ownerFrames: output.ownerFrames,
      tradeShipRoutesOutput,
      pirating,
    });
  } catch (err) {
    parentPort!.postMessage({
      error: err instanceof Error ? err.message : String(err),
    });
  }
});
