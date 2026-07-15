// server/main.ts
import express from "express";
import path from "path";
import { simGame } from "./simGame";
import { createTilesConquredHeatmap } from "../visualization/tilesConqured";
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

app.get("/game/:id", async (req, res) => {
  try {
    const output = await runGameHanlderWorker(req.params.id);
    const png = new PNG({
      width: output.width,
      height: output.height,
    });

    png.data.set(output.fullGame);

    const imageBuffer = PNG.sync.write(png);

    const conquestFramesJSON = output.conquestFrames;

    res.render("game", {
      gameId: req.params.id,
      heatmap: imageBuffer.toString("base64"),
      width: output.width,
      height: output.height,

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
