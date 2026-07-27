import {
  binaryToMaps,
  decodeCombinedBuffer,
  interpolateFrames,
  intersectMasks,
  TileRefs,
} from "src/shared/util/util";
import { Timelapse } from "./timelapses";
import { heatmapCreator } from "src/visualization/heatmap";

const frameCache = new Map<number, Uint8Array>();

const socket: globalThis.WebSocket = new WebSocket(`ws://${location.host}/ws`);
socket.binaryType = "arraybuffer";

const status = document.getElementById("status") as HTMLDivElement;
const progress = document.getElementById("progress") as HTMLProgressElement;
const timelapseProgress = document.getElementById(
  "timelapseProgress",
) as HTMLProgressElement;
const timelapsePercent = document.getElementById(
  "timelapse%",
) as HTMLDivElement;

const conquered = document.getElementById("conquered") as HTMLImageElement;
const trade = document.getElementById("trade") as HTMLImageElement;
const pirating = document.getElementById("pirating") as HTMLImageElement;

const canvas = document.getElementById("map") as HTMLCanvasElement;
const ctx = canvas.getContext("2d")!;
const borderCanvas = document.getElementById("borderMap") as HTMLCanvasElement;
const borderCtx = borderCanvas.getContext("2d")!;
const maskCanvas = document.getElementById("mask") as HTMLCanvasElement;
const maskCtx = maskCanvas.getContext("2d")!;
const tradeCanvas = document.getElementById(
  "tradeRouteMap",
) as HTMLCanvasElement;
const tradeCtx = tradeCanvas.getContext("2d")!;
const bg = document.getElementsByClassName(
  "background",
) as HTMLCollectionOf<HTMLImageElement>;
const offScreenCanvases: OffscreenCanvas[] = [];
const offScreenCtxes: OffscreenCanvasRenderingContext2D[] = [];
const frameSlider = document.getElementById("frameSlider") as HTMLInputElement;

let tradeRouteTimelapse: Timelapse;
let tilesConqueredTimelapse: Timelapse;
let width = 0;
let height = 0;

let frame = 0;
let totalFrames = 0;
let loadedHeatmapFrames = 0;
let timelapseAmount = 2;

