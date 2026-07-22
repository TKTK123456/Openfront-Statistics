import { interpolateFrames } from "src/shared/util";

type RenderResult = {
  idx: number;
  buffer: ArrayBuffer;
};

type Job = {
  idx: number;
  resolve: (img: ArrayBuffer) => void;
  reject: (err: Error) => void;
};

type WorkerState = {
  worker: Worker;
  busy: boolean;
  job?: Job;
};

class TimelapseDB {
  private db!: IDBDatabase;
  private dbName: string;
  private readonly storeName = "frames";

  constructor(name: string) {
    this.dbName = name;
  }

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
    this.db.transaction(this.storeName, "readwrite").objectStore(this.storeName).clear()
  }

  async put(key: number, value: ArrayBuffer) {
    await this.init();

    return new Promise<void>((resolve, reject) => {
      const tx = this.db.transaction(this.storeName, "readwrite");
      const store = tx.objectStore(this.storeName);

      store.put(value, key);

      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  }

  async get(key: number): Promise<ArrayBuffer | undefined> {
    await this.init();

    return new Promise((resolve, reject) => {
      const tx = this.db.transaction(this.storeName, "readonly");
      const store = tx.objectStore(this.storeName);

      const request = store.get(key);

      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  }

  async delete(key: number) {
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
}

export class Timelapse {
  private cache: TimelapseDB;
  static numberOfTimelapses = 0;
  private id: number;
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
    this.id = Timelapse.numberOfTimelapses++;
    this.width = width;
    this.height = height;
    this.frames = frames
    this.cache = new TimelapseDB(`${this.id}`);
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
    await this.cache.put(job.idx, e.data.buffer);
    job.resolve(e.data.buffer);
  } catch (err) {
    job.reject(err instanceof Error ? err : new Error(String(err)));
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
    await this.cache.clear();
    const promises: Promise<ArrayBuffer>[] = [];

    for (let i = 0; i < this.frames.length; i++) {
      promises.push(this.render(i));
    }

    await Promise.all(promises);
    this.ready = true;
  }

  /**
   * Instant after preload finishes
   */
  async drawFrame(idx: number): Promise<ArrayBuffer | undefined> {
    const frame = await this.cache.get(idx);

    if (!frame || frame === undefined) {
      throw new Error(
        `Frame ${idx} not loaded yet. Await timelapse.ready first.`,
      );
    }
    return frame;
  }

  private render(idx: number): Promise<ArrayBuffer> {
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
