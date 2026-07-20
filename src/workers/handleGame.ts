import { simGame } from "src/server/simGame";
import { createTilesConquredHeatmap } from "src/visualization/tilesConqured";
import { tradeShipRoutes } from "src/visualization/tradeShip";
import { piratingHeatmap } from "src/visualization/warship";
import { parentPort, Transferable } from "worker_threads";

if (!parentPort) {
  throw new Error("Worker has no parentPort");
}

parentPort.on("message", async (gameID: string) => {
  try {
    const sendProgress = (value: number) => {
      parentPort?.postMessage({ type: "progress", value });
    };
    const handlers = await simGame(gameID, sendProgress);

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
      output === undefined ||
      output.fullGame === undefined ||
      output.borderFrames === undefined ||
      output.conquestFrames === undefined ||
      tradeShipRoutesOutput === undefined ||
      pirating === undefined ||
      output.background === undefined
    ) {
      throw new Error("Missing heatmap output");
    }
    console.log("Got to here");
    parentPort!.postMessage(
      {
        type: "finish",
        width: handlers.gr.game.width(),
        height: handlers.gr.game.height(),

        borderFrames: output.borderFrames,

        conquestFrames: output.conquestFrames,
        background: output.background.buffer,
        fullGame: output.fullGame.buffer,
        tradeShipRoutesOutput: tradeShipRoutesOutput.buffer,
        pirating: pirating.buffer,
      },
      [
        output.fullGame.buffer as Transferable,
        output.background.buffer as Transferable,
        tradeShipRoutesOutput.buffer as Transferable,
        pirating.buffer as Transferable,
      ],
    );
  } catch (err) {
    parentPort!.postMessage({
      type: "error",
      error: err instanceof Error ? err.message : String(err),
    });
  }
});
