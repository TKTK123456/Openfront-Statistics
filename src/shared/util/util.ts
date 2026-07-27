import {
  GameStartInfo,
  Turn,
  GameStartInfoSchema,
} from "../../../OpenFrontIO/src/core/Schemas";
import { decompressGameRecord } from "../../../OpenFrontIO/src/core/Util";

export function interpolateFrames(
  frames: Map<number, number>[],
  factor: number,
): Map<number, number>[] {
  if (frames.length <= 1 || factor <= 1) return frames;

  const result: Map<number, number>[] = [];

  for (let i = 0; i < frames.length - 1; i++) {
    const current = frames[i];
    const next = frames[i + 1];

    // Original frame
    result.push(current);

    // Interpolated frames
    for (let step = 1; step < factor; step++) {
      const t = step / factor;
      const interpolated = new Map<number, number>();

      const keys = new Set([...current.keys(), ...next.keys()]);

      for (const key of keys) {
        const a = current.get(key) ?? 0;
        const b = next.get(key) ?? 0;

        const value = a + (b - a) * t;

        interpolated.set(key, value);
      }

      result.push(interpolated);
    }
  }
  result.push(frames[frames.length - 1]);

  return result;
}

export function mapsToBinary(maps: Map<number, number>[]): Uint32Array {
  let length = 1; // number of maps

  for (const map of maps) {
    length += 1 + map.size * 2;
  }

  const data = new Uint32Array(length);

  let i = 0;
  data[i++] = maps.length;

  for (const map of maps) {
    data[i++] = map.size;

    for (const [key, value] of map) {
      data[i++] = key;
      data[i++] = value;
    }
  }

  return data;
}

export function binaryToMaps(data: Uint32Array): Map<number, number>[] {
  let i = 0;
  const mapCount = data[i++];

  const maps: Map<number, number>[] = [];

  for (let m = 0; m < mapCount; m++) {
    const size = data[i++];
    const map = new Map<number, number>();

    for (let j = 0; j < size; j++) {
      map.set(data[i++], data[i++]);
    }

    maps.push(map);
  }

  return maps;
}

export async function fetchGame(
  id: string,
): Promise<[GameStartInfo | undefined, Turn[]]> {
  let res = await fetch("https://api.openfront.io/public/game/" + id);
  const json = await res.json();
  const startInfo = GameStartInfoSchema.safeParse(json.info);
  const turns = decompressGameRecord(json).turns;
  return [startInfo.data, turns];
}

export function mapToBinary(map: Map<number, number>): Uint32Array {
  const data = new Uint32Array(1 + map.size * 2);

  data[0] = map.size;

  let i = 1;
  for (const [key, value] of map) {
    data[i++] = key;
    data[i++] = value;
  }

  return data;
}

export function binaryToMap(data: Uint32Array): Map<number, number> {
  const size = data[0];
  const map = new Map<number, number>();

  let i = 1;
  for (let j = 0; j < size; j++) {
    map.set(data[i++], data[i++]);
  }

  return map;
}

export function combineBuffer(buffers: Buffer[]): Buffer {
  let totalLength = 0;
  for (const buf of buffers) {
    totalLength += 4 + buf.length; // 4 bytes for length prefix + data length
  }

  const combinedBuffer = Buffer.alloc(totalLength);
  let offset = 0;

  for (const buf of buffers) {
    combinedBuffer.writeUInt32BE(buf.length, offset); // Write 4-byte prefix
    offset += 4;
    buf.copy(combinedBuffer, offset); // Copy the actual buffer data
    offset += buf.length;
  }
  return combinedBuffer;
}
export function decodeCombinedBuffer(data: Uint8Array): Uint8Array[] {
  const result: Uint8Array[] = [];
  let readOffset = 0;

  while (readOffset < data.length) {
    // Read 4-byte big-endian length prefix
    const length =
      (data[readOffset] << 24) |
      (data[readOffset + 1] << 16) |
      (data[readOffset + 2] << 8) |
      data[readOffset + 3];

    readOffset += 4;

    // Extract data
    const part = data.subarray(readOffset, readOffset + length);
    result.push(part);

    readOffset += length;
  }

  return result;
}

export class TileRefs {
  private readonly refToX: number[];
  private readonly refToY: number[];
  constructor(width: number, height: number) {
    let ref = 0;
    this.refToX = new Array(width * height);
    this.refToY = new Array(width * height);
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        this.refToX[ref] = x;
        this.refToY[ref] = y;
        ref++;
      }
    }
  }
  x(tile: number) {
    return this.refToX[tile];
  }
  y(tile: number) {
    return this.refToY[tile];
  }
}

export function intersectMasks(masks: Uint8Array[]): Uint8Array {
  if (masks.length === 0) {
    return new Uint8Array();
  }

  const length = Math.min(...masks.map((mask) => mask.length));
  const result = new Uint8Array(length);

  for (let i = 0; i < length; i++) {
    let value = 0xff;

    for (const mask of masks) {
      value &= mask[i];
    }

    result[i] = value;
  }

  return result;
}
