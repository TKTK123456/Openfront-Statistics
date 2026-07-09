import { Worker } from "worker_threads";
import { availableParallelism } from "os";
import { VideoEncoder } from "../visualization/encode";

// Renders frames across a pool of worker threads and writes them to the encoder
// in frame order. Bounds how far dispatch may run ahead of writing so
// out-of-order results can't accumulate in memory.
export async function renderFramesToVideo(params: {
  workerUrl: URL;
  workerData: unknown;
  frameCount: number;
  frameInput: (i: number) => {
    message: Record<string, unknown>;
    transfer: ArrayBuffer[];
  };
  encoder: VideoEncoder; // already opened
  onProgress?: (written: number) => void;
}): Promise<void> {
  const { workerUrl, workerData, frameCount, frameInput, encoder, onProgress } =
    params;
  if (frameCount === 0) return;

  const poolSize = Math.max(1, Math.min(availableParallelism(), frameCount));
  const maxAhead = poolSize + 4; // in-flight cap

  const workers = Array.from(
    { length: poolSize },
    () => new Worker(workerUrl, { workerData }),
  );
  const idle: Worker[] = [];
  const ready = new Map<number, Uint8ClampedArray>();
  let nextToDispatch = 0;
  let nextToWrite = 0;
  let writing = false;

  return new Promise<void>((resolve, reject) => {
    const pump = () => {
      while (
        idle.length > 0 &&
        nextToDispatch < frameCount &&
        nextToDispatch - nextToWrite < maxAhead
      ) {
        const worker = idle.pop()!;
        const i = nextToDispatch++;
        const { message, transfer } = frameInput(i);
        worker.postMessage({ i, ...message }, transfer);
      }
    };

    const flush = async () => {
      if (writing) return;
      writing = true;
      while (ready.has(nextToWrite)) {
        const rgba = ready.get(nextToWrite)!;
        ready.delete(nextToWrite);
        await encoder.writeFrame(rgba);
        onProgress?.(++nextToWrite);
      }
      writing = false;
      pump(); // advancing nextToWrite may reopen the in-flight cap
      if (nextToWrite >= frameCount) {
        await Promise.all(workers.map((w) => w.terminate()));
        resolve();
      }
    };

    for (const worker of workers) {
      worker.on("message", (m: { i: number; rgba: ArrayBuffer }) => {
        ready.set(m.i, new Uint8ClampedArray(m.rgba));
        idle.push(worker);
        pump();
        void flush().catch(reject);
      });
      worker.on("error", reject);
      idle.push(worker);
    }
    pump();
  });
}
