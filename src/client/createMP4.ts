import {
  Output,
  Mp4OutputFormat,
  BufferTarget,
  CanvasSource,
  QUALITY_MEDIUM,
} from "mediabunny";
export class VideoEncoder {
  public background: CanvasImageSourceWebCodecs | undefined;
  private canvas: OffscreenCanvas;
  private ctx: OffscreenCanvasRenderingContext2D;
  private source: CanvasSource;
  private framerate: number;
  private width: number;
  private height: number;
  private timestamp: number = 0;
  private output: Output<Mp4OutputFormat, BufferTarget>;
  constructor(input: {
    width: number;
    height: number;
    background?: CanvasImageSourceWebCodecs; //Image under every frame
    framerate?: number; //Frames per second
  }) {
    const { width, height, background, framerate = 30 } = input;
    this.framerate = 1 / framerate;
    this.canvas = new OffscreenCanvas(width, height);
    this.width = width;
    this.height = height;
    this.ctx = this.canvas.getContext("2d")!;
    this.source = new CanvasSource(this.canvas, {
      codec: "avc",
      bitrate: QUALITY_MEDIUM,
    });
    this.background = background;
    this.output = new Output({
      format: new Mp4OutputFormat(),
      target: new BufferTarget(),
    });
    this.output.addVideoTrack(this.source, {
      frameRate: framerate,
    });
    this.output.start();
  }
  /**
   * Adds image(s) to the video
   * @param canvases - Images to be stacked ontop of each other and then used as the frame
   */
  async addFrame(
    ...canvases: [CanvasImageSourceWebCodecs[]] | CanvasImageSourceWebCodecs[]
  ) {
    canvases = canvases.flat();
    const ctx = this.ctx;
    ctx.clearRect(0, 0, this.width, this.height);
    if (this.background) ctx.drawImage(this.background, 0, 0);
    for (const canvas of canvases) {
      ctx.drawImage(canvas, 0, 0);
    }
    await this.source.add(this.timestamp, this.framerate);
    this.timestamp += this.framerate;
  }
  async createVideo() {
    const output = this.output;
    await output.finalize();
    const buffer = output.target.buffer!;
    const video = new Blob([buffer], {
      type: "video/mp4",
    });
    return video;
  }
}
