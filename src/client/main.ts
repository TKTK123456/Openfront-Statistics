import {
  binaryToMaps,
  decodeCombinedBuffer,
  interpolateFrames,
  TileRefs,
} from "src/shared/util";
import { Timelapse } from "./timelapses";

const frameCache = new Map<number, Uint8Array>();

const socket: globalThis.WebSocket = new WebSocket(`ws://${location.host}/ws`);
socket.binaryType = "arraybuffer";

const status = document.getElementById("status") as HTMLDivElement;
const progress = document.getElementById("progress") as HTMLProgressElement;

const conquered = document.getElementById("conquered") as HTMLImageElement;
const trade = document.getElementById("trade") as HTMLImageElement;
const pirating = document.getElementById("pirating") as HTMLImageElement;

const canvas = document.getElementById("map") as HTMLCanvasElement;
const ctx = canvas.getContext("2d")!;
const borderCanvas = document.getElementById("borderMap") as HTMLCanvasElement;
const borderCtx = borderCanvas.getContext("2d");

const tradeCanvas = document.getElementById(
  "tradeRouteMap",
) as HTMLCanvasElement;
const tradeCtx = tradeCanvas.getContext("2d")!;
const bg = document.getElementsByClassName(
  "background",
) as HTMLCollectionOf<HTMLImageElement>;

const frameSliders = [
  document.getElementById("tileConqueredFrameSlider") as HTMLInputElement,
  document.getElementById("tradeRouteFrameSlider") as HTMLInputElement,
];

let tradeRouteTimelapse: Timelapse;
let tileConquredTimelapse: Timelapse;
let width = 0;
let height = 0;

let frame = [0, 0];
let totalFrames = 0;

let tradeShipRoutesTime: Map<number, number>[] = [];
let tileConquredTime: Map<number, number>[] = [];
let borderFrames: Int32Array[] = [];
let tileRefs: TileRefs;

function drawBufferToCanvas(
  buffer: Uint8Array | ArrayBuffer | ImageBitmap,
  whichCanvas: number,
): Promise<void> {
  return new Promise((resolve) => {
    if (buffer instanceof ImageBitmap) {
      if (whichCanvas === 0) {
        canvas.width = buffer.width;
        canvas.height = buffer.height;
        ctx.drawImage(buffer, 0, 0);
      } else {
        tradeCanvas.width = buffer.width;
        tradeCanvas.height = buffer.height;
        tradeCtx.drawImage(buffer, 0, 0);
      }

      resolve();
      return;
    }

    const blob = new Blob([buffer as BlobPart], {
      type: "image/png",
    });

    const url = URL.createObjectURL(blob);
    const img = new Image();

    img.onload = () => {
      if (whichCanvas === 0) {
        canvas.width = img.width;
        canvas.height = img.height;
        ctx.drawImage(img, 0, 0);
      } else {
        tradeCanvas.width = img.width;
        tradeCanvas.height = img.height;
        tradeCtx.drawImage(img, 0, 0);
      }

      URL.revokeObjectURL(url);
      resolve();
    };

    img.src = url;
  });
}
async function start(gameID: string): Promise<void> {
  socket.onopen = () => {
    socket.send(
      JSON.stringify({
        type: "runGame",
        gameId: gameID,
      }),
    );
  };

  socket.onmessage = ({ data }: MessageEvent): void => {
    if (data instanceof ArrayBuffer) {
      const bytes = new Uint8Array(data);

      const type = bytes[0];
      if (type === 4 || type === 3) {
        const bytes = new Uint8Array(data);

        // Skip the 1-byte type
        const payload = bytes.subarray(1);
        const isolatedBuffer = payload.buffer.slice(
          payload.byteOffset,
          payload.byteOffset + payload.byteLength,
        );
        const uint32 = new Uint32Array(isolatedBuffer);
        switch (type) {
          case 4:
            tradeShipRoutesTime = interpolateFrames(binaryToMaps(uint32), 6);
            tradeRouteTimelapse = new Timelapse({
              width,
              height,
              frames: tradeShipRoutesTime,
            });
            break;
          case 3:
            tileConquredTime = binaryToMaps(uint32);
            tileConquredTimelapse = new Timelapse({
              width,
              height,
              frames: tileConquredTime,
            });
        }
      } else if (type === 6) {
        const bytes = new Uint8Array(data.slice(1));

        const int32Buffers = decodeCombinedBuffer(bytes);

        for (let i = 0; i < int32Buffers.length; i++) {
          borderFrames.push(
            new Int32Array(
              int32Buffers[i].buffer,
              int32Buffers[i].byteOffset,
              int32Buffers[i].byteLength / 4,
            ),
          );
        }
      } else {
        const imageBytes = bytes.slice(1);

        const blob = new Blob([imageBytes], {
          type: "image/png",
        });

        const url = URL.createObjectURL(blob);

        switch (type) {
          case 0:
            conquered.onload = () => {
              URL.revokeObjectURL(url);
            };
            conquered.src = url;
            break;

          case 1:
            trade.onload = () => {
              URL.revokeObjectURL(url);
            };
            trade.src = url;
            break;

          case 2:
            pirating.onload = () => {
              URL.revokeObjectURL(url);
            };
            pirating.src = url;
            break;
          case 5:
            for (let i = 0; i < bg.length; i++) {
              bg[i].onload = () => {
                URL.revokeObjectURL(url);
              };
              bg[i].src = url;
            }
            break;
        }
      }

      return;
    }

    const msg = JSON.parse(data);

    switch (msg.type) {
      case "status":
        status.textContent = msg.message;
        break;

      case "progress":
        progress.value = msg.value;
        break;

      case "finished":
        loadGame(msg.data);
        break;

      case "error":
        status.textContent = msg.error;
        console.error(msg.error);
        break;
    }
  };
}

