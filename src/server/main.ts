// server/main.ts

import express from "express";
import http from "http";
import path from "path";
import { fileURLToPath } from "url";
import { WebSocketServer, WebSocket } from "ws";
import { createServer } from "vite";

import { GameHanlderWorkerResult, runGame } from "./runGame";
import { heatmapCreator } from "src/visualization/heatmap";
import { createImageBuffer, sendBuffer } from "src/util/util";
import { combineBuffer, mapsToBinary } from "src/shared/util/util";

const vite = await createServer({
  configFile: path.resolve("vite.config.ts"),
  server: {
    middlewareMode: true,
  },
});

const app = express();
const server = http.createServer(app);

app.set("view engine", "ejs");
app.set(
  "views",
  path.join(path.dirname(fileURLToPath(import.meta.url)), "../views"),
);

export interface Game {
  gameHandlerResult: GameHanlderWorkerResult;
}

//Connect to a DB so that node doesn't run out of memory or whatever

const games: Map<string, Game> = new Map();

// Serve the page immediately.
// The page will connect to the websocket to request the data.
app.get("/game/:id", (req, res) => {
  res.render("game", {
    gameId: req.params.id,
  });
});

app.use(vite.middlewares);
const wss = new WebSocketServer({
  server,
  path: "/ws",
});

export async function gameProcessor(
  game: GameHanlderWorkerResult,
  ws: WebSocket,
) {
  const imgConfig = {
    width: game.width,
    height: game.height,
  };

  ws.send(
    JSON.stringify({
      type: "finished",
      data: {
        width: game.width,
        height: game.height,

        gradient: heatmapCreator.defaultGradient,

        frameCount: game.borderFrames.length,
      },
    }),
  );
  sendBuffer(ws, 0, createImageBuffer(imgConfig, game.fullGame));

  sendBuffer(ws, 1, createImageBuffer(imgConfig, game.tradeShipRoutesOutput));

  sendBuffer(ws, 2, createImageBuffer(imgConfig, game.pirating));

  if (game.background !== undefined) {
    sendBuffer(ws, 5, createImageBuffer(imgConfig, game.background));
    const tradeShipRoutesTimeUint32 = mapsToBinary(game.tradeShipRoutesTime);

    const tradeShipRoutesTimebuffer = Buffer.from(
      tradeShipRoutesTimeUint32.buffer,
      tradeShipRoutesTimeUint32.byteOffset,
      tradeShipRoutesTimeUint32.byteLength,
    );
    sendBuffer(ws, 4, tradeShipRoutesTimebuffer);
    const tileConquredTimeUnit32 = mapsToBinary(game.conquestFrames);
    const tileConquredTimeBuffer = Buffer.from(
      tileConquredTimeUnit32.buffer,
      tileConquredTimeUnit32.byteOffset,
      tileConquredTimeUnit32.byteLength,
    );
    sendBuffer(ws, 3, tileConquredTimeBuffer);
    let borderFramesBuffer: Buffer[] = [];
    for (let i = 0; i < game.borderFrames.length; i++) {
      let buffer = Buffer.from(game.borderFrames[i].buffer);
      borderFramesBuffer.push(buffer);
    }
    sendBuffer(ws, 6, combineBuffer(borderFramesBuffer));
  }
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
          output = await runGame(gameId, { ws, cache: games });
          games.set(gameId, {
            gameHandlerResult: output,
          });
        }
        await gameProcessor(output, ws);
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
