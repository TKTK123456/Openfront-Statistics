// server/main.ts
import express from "express";
import path from "path";
import { fileURLToPath } from "url";
import { PNG } from "pngjs";
import { runGameHanlderWorker } from "./runHandleGames";
import { heatmapCreator } from "src/visualization/heatmap";

const app = express();

app.set("view engine", "ejs");
app.set(
  "views",
  path.join(path.dirname(fileURLToPath(import.meta.url)), `../views`),
);

app.use("/output", express.static("output"));

function createImageBuffer(
  config: {
    width: number;
    height: number;
  },
  data: Uint8ClampedArray,
) {
  const img = new PNG(config);
  img.data.set(data);
  return PNG.sync.write(img);
}

app.get("/game/:id", async (req, res) => {
  try {
    const output = await runGameHanlderWorker(req.params.id);
    const width = output.width;
    const height = output.height;
    const imgConfig = { width, height };
    const conqueredTilesImageBuffer = createImageBuffer(
      imgConfig,
      output.fullGame,
    );
    const tradeShipRoutesImageBuffer = createImageBuffer(
      imgConfig,
      output.tradeShipRoutesOutput,
    );
    const piratingHeatmapBuffer = createImageBuffer(imgConfig, output.pirating);

    const conquestFramesJSON = output.conquestFrames;

    res.render("game", {
      gameId: req.params.id,
      conqueredTilesHeatmap: conqueredTilesImageBuffer.toString("base64"),
      width,
      height,
      tradeShipRoutesImageBuffer: tradeShipRoutesImageBuffer.toString("base64"),
      piratingHeatmapBuffer: piratingHeatmapBuffer.toString("base64"),
      background: Buffer.from(output.background!).toString("base64"),
      gradient: heatmapCreator.defaultGradient,

      borderFrames: output.borderFrames,
      conquestFrames: conquestFramesJSON,
    });
  } catch (err) {
    console.error(err);
    res.status(500).send("Simulation failed");
  }
});

app.listen(3000);