function loadGame(data: {
  width: number;
  height: number;
  frameCount: number;
}): void {
  status.textContent = "Finished!";
  progress.value = 100;

  width = data.width;
  height = data.height;
  tileRefs = new TileRefs(width, height);
  canvas.width = width;
  canvas.height = height;
  borderCanvas.width = width;
  borderCanvas.height = height;
  tradeCanvas.width = width;
  tradeCanvas.height = height;

  totalFrames = data.frameCount;

  frameSliders.forEach((s) => (s.max = String(totalFrames - 1)));
  frameSliders.forEach((s) => (s.value = "0"));
}

async function drawFrame(index: number, timelapse: number = 0): Promise<void> {
  let frameData: ArrayBuffer | Uint8Array | undefined;
  if (timelapse === 0) {
    borderCtx?.clearRect(0, 0, width, height);
    if (borderCtx) borderCtx.fillStyle = "black";
    for (const tile of borderFrames[index]) {
      borderCtx?.fillRect(tileRefs.x(tile), tileRefs.y(tile), 1, 1);
    }

    frameData = await tileConquredTimelapse.drawFrame(index, (frameData) => {
      if (index === frame[timelapse]) {
        drawBufferToCanvas(frameData, timelapse);
      }
    });
  } else if (timelapse === 1) {
    frameData = await tradeRouteTimelapse.drawFrame(index, (frameData) => {
      if (index === frame[timelapse]) {
        drawBufferToCanvas(frameData, timelapse);
      }
    });
  }

  if (frameData !== undefined) {
    await drawBufferToCanvas(frameData, timelapse);
  }
}

async function nextFrame(timelapse: number = 0): Promise<void> {
  if (frame[timelapse] < totalFrames - 1) {
    frame[timelapse]++;

    frameSliders[timelapse].value = String(frame[timelapse]);
    drawFrame(frame[timelapse], timelapse);
  }
}

async function previousFrame(timelapse: number = 0): Promise<void> {
  if (frame[timelapse] > 0) {
    frame[timelapse]--;

    frameSliders[timelapse].value = String(frame[timelapse]);
    await drawFrame(frame[timelapse], timelapse);
  }
}

let isPlayingTileConquests = false;
let isPlayingTradeRoute = false;
let lastTileConquestFrameTime = 0;
let lastTradeRouteFrameTime = 0;

function playVideo(timelapse: number = 0): void {
  if (
    (timelapse === 0 &&
      (!tileConquredTimelapse.ready || isPlayingTileConquests)) ||
    (timelapse === 1 && (!tradeRouteTimelapse.ready || isPlayingTradeRoute))
  ) {
    return;
  }
  const wasPlayingAny = isPlayingTileConquests || isPlayingTradeRoute;
  if (timelapse === 0) isPlayingTileConquests = true;
  if (timelapse === 1) isPlayingTradeRoute = true;
  if (!wasPlayingAny) requestAnimationFrame(playLoop);
}

async function playTileConquestFrame(time: number) {
  if (time - lastTileConquestFrameTime >= 1000 / 30) {
    if (frame[0] >= totalFrames - 1) {
      stopVideo();
      return;
    }

    frame[0]++;

    frameSliders[0].value = String(frame[0]);
    await drawFrame(frame[0]);

    lastTileConquestFrameTime = time;
  }
}

async function playTradeRouteFrame(time: number) {
  if (time - lastTradeRouteFrameTime >= 1000 / 30) {
    if (frame[1] >= totalFrames - 1) {
      stopVideo(1);
      return;
    }

    frame[1]++;

    frameSliders[1].value = String(frame[1]);
    await drawFrame(frame[1], 1);

    lastTradeRouteFrameTime = time;
  }
}

async function playLoop(time: number): Promise<void> {
  if (isPlayingTileConquests) await playTileConquestFrame(time);
  if (isPlayingTradeRoute) await playTradeRouteFrame(time);

  if (isPlayingTileConquests || isPlayingTradeRoute)
    requestAnimationFrame(playLoop);
}

function stopVideo(timelapse: number = 0): void {
  if (timelapse === 0) isPlayingTileConquests = false;
  if (timelapse === 1) isPlayingTradeRoute = false;
}

frameSliders[0].addEventListener("input", () => {
  frame[0] = Number(frameSliders[0].value);
  drawFrame(frame[0]);
});
frameSliders[1].addEventListener("input", async () => {
  frame[1] = Number(frameSliders[1].value);
  await drawFrame(frame[1], 1);
});

start(window.gameId);
function setupButtons(
  buttonName: string,
  func: (timelapse: number) => void | Promise<void>,
) {
  const buttons = document.querySelectorAll<HTMLButtonElement>(
    `[name="${buttonName}"]`,
  );

  for (let i = 0; i < buttons.length; i++) {
    buttons[i].onclick = async () => {
      func(i);
    };
  }
}
setupButtons("play", playVideo);
setupButtons("pause", stopVideo);
setupButtons("next", nextFrame);
setupButtons("previous", previousFrame);
