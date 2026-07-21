import { createHeatmap, heatmapCreator } from "src/visualization/heatmap";
import { PNG } from "pngjs/browser";
import { interpolateFrames } from "src/shared/util";

export class timelapse {
  private cache: Map<number, Uint8Array<ArrayBufferLike>> = new Map();
  private width: number;
  private height: number;
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private frames: Map<number, number>[];
  constructor(
    width: number,
    height: number,
    canvas: HTMLCanvasElement,
    ctx: CanvasRenderingContext2D,
    frames: Map<number, number>[],
    bg: HTMLImageElement,
  ) {
    this.width = width;
    this.height = height;
    this.canvas = canvas;
    this.ctx = ctx;
    this.frames = interpolateFrames(frames, 6);
    this.canvas.width = bg.width;
    this.canvas.height = bg.height;
  }
  drawFrame(idx: number) {
    const frame = this.frames[idx];
    return this.createImageBuffer(
      createHeatmap(
        frame,
        this.height,
        this.width,
        10,
        100,
        null,
        heatmapCreator.defaultGradient,
      ),
    );
  }
  private createImageBuffer(data: Uint8ClampedArray) {
    const img = new PNG({ width: this.width, height: this.height });
    img.data.set(data);
    return PNG.sync.write(img);
  }
}
