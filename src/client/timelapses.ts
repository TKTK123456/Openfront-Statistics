import { interpolateFrames } from "src/shared/util";

type RenderResult = {
  idx: number;
  buffer: ArrayBuffer;
};

type Job = {
  idx: number;
  timelapseId: number;
  resolve: (img: ArrayBuffer) => void;
  reject: (err: Error) => void;
  width: number;
  height: number;
};

type WorkerState = {
  worker: Worker;
  busy: boolean;
  job?: Job;
};

class TimelapseDB {
  private db!: IDBDatabase;
  private readonly dbName = "timelapses";
  private storeName = "frames";

  async init() {
    if (this.db) return;

    this.db = await new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open(this.dbName, 1);

      request.onerror = () => reject(request.error);

      request.onupgradeneeded = () => {
        const db = request.result;

        if (!db.objectStoreNames.contains(this.storeName)) {
          db.createObjectStore(this.storeName);
        }
      };

      request.onsuccess = () => resolve(request.result);
    });
    this.db
      .transaction(this.storeName, "readwrite")
      .objectStore(this.storeName)
      .clear();
  }

  async put(key: string, value: ArrayBuffer) {
    await this.init();

    return new Promise<void>((resolve, reject) => {
      const tx = this.db.transaction(this.storeName, "readwrite");
      const store = tx.objectStore(this.storeName);

      store.put(value, key);

      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  }

  async get(key: string): Promise<ArrayBuffer | undefined> {
    await this.init();

    return new Promise((resolve, reject) => {
      const tx = this.db.transaction(this.storeName, "readonly");
      const store = tx.objectStore(this.storeName);

      const request = store.get(key);

      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  }

  async delete(key: string) {
    await this.init();

    return new Promise<void>((resolve, reject) => {
      const tx = this.db.transaction(this.storeName, "readwrite");
      tx.objectStore(this.storeName).delete(key);

      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  }

  async clear() {
    await this.init();

    return new Promise<void>((resolve, reject) => {
      const tx = this.db.transaction(this.storeName, "readwrite");
      tx.objectStore(this.storeName).clear();

      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  }
  static createKey(timelapseId: number, idx: number) {
    return `${timelapseId}:${idx}`;
  }
}

export class Timelapse {
  static Cache: TimelapseDB;
  private cache: TimelapseDB;
  static numberOfTimelapses = 0;
  private id: number;
  static totalWorkerCount: number = 0;
  static Workers: WorkerState[] = [];
  private workers: WorkerState[];
  static Queue: Job[] = [];
  private queue: Job[];

  private width: number;
  private height: number;
  static Frames: Map<number, number>[][] = [];
  private frames: Map<number, number>[][];
  /** Resolves when every frame has been rendered */
  public ready: boolean = false;
  public onFinish: (self: Timelapse) => void;

  constructor(options: {
    width: number;
    height: number;
    frames: Map<number, number>[];
    workerCount?: number;
    onFinish?: (self: Timelapse) => void;
  }) {
    let { width, height, frames, workerCount, onFinish } = options;
    if (workerCount === undefined) {
      workerCount = navigator.hardwareConcurrency ?? 4;
    }
    if (onFinish === undefined) {
      onFinish = (self: Timelapse) => {};
    }
    this.workers = Timelapse.Workers;
    this.queue = Timelapse.Queue;
    this.id = Timelapse.numberOfTimelapses++;
    this.width = width;
    this.height = height;
    this.onFinish = onFinish;
    this.frames = Timelapse.Frames;
    this.frames.push(frames);
    this.cache = Timelapse.Cache ?? new TimelapseDB();
    Timelapse.Cache = this.cache;
    for (
      ;
      Timelapse.totalWorkerCount < workerCount;
      Timelapse.totalWorkerCount++
    ) {
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
        Timelapse.dispatch();
        return;
      }

      try {
        await this.cache.put(
          TimelapseDB.createKey(job.timelapseId, job.idx),
          e.data.buffer,
        );
        job.resolve(e.data.buffer);
      } catch (err) {
        job.reject(err instanceof Error ? err : new Error(String(err)));
      }

      Timelapse.dispatch();
    };

    worker.onerror = (err) => {
      const job = state.job;

      state.job = undefined;
      state.busy = false;

      if (job) {
        job.reject(new Error(err.message));
      }

      Timelapse.dispatch();
    };

    this.workers.push(state);
  }

  /**
   * Render every frame and wait until all are cached
   */
  private async preloadAll() {
    const promises: Promise<ArrayBuffer>[] = [];

    for (let i = 0; i < this.frames[this.id].length; i++) {
      promises.push(this.render(i));
    }

    await Promise.all(promises);
    this.ready = true;
    this.onFinish(this);
  }

  /**
   * Instant after preload finishes
   */
  drawFrame(
    idx: number,
    notRendered?: (value: ArrayBuffer) => void,
  ): Promise<ArrayBuffer | undefined> | undefined {
    const frame = this.cache.get(TimelapseDB.createKey(this.id, idx));

    if (!frame || frame === undefined) {
      console.log("hi1");
      this.bringToFrontOfQueue(idx)?.then(() => {
        console.log("hi");
      });
      return undefined;
    }
    return frame;
  }

  private render(idx: number): Promise<ArrayBuffer> {
    if (
      this.queue.findIndex(
        (j) => j.idx === idx && j.timelapseId === this.id,
      ) === -1
    ) {
      const out = this.bringToFrontOfQueue(idx);
      if (out !== undefined) return out;
    }
    return new Promise((resolve, reject) => {
      this.queue.push({
        idx,
        timelapseId: this.id,
        resolve,
        reject,
        height: this.height,
        width: this.width,
      });
      Timelapse.dispatch();
    });
  }

  static dispatch() {
    while (this.Queue.length) {
      const state = this.Workers.find((w) => !w.busy);

      if (!state) return;

      const job = this.Queue.shift()!;

      state.busy = true;
      state.job = job;

      state.worker.postMessage({
        idx: job.idx,
        frame: this.Frames[job.timelapseId][job.idx],
        width: job.width,
        height: job.height,
      });
    }
  }
  public bringToFrontOfQueue(idx: number): Promise<ArrayBuffer> | undefined {
    const jobIdx = this.queue.findIndex(
      (j) => j.idx === idx && j.timelapseId === this.id,
    );
    if (jobIdx === -1) return;
    const [job] = this.queue.splice(jobIdx, 1);
    return new Promise((resolve, reject) => {
      const oldResolve = job.resolve;
      job.resolve = (img: ArrayBuffer) => {
        resolve(img);
        oldResolve(img);
      };
      const oldReject = job.reject;
      job.reject = (err: Error) => {
        reject(err);
        oldReject(err);
      };
      this.queue.unshift(job);
      Timelapse.dispatch();
    });
  }
  get frameCount() {
    return this.frames[this.id].length;
  }
}
