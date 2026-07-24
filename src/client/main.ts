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

const frameSlider = document.getElementById(
  "tileConqueredFrameSlider",
) as HTMLInputElement;

let tradeRouteTimelapse: Timelapse;
let tileConquredTimelapse: Timelapse;
let width = 0;
let height = 0;

let frame = 0;
let totalFrames = 0;

let tradeShipRoutesTime: Map<number, number>[] = [];
let tileConquredTime: Map<number, number>[] = [];
let borderFrames: Int32Array[] = [];
let tileRefs: TileRefs;

function drawBufferToCanvas(
  buffer: ArrayBuffer,
  whichCanvas: number,
): Promise<void> {
  return new Promise((resolve) => {
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

  frameSlider.max = String(totalFrames - 1);
  frameSlider.value = "0";
}

async function drawFrame(index: number): Promise<void> {
  let frameData: { buffer: ArrayBuffer; mask: Uint8Array } | undefined;
  let mask: Uint8Array;
  borderCtx?.clearRect(0, 0, width, height);
  if (borderCtx) borderCtx.fillStyle = "black";
  for (const tile of borderFrames[index]) {
    borderCtx?.fillRect(tileRefs.x(tile), tileRefs.y(tile), 1, 1);
  }

  frameData = await tileConquredTimelapse.drawFrame(index, () => {
    if (index === frame) {
      drawFrame(index);
    }
  });
  if (frameData !== undefined) {
    await drawBufferToCanvas(frameData.buffer, 0);
  }
  frameData = await tradeRouteTimelapse.drawFrame(index, () => {
    if (index === frame) {
      drawFrame(index);
    }
  });

  if (frameData !== undefined) {
    await drawBufferToCanvas(frameData.buffer, 1);
  }
}

async function nextFrame(): Promise<void> {
  if (frame < totalFrames - 1) {
    frame++;

    frameSlider.value = String(frame);
    drawFrame(frame);
  }
}

async function previousFrame(): Promise<void> {
  if (frame > 0) {
    frame--;

    frameSlider.value = String(frame);
    await drawFrame(frame);
  }
}

let isPlaying = false;
let lastFrameTime = 0;

function playVideo(): void {
  if (!tileConquredTimelapse.ready || !tradeRouteTimelapse.ready || isPlaying) {
    return;
  }
  isPlaying = true;
  requestAnimationFrame(playLoop);
}

async function playFrame(time: number) {
  if (time - lastFrameTime >= 1000 / 30) {
    if (frame >= totalFrames - 1) {
      stopVideo();
      return;
    }

    frame++;

    frameSlider.value = String(frame);
    await drawFrame(frame);

    lastFrameTime = time;
  }
}

async function playLoop(time: number): Promise<void> {
  if (isPlaying) {
    await playFrame(time);
    requestAnimationFrame(playLoop);
  }
}

function stopVideo(): void {
  isPlaying = false;
}

frameSlider.addEventListener("input", () => {
  frame = Number(frameSlider.value);
  drawFrame(frame);
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