let tradeShipRoutesTime: Map<number, number>[] = [];
let tileConquredTime: Map<number, number>[] = [];
let borderFrames: Int32Array[] = [];
let tileRefs: TileRefs;
const visibleTimelapses: {
  tilesConquered: { visible: boolean; toggle: () => void };
  tradeRoutes: { visible: boolean; toggle: () => void };
} = {
  tilesConquered: {
    visible: true,
    toggle: async () => {
      visibleTimelapses.tilesConquered.visible = visibleTimelapses
        .tilesConquered.visible
        ? false
        : true;
      await drawFrame(frame);
      canvas.hidden = !visibleTimelapses.tilesConquered.visible;
      borderCanvas.hidden = !visibleTimelapses.tilesConquered.visible;
    },
  },
  tradeRoutes: {
    visible: true,
    toggle: async () => {
      visibleTimelapses.tradeRoutes.visible = visibleTimelapses.tradeRoutes
        .visible
        ? false
        : true;
      await drawFrame(frame);
      tradeCanvas.hidden = !visibleTimelapses.tradeRoutes.visible;
    },
  },
};
function onFrameLoad() {
  loadedHeatmapFrames++;
  let amountNeeded = totalFrames * timelapseAmount;
  let progressPercent = Math.min(
    Math.max((loadedHeatmapFrames / amountNeeded) * 100, 0),
    100,
  );
  timelapseProgress.value = progressPercent;
  timelapsePercent.textContent = `${progressPercent.toFixed(2)}%`;
}
let finishedTimelapses = 0;
let buttonsHiddenUntilTimelapseFinished: HTMLButtonElement[] = [];
function onFinishTimelapse() {
  finishedTimelapses++;
  if (finishedTimelapses < timelapseAmount) return;
  for (const button of buttonsHiddenUntilTimelapseFinished) {
    button.hidden = false;
  }
}
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
    let useCanvas = offScreenCanvases[whichCanvas + 2];
    let useCtx = offScreenCtxes[whichCanvas + 2];
    img.onload = () => {
      useCanvas.width = img.width;
      useCanvas.height = img.height;
      useCtx.clearRect(0, 0, img.width, img.height);
      useCtx.drawImage(img, 0, 0);

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
              onFrameLoad,
              onFinish: onFinishTimelapse,
            });
            break;
          case 3:
            tileConquredTime = binaryToMaps(uint32);
            tilesConqueredTimelapse = new Timelapse({
              width,
              height,
              frames: tileConquredTime,
              onFrameLoad,
              onFinish: onFinishTimelapse,
            });
            break;
        }
        if (
          tradeRouteTimelapse !== undefined &&
          tilesConqueredTimelapse !== undefined
        )
          drawFrame(0);
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
class ImageQueue {
  private images: { img: ImageData; inUse: boolean }[] = [];
  private queue: {
    resolve: (img: ImageData) => void;
    reject: (reason?: any) => void;
  }[] = [];
  constructor(
    amount: number,
    width: number,
    height: number,
    ctx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D,
  ) {
    for (let i = 0; i < amount; i++) {
      this.images.push({
        img: ctx.createImageData(width, height),
        inUse: false,
      });
    }
  }
  useImage(run: (img: ImageData) => any): Promise<any> {
    return new Promise((resolve, reject) => {
      const use = {
        resolve: (img: ImageData) => {
          resolve(run);
        },
        reject,
      };
      this.queue.push(use);
      this.dispatch();
    });
  }
  dispatch() {
    while (this.queue.length) {
      const image = this.images.find((v) => !v.inUse);
      if (!image) return;
      image.inUse = true;
      const job = this.queue.shift();
      job?.resolve(image.img);
      image.inUse = false;
    }
  }
}
let borderImages: ImageQueue;
let maskImages: ImageQueue;
let defaultMask: Uint8Array;
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
  maskCanvas.width = width;
  maskCanvas.height = height;
  borderImages = new ImageQueue(2, width, height, borderCtx);
  maskImages = new ImageQueue(2, width, height, maskCtx);
  defaultMask = new Uint8Array(Math.ceil((width * height) / 8)).fill(0xff);
  totalFrames = data.frameCount;
  for (let i = 0; i < 8; i++) {
    const newOffscreenCanvas = new OffscreenCanvas(width, height);
    offScreenCanvases.push(newOffscreenCanvas);
    offScreenCtxes.push(newOffscreenCanvas.getContext("2d")!);
  }
  frameSlider.max = String(totalFrames - 1);
  frameSlider.value = "0";
}

