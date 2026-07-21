import {
  GameStartInfo,
  Turn,
  GameStartInfoSchema,
} from "../../OpenFrontIO/src/core/Schemas";
import { decompressGameRecord } from "../../OpenFrontIO/src/core/Util";

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
