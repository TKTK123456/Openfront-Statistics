import { Game } from "../../OpenFrontIO/src/core/game/Game";
import { MapData } from "../../OpenFrontIO/src/core/game/GameMapLoader";
import { buildTerrainRGBA } from "../../OpenFrontIO/src/client/render/gl/utils/ColorUtils";

export interface GradientStop {
  stop: number;
  color: [number, number, number, number];
}
export interface heatmapConfig {
  radius?: number;
  frequencieMultiplier?: number;
}
/**
 * A color gradient represented as an ordered array of color stops.
 * Each stop specifies a normalized position (0–1) and an RGBA color.
 * Colors for intermediate values are produced by linearly interpolating
 * between the surrounding stops.
 */
export type Gradient = GradientStop[];
export class heatmapCreator {
  private radius = 10;
  private radiusSq = this.radius ** 2;
  public game: Game;
  public width: number;
  public height: number;
  public map: MapData;
  public compact: boolean;
  static defaultGradient: Gradient = [
    { stop: 0, color: [10, 20, 90, 160] }, // dark blue
    { stop: 0.3, color: [0, 0, 255, 188.5] }, // blue
    { stop: 0.5, color: [0, 255, 255, 207.5] }, // cyan
    { stop: 0.7, color: [0, 255, 0, 226.5] }, // lime
    { stop: 1, color: [255, 0, 0, 255] }, // red
  ];
  public gradient: Gradient;
  constructor(map: MapData, game: Game, compact: boolean, gradient?: Gradient) {
    this.game = game;
    this.width = game.width();
    this.height = game.height();
    this.map = map;
    this.compact = compact;
    if (gradient) {
      this.gradient = gradient;
    } else {
      this.gradient = heatmapCreator.defaultGradient;
    }
  }

  private backGroundCache: Map<string, Uint8ClampedArray> = new Map();
  async mapBackground() {
    const mapName = (await this.map.manifest()).name;
    if (this.backGroundCache.has(mapName)) {
      return this.backGroundCache.get(mapName);
    }
    const width = this.width;
    const height = this.height;
    let mapArray = await (this.compact
      ? this.map.map4xBin()
      : this.map.mapBin());
    const background = new Uint8ClampedArray(
      buildTerrainRGBA(mapArray, width, height),
    );
    this.backGroundCache.set(mapName, background);
    return background;
  }

