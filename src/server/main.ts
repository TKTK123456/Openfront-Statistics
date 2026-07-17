// server/main.ts

import express from "express";
import http from "http";
import path from "path";
import { fileURLToPath } from "url";
import { PNG } from "pngjs";
import { WebSocketServer } from "ws";

import {
  GameHanlderWorkerResult,
  runGameHanlderWorker,
} from "./runHandleGames";
import { createHeatmap, heatmapCreator } from "src/visualization/heatmap";

const app = express();
const server = http.createServer(app);

app.set("view engine", "ejs");
app.set(
  "views",
  path.join(path.dirname(fileURLToPath(import.meta.url)), "../views"),
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
interface Game {
  gameHandlerResult: GameHanlderWorkerResult;
}
const games: Map<string, Game> = new Map();

// Serve the page immediately.
// The page will connect to the websocket to request the data.
app.get("/game/:id", (req, res) => {
  res.render("game", {
    gameId: req.params.id,
  });
});

const wss = new WebSocketServer({
  server,
  path: "/ws",
});
function sendImage(ws: any, type: number, data: Buffer) {
  const packet = Buffer.allocUnsafe(1 + data.length);

  packet.writeUInt8(type, 0);
  data.copy(packet, 1);

  ws.send(packet, { binary: true });
}
wss.on("connection", (ws) => {
  ws.on("message", async (message) => {
    try {
      const msg = JSON.parse(message.toString());

      if (msg.type === "runGame") {
        const gameId = msg.gameId as string;

        ws.send(
          JSON.stringify({
            type: "status",
            message: "Running simulation...",
          }),
        );
        let output = games.get(gameId)?.gameHandlerResult;

        if (output === undefined) {
          output = await runGameHanlderWorker(gameId);
          games.set(gameId, { gameHandlerResult: output });
        }
        const imgConfig = {
          width: output.width,
          height: output.height,
        };

        ws.send(
          JSON.stringify({
            type: "finished",
            data: {
              width: output.width,
              height: output.height,

              gradient: heatmapCreator.defaultGradient,

              frameCount: output.borderFrames.length,
            },
          }),
        );
        sendImage(ws, 0, createImageBuffer(imgConfig, output.fullGame));

        sendImage(
          ws,
          1,
          createImageBuffer(imgConfig, output.tradeShipRoutesOutput),
        );

        sendImage(ws, 2, createImageBuffer(imgConfig, output.pirating));

        sendImage(ws, 3, Buffer.from(output.background!));
      } else if (msg.type === "frame") {
        const gameId = msg.gameId as string;
        const frameIndex = msg.frame as number;
        const game = games.get(gameId);

        if (game !== undefined) {
          const data = game.gameHandlerResult;
          const { background, borderFrames, conquestFrames, width, height } =
            data;

          const gradient = heatmapCreator.defaultGradient;

          const border = borderFrames[frameIndex];
          const conquest: Map<string, number> = new Map(
            Object.entries(conquestFrames[frameIndex]) as [string, number][],
          );

          if (!border || !conquest || background === undefined) {
            ws.send(
              JSON.stringify({
                type: "error",
                error: `Frame ${frameIndex} does not exist`,
              }),
            );
            return;
          }

          // Copy background so we don't mutate cached data
          const base = new Uint8ClampedArray(background);

          // Draw borders
          for (let i = 0; i < border.length; i++) {
            const idx = border[i] * 4;

            base[idx] = 0;
            base[idx + 1] = 0;
            base[idx + 2] = 0;
            base[idx + 3] = 255;
          }

          const tiles = new Int32Array(conquest.size);
          const counts = new Float64Array(conquest.size);

          let i = 0;
          for (const [tile, count] of conquest) {
            tiles[i] = parseInt(tile);
            counts[i] = count;
            i++;
          }
          const rgba = createHeatmap(
            {
              tiles,
              counts,
            },
            width,
            height,
            10,
            100,
            base,
            gradient,
          );
          const pixelBuffer = Buffer.from(
            rgba.buffer,
            rgba.byteOffset,
            rgba.byteLength,
          );

          const packet = Buffer.allocUnsafe(4 + pixelBuffer.length);

          // Store frame number
          packet.writeUInt32LE(frameIndex, 0);

          // Store RGBA bytes
          pixelBuffer.copy(packet, 4);
          sendImage(ws, 4, packet);
        }
      }
    } catch (err) {
      console.error(err);

      ws.send(
        JSON.stringify({
          type: "error",
          error: err instanceof Error ? err.message : String(err),
        }),
      );
    }
  });

  ws.on("close", () => {
    console.log("Client disconnected");
  });
});

server.listen(3000, () => {
  console.log("Server listening on http://localhost:3000");
});