function drawBorder(index: number, canvasID: number = 0): Promise<void> {
  return borderImages.useImage((img: ImageData) => {
    const data = img.data;
    data.fill(0);

    for (const tile of borderFrames[index]) {
      const i = (tileRefs.y(tile) * width + tileRefs.x(tile)) << 2;
      data[i + 3] = 255;
    }

    offScreenCtxes[canvasID].putImageData(img, 0, 0);
  });
}
async function drawMask(mask: Uint8Array, canvasID: number = 1) {
  const gradient = heatmapCreator.defaultGradient[0].color;
  return maskImages.useImage((img: ImageData) => {
    const data = img.data;

    data.fill(0);

    for (let byteIndex = 0; byteIndex < mask.length; byteIndex++) {
      const byte = mask[byteIndex];

      if (byte === 0) continue;

      for (let bit = 0; bit < 8; bit++) {
        if ((byte & (1 << bit)) === 0) continue;

        const tile = (byteIndex << 3) + bit;

        const i = (tileRefs.y(tile) * width + tileRefs.x(tile)) << 2;

        data[i] = gradient[0];
        data[i + 1] = gradient[1];
        data[i + 2] = gradient[2];
        data[i + 3] = gradient[3];
      }
    }
    offScreenCtxes[canvasID].putImageData(img, 0, 0);
  });
}
let renderId = 0;
async function drawFrame(index: number): Promise<void> {
  const id = ++renderId;
  const shouldContinue = () => id === renderId;
  let tileFrameData: { buffer: ArrayBuffer; mask: Uint8Array } | undefined;
  let tradeFrameData: { buffer: ArrayBuffer; mask: Uint8Array } | undefined;
  let mask: Uint8Array[] = [defaultMask!];

  tileFrameData = await tilesConqueredTimelapse.drawFrame(index, () => {
    if (shouldContinue()) drawFrame(index);
  });
  if (!shouldContinue()) return;
  if (tileFrameData !== undefined) {
    if (visibleTimelapses.tilesConquered.visible) mask.push(tileFrameData.mask);
  }
  if (!shouldContinue()) return;
  tradeFrameData = await tradeRouteTimelapse.drawFrame(index, () => {
    if (shouldContinue()) drawFrame(index);
  });
  if (!shouldContinue()) return;
  if (tradeFrameData !== undefined && tileFrameData !== undefined) {
    const allDraws: Promise<void>[] = [];
    if (visibleTimelapses.tradeRoutes.visible) mask.push(tradeFrameData.mask);
    allDraws.push(drawMask(intersectMasks(mask)));
    allDraws.push(drawBorder(index));
    allDraws.push(drawBufferToCanvas(tradeFrameData.buffer, 1));
    allDraws.push(drawBufferToCanvas(tileFrameData.buffer, 0));
    await Promise.all(allDraws);
    borderCtx.clearRect(0, 0, width, height);
    maskCtx.clearRect(0, 0, width, height);
    ctx.clearRect(0, 0, width, height);
    tradeCtx.clearRect(0, 0, width, height);
    borderCtx.drawImage(offScreenCanvases[0], 0, 0);
    maskCtx.drawImage(offScreenCanvases[1], 0, 0);
    ctx.drawImage(offScreenCanvases[2], 0, 0);
    tradeCtx.drawImage(offScreenCanvases[3], 0, 0);
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
let isRendering = false;
let lastFrameTime = 0;

function playVideo(): void {
  if (
    !tilesConqueredTimelapse.ready ||
    !tradeRouteTimelapse.ready ||
    isPlaying
  ) {
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
let renderedFrames = 0;
async function renderFrame(frame: number): Promise<void> {}
async function renderVideo(): Promise<void> {
  if (
    !tilesConqueredTimelapse.ready ||
    !tradeRouteTimelapse.ready ||
    isRendering
  )
    return;
  for (renderedFrames = 0; renderedFrames < totalFrames; renderedFrames++) {
    renderFrame(renderedFrames);
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
  hiddenUntilTimelapseFinished: boolean = false,
) {
  const buttons = document.querySelectorAll<HTMLButtonElement>(
    `[name="${buttonName}"]`,
  );
  if (hiddenUntilTimelapseFinished)
    buttonsHiddenUntilTimelapseFinished.push(...buttons);
  for (let i = 0; i < buttons.length; i++) {
    buttons[i].onclick = async () => {
      func(i);
    };
  }
}
setupButtons("play", playVideo, true);
setupButtons("pause", stopVideo, true);
setupButtons("next", nextFrame);
setupButtons("previous", previousFrame);
setupButtons("renderVideo", renderVideo, true);

function setupTimelapseToggle(
  id: string,
  timelapse: keyof typeof visibleTimelapses,
) {
  const checkbox = document.getElementById(id) as HTMLInputElement;
  if (!checkbox.checked) checkbox.checked = true;
  checkbox.onchange = visibleTimelapses[timelapse].toggle;
}

setupTimelapseToggle("showTileConquered", "tilesConquered");
setupTimelapseToggle("showTradeRoutes", "tradeRoutes");