  async create(
    tileFrequencies: Map<number, number>,
    config: heatmapConfig = { frequencieMultiplier: 0.01, radius: this.radius },
  ) {
    let radiusSq: number;
    let { frequencieMultiplier, radius } = config;
    if (radius === undefined) radius = this.radius;
    if (radius !== this.radius) radiusSq = radius ** 2;
    else radiusSq = this.radiusSq;
    if (frequencieMultiplier === undefined) frequencieMultiplier = 0.01;
    const width = this.width;
    const height = this.height;
    const background = await this.mapBackground();
    if (!background) return;
    return createHeatmap({
      tileFrequencies,
      width,
      height,
      radius,
      radiusSq,
      gradient: this.gradient,
      base: background,
      frequencieMultiplier,
    });
  }
}
export function lerp(a: number, b: number, t: number) {
  return a + (b - a) * t;
}
export function interpolateColor(
  t: number,
  gradient: Gradient,
): [number, number, number, number] {
  t = Math.max(0, Math.min(1, t));
  let start = gradient[0];
  let end = gradient[gradient.length - 1];
  for (let i = 0; i < gradient.length - 1; i++) {
    if (t >= gradient[i].stop && t <= gradient[i + 1].stop) {
      start = gradient[i];
      end = gradient[i + 1];
      break;
    }
  }
  const localT = (t - start.stop) / (end.stop - start.stop);

  // Interpolate each channel
  const r = Math.round(lerp(start.color[0], end.color[0], localT));
  const g = Math.round(lerp(start.color[1], end.color[1], localT));
  const b = Math.round(lerp(start.color[2], end.color[2], localT));
  const a = Math.round(lerp(start.color[3], end.color[3], localT));

  return [r, g, b, a];
}
export function createHeatmap(options: {
  tileFrequencies:
    | Map<number, number>
    | { tiles: Int32Array; counts: Float64Array };
  width: number;
  height: number;
  radius: number;
  radiusSq: number;
  gradient: Gradient;
  base: Uint8ClampedArray | null;
  frequencieMultiplier?: number;
  noFinalLayer: true;
}): { heatmap: Uint8ClampedArray; mask: Uint8Array };
export function createHeatmap(options: {
  tileFrequencies:
    | Map<number, number>
    | { tiles: Int32Array; counts: Float64Array };
  width: number;
  height: number;
  radius: number;
  radiusSq: number;
  gradient: Gradient;
  base: Uint8ClampedArray | null;
  frequencieMultiplier?: number;
  noFinalLayer?: false;
}): Uint8ClampedArray;
export function createHeatmap(options: {
  tileFrequencies:
    | Map<number, number>
    | { tiles: Int32Array; counts: Float64Array };
  width: number;
  height: number;
  radius: number;
  radiusSq: number;
  gradient: Gradient;
  base: Uint8ClampedArray | null;
  frequencieMultiplier?: number;
  noFinalLayer?: boolean;
}): Uint8ClampedArray | { heatmap: Uint8ClampedArray; mask: Uint8Array } {
  let {
    tileFrequencies,
    width,
    height,
    radius,
    radiusSq,
    gradient,
    base,
    frequencieMultiplier,
    noFinalLayer,
  } = options;
  if (frequencieMultiplier === undefined) {
    frequencieMultiplier = 0.01;
  }
  let heatAlpha = new Float32Array(width * height);
  let maxHeat = 0;
  if (tileFrequencies instanceof Map) {
    tileFrequencies = {
      tiles: Int32Array.from(tileFrequencies.keys()),
      counts: Float64Array.from(tileFrequencies.values()),
    };
  }
  const { counts, tiles } = tileFrequencies;
  for (let k = 0; k < tiles.length; k++) {
    const ref = tiles[k];
    const value = counts[k] * frequencieMultiplier;

    const x = ref % width;
    const y = (ref / width) | 0;

    const xStart = Math.max(0, Math.floor(x - radius));
    const xEnd = Math.min(width - 1, Math.ceil(x + radius));
    const yStart = Math.max(0, Math.floor(y - radius));
    const yEnd = Math.min(height - 1, Math.ceil(y + radius));
    for (let py = yStart; py <= yEnd; py++) {
      for (let px = xStart; px <= xEnd; px++) {
        const dx = px - x;
        const dy = py - y;
        const distSq = dx * dx + dy * dy;

        if (distSq > radiusSq) continue;

        const norm = Math.sqrt(distSq) / radius;
        heatAlpha[py * width + px] += value * Math.exp(-3 * norm * norm);
      }
    }
  }

  for (const value of heatAlpha) {
    if (value > maxHeat) maxHeat = value;
  }
  const out = new Uint8ClampedArray(width * height * 4);

  const denom = maxHeat > 0 ? Math.log2(maxHeat + 1) : 0;
  const mask = new Uint8Array(Math.ceil((width * height) / 8));
  for (let i = 0; i < width * height; i++) {
    const idx = i * 4;
    if (noFinalLayer && heatAlpha[i] === 0) {
      const byte = i >> 3;
      const bit = i & 7;

      mask[byte] |= 1 << bit;
      out[idx] = 0;
      out[idx + 1] = 0;
      out[idx + 2] = 0;
      out[idx + 3] = 0;
      continue;
    }
    const alpha = maxHeat > 0 ? Math.log2(heatAlpha[i] + 1) / denom : 0;

    const [r, g, b, a] = interpolateColor(alpha, gradient);

    const ha = a / 255;
    let frameBase: number[];
    if (base !== null)
      frameBase = [base[idx], base[idx + 1], base[idx + 2], 255];
    else {
      out[idx] = r;
      out[idx + 1] = g;
      out[idx + 2] = b;
      out[idx + 3] = a;
      continue;
    }
    if (ha === 0) {
      out[idx] = frameBase[0];
      out[idx + 1] = frameBase[1];
      out[idx + 2] = frameBase[2];
      out[idx + 3] = frameBase[3];
      continue;
    }

    out[idx] = Math.round(r * ha + frameBase[0] * (1 - ha));
    out[idx + 1] = Math.round(g * ha + frameBase[1] * (1 - ha));
    out[idx + 2] = Math.round(b * ha + frameBase[2] * (1 - ha));
    out[idx + 3] = frameBase[3];
  }
  if (noFinalLayer) return { heatmap: out, mask };
  return out;
}
