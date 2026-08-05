import {
  binaryToMaps,
  decodeCombinedBuffer,
  interpolateFrames,
  intersectMasks,
  TileRefs,
} from "src/shared/util/util";
import { Timelapse } from "./timelapses";
import { heatmapCreator } from "src/visualization/heatmap";
import { VideoEncoder } from "./createMP4";

const frameCache = new Map<number, Uint8Array>();

const socket: globalThis.WebSocket = new WebSocket(`ws://${location.host}/ws`);
socket.binaryType = "arraybuffer";

const status = document.getElementById("status") as HTMLSpanElement;
const progress = document.getElementById("progress") as HTMLProgressElement;
const timelapseProgress = document.getElementById(
  "timelapseProgress",
) as HTMLProgressElement;
const timelapsePercent = document.getElementById(
  "timelapse%",
) as HTMLSpanElement;
const renderedProgress = document.getElementById(
  "renderProgress",
) as HTMLProgressElement;
const renderedPercent = document.getElementById("rendered%") as HTMLSpanElement;

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
  tilesConquered: {
    visible: boolean;
    toggle: (render: boolean) => void;
    render: boolean;
  };
  tradeRoutes: {
    visible: boolean;
    toggle: (render: boolean) => void;
    render: boolean;
  };
} = {
  tilesConquered: {
    visible: true,
    render: true,
    toggle: async (render: boolean = false) => {
      if (render) {
        visibleTimelapses.tilesConquered.render = visibleTimelapses
          .tilesConquered.render
          ? false
          : true;
        return;
      }
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
    render: true,
    toggle: async (render: boolean = false) => {
      if (render) {
        visibleTimelapses.tradeRoutes.render = visibleTimelapses.tradeRoutes
          .render
          ? false
          : true;
        return;
      }
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
  let render = document.getElementById("render");
  if (render) render.hidden = false;
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
    let useCanvas = offScreenCanvases[whichCanvas];
    let useCtx = offScreenCtxes[whichCanvas];
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
          resolve(run(img));
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
let imageQueue: ImageQueue;
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
  imageQueue = new ImageQueue(3, width, height, borderCtx);
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

function drawBorder(index: number, canvasID: number): Promise<void> {
  return imageQueue.useImage((img: ImageData) => {
    let time = performance.now()
    const data = img.data;
    data.fill(0);

    for (const tile of borderFrames[index]) {
      const i = tile << 2;
      data[i + 3] = 255;
    }

    offScreenCtxes[canvasID].putImageData(img, 0, 0);
    console.log(performance.now()-time + "ms for draw border")
  });
}
async function drawMask(mask: Uint8Array, canvasID: number) {
  const gradient = heatmapCreator.defaultGradient[0].color;
  return imageQueue.useImage((img: ImageData) => {
    let time = performance.now()
    const data = img.data;

    data.fill(0);

    for (let byteIndex = 0; byteIndex < mask.length; byteIndex++) {
      const byte = mask[byteIndex];

      if (byte === 0) continue;

      for (let bit = 0; bit < 8; bit++) {
        if ((byte & (1 << bit)) === 0) continue;

        const tile = (byteIndex << 3) + bit;

        const i = tile << 2;

        data[i] = gradient[0];
        data[i + 1] = gradient[1];
        data[i + 2] = gradient[2];
        data[i + 3] = gradient[3];
      }
    }
    offScreenCtxes[canvasID].putImageData(img, 0, 0);
    console.log(performance.now()-time + "ms for draw mask")
  });
}
let renderId = 0;
async function createFrame(input: {
  index: number;
  offScreenOffset?: number;
  shouldContinue?: () => boolean;
  noFrameYet?: () => void;
  tilesConquered: boolean;
  tradeRoutes: boolean;
}) {
  const {
    index,
    offScreenOffset = 0,
    shouldContinue = () => true,
    noFrameYet = () => {},
    tilesConquered,
    tradeRoutes,
  } = input;
  let tileFrameData: { buffer: ArrayBuffer; mask: Uint8Array } | undefined;
  let tradeFrameData: { buffer: ArrayBuffer; mask: Uint8Array } | undefined;
  const draws: Promise<void>[] = [];
  const masks: Uint8Array[] = [defaultMask!];
  if (tilesConquered) {
    tileFrameData = await tilesConqueredTimelapse.drawFrame(index, noFrameYet);
    if (tileFrameData) {
      masks.push(tileFrameData.mask);
    }
  }
  if (!shouldContinue()) return false;
  if (tradeRoutes) {
    tradeFrameData = await tradeRouteTimelapse.drawFrame(index, noFrameYet);
    if (tradeFrameData) {
      masks.push(tradeFrameData.mask);
    }
  }
  if (!shouldContinue()) return false;
  draws.push(drawMask(intersectMasks(masks), offScreenOffset));
  if (tileFrameData) {
    draws.push(drawBorder(index, offScreenOffset + 1));
    draws.push(drawBufferToCanvas(tileFrameData.buffer, offScreenOffset + 2));
  } else if (tilesConquered) {
    return false;
  }

  if (tradeFrameData) {
    draws.push(drawBufferToCanvas(tradeFrameData.buffer, offScreenOffset + 3));
  } else if (tradeRoutes) {
    return false;
  }
  await Promise.all(draws);
  if (!shouldContinue()) return false;
  return true;
}
async function drawFrame(index: number): Promise<void> {
  const id = ++renderId;
  const shouldContinue = () => id === renderId;
  if (
    await createFrame({
      index,
      shouldContinue,
      noFrameYet: () => {
        if (shouldContinue()) drawFrame(index);
      },
      tilesConquered: true,
      tradeRoutes: true,
    })
  ) {
    borderCtx.clearRect(0, 0, width, height);
    maskCtx.clearRect(0, 0, width, height);
    ctx.clearRect(0, 0, width, height);
    tradeCtx.clearRect(0, 0, width, height);
    maskCtx.drawImage(offScreenCanvases[0], 0, 0);
    borderCtx.drawImage(offScreenCanvases[1], 0, 0);
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
    lastFrameTime = time;
    await drawFrame(frame);
  }
}

async function playLoop(time: number): Promise<void> {
  if (isPlaying) {
    await playFrame(time);
    requestAnimationFrame(playLoop);
  }
}
async function renderFrame(
  frame: number,
  videoRender: VideoEncoder,
): Promise<void> {
  let tileFrameData: { buffer: ArrayBuffer; mask: Uint8Array } | undefined;
  let tradeFrameData: { buffer: ArrayBuffer; mask: Uint8Array } | undefined;
  const draws: Promise<void>[] = [];
  const masks: Uint8Array[] = [defaultMask!];

  if (visibleTimelapses.tilesConquered.render) {
    tileFrameData = await tilesConqueredTimelapse.drawFrame(frame);
    if (tileFrameData) {
      masks.push(tileFrameData.mask);
    }
    draws.push(drawBorder(frame, 5));
  }

  if (visibleTimelapses.tradeRoutes.render) {
    tradeFrameData = await tradeRouteTimelapse.drawFrame(frame);
    if (tradeFrameData) {
      masks.push(tradeFrameData.mask);
    }
  }

  if (tileFrameData) {
    draws.push(drawBufferToCanvas(tileFrameData.buffer, 6));
  }

  if (tradeFrameData) {
    draws.push(drawBufferToCanvas(tradeFrameData.buffer, 7));
  }

  draws.push(drawMask(intersectMasks(masks), 4));
  await Promise.all(draws);
  await videoRender.addFrame(offScreenCanvases.slice(4));
}
async function renderVideo(): Promise<void> {
  if (
    !tilesConqueredTimelapse.ready ||
    !tradeRouteTimelapse.ready ||
    isRendering
  )
    return;
  let videoRender = new VideoEncoder({
    width,
    height,
    background: bg[0],
  });
  renderedProgress.value = 0;
  renderedPercent.textContent = `0.00%`;
  try {
    for (
      let renderedFrames = 0;
      renderedFrames < totalFrames;
      renderedFrames++
    ) {
      await renderFrame(renderedFrames, videoRender);
      let percent = Math.min(
        Math.max(((renderedFrames + 1) / totalFrames) * 100, 0),
        100,
      );
      renderedProgress.value = percent;
      renderedPercent.textContent = `${percent.toFixed(2)}%`;
    }
    const downloadUrl = URL.createObjectURL(await videoRender.createVideo());
    const a = document.createElement("a");
    a.href = downloadUrl;
    a.download = `${window.gameId}.mp4`;
    document.body.appendChild(a);
    a.click();
    a.remove();

    // Free the memory once the browser has started the download.
    setTimeout(() => URL.revokeObjectURL(downloadUrl), 1000);
  } finally {
    isRendering = false;
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
setupButtons("renderVideo", renderVideo);

function setupTimelapseToggle(
  id: string,
  timelapse: keyof typeof visibleTimelapses,
  render: boolean = false,
) {
  const checkbox = document.getElementById(id) as HTMLInputElement;
  if (!checkbox.checked) checkbox.checked = true;
  checkbox.onchange = () => {
    visibleTimelapses[timelapse].toggle(render);
  };
}

setupTimelapseToggle("showTileConquered", "tilesConquered");
setupTimelapseToggle("showTradeRoutes", "tradeRoutes");
setupTimelapseToggle("renderTileConquered", "tilesConquered", true);
setupTimelapseToggle("renderTradeRoutes", "tradeRoutes", true);
