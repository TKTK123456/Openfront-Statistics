import { simGame } from "src/server/simGame";
import { createTilesConquredHeatmap } from "src/visualization/tilesConqured";
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

    if (
      output?.fullGame === undefined ||
      output.borderFrames === undefined ||
      output.conquestFrames === undefined
    ) {
      throw new Error("Missing heatmap output");
    }
    const transferable = new Uint8ClampedArray(output.fullGame);
    parentPort!.postMessage(
      {
        width: handlers.gr.game.width(),
        height: handlers.gr.game.height(),

        fullGame: output.fullGame,

        borderFrames: output.borderFrames,

        conquestFrames: output.conquestFrames.map((frame) =>
          Object.fromEntries(frame),
        ),
        background: output.background,
      },

      // transfer buffers instead of copying
      [transferable.buffer as ArrayBuffer],
    );
  } catch (err) {
    parentPort!.postMessage({
      error: err instanceof Error ? err.message : String(err),
    });
  }
});
