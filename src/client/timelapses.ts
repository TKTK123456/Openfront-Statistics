import { interpolateFrames } from "src/shared/util";

type RenderResult = {
  idx: number;
  buffer: ArrayBuffer;
};

type Job = {
  idx: number;
  resolve: (img: ImageBitmap) => void;
  reject: (err: Error) => void;
};

type WorkerState = {
  worker: Worker;
  busy: boolean;
  job?: Job;
};

export class Timelapse {
  private cache = new Map<number, ImageBitmap>();

  private workers: WorkerState[] = [];
  private queue: Job[] = [];

  private width: number;
  private height: number;
  private frames: Map<number, number>[];

  /** Resolves when every frame has been rendered */
  public ready: boolean = false;

  constructor(
    width: number,
    height: number,
    frames: Map<number, number>[],
    workerCount = navigator.hardwareConcurrency ?? 4,
  ) {
    this.width = width;
    this.height = height;
    this.frames = interpolateFrames(frames, 6);

    for (let i = 0; i < workerCount; i++) {
      this.createWorker();
    }

    // Start loading every frame immediately
    this.preloadAll();
  }

  private createWorker() {
    const worker = new Worker(
      new URL("src/shared/workers/heatmapWorker.ts", import.meta.url),
      {
        type: "module",
      },
    );

    const state: WorkerState = {
      worker,
      busy: false,
    };

    worker.onmessage = async (e: MessageEvent<RenderResult>) => {
      const job = state.job;

      state.job = undefined;
      state.busy = false;

      if (!job) {
        this.dispatch();
        return;
      }

      try {
        const bitmap = await createImageBitmap(
          new Blob([e.data.buffer], {
            type: "image/png",
          }),
        );

        // Keep forever
        this.cache.set(job.idx, bitmap);

        job.resolve(bitmap);
      } catch (err) {
        job.reject(err as Error);
      }

      this.dispatch();
    };

    worker.onerror = (err) => {
      const job = state.job;

      state.job = undefined;
      state.busy = false;

      if (job) {
        job.reject(new Error(err.message));
      }

      this.dispatch();
    };

    this.workers.push(state);
  }

  /**
   * Render every frame and wait until all are cached
   */
  private async preloadAll() {
    const promises: Promise<ImageBitmap>[] = [];

    for (let i = 0; i < this.frames.length; i++) {
      promises.push(this.render(i));
    }

    await Promise.all(promises);
    this.ready = true;
  }

  /**
   * Instant after preload finishes
   */
  async drawFrame(idx: number): Promise<ImageBitmap> {
    const frame = this.cache.get(idx);

    if (!frame) {
      throw new Error(
        `Frame ${idx} not loaded yet. Await timelapse.ready first.`,
      );
    }

    return frame;
  }

  private render(idx: number): Promise<ImageBitmap> {
    return new Promise((resolve, reject) => {
      this.queue.push({
        idx,
        resolve,
        reject,
      });

      this.dispatch();
    });
  }

  private dispatch() {
    while (this.queue.length) {
      const state = this.workers.find((w) => !w.busy);

      if (!state) return;

      const job = this.queue.shift()!;

      state.busy = true;
      state.job = job;

      state.worker.postMessage({
        idx: job.idx,
        frame: this.frames[job.idx],
        width: this.width,
        height: this.height,
      });
    }
  }

  get frameCount() {
    return this.frames.length;
  }
}
