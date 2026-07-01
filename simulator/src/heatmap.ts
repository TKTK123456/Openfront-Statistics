import { Game } from "../OpenFrontIO/src/core/game/Game";
import { MapData } from "../OpenFrontIO/src/core/game/GameMapLoader";
export class heatmapCreator {
  private radius = 10;
  private radiusSq = this.radius ** 2;
  public game: Game;
  public width: number;
  public height: number;
  public map: MapData;
  public compact: boolean;
  constructor(map: MapData, game: Game, compact: boolean) {
    this.game = game;
    this.width = game.width();
    this.height = game.height();
    this.map = map;
    this.compact = compact;
  }

  private backGroundCache: Map<string, Uint8ClampedArray> = new Map();
  async mapBackground() {
    const mapName = (await this.map.manifest()).name;
    if (this.backGroundCache.has(mapName)) {
      return this.backGroundCache.get(mapName);
    }
    const width = this.width;
    const height = this.height;
    const radius = this.radius;
    let mapArray = await (this.compact
      ? this.map.map4xBin()
      : this.map.mapBin());
    const background = new Uint8ClampedArray(width * height * 4);
    for (let i = 0; i < mapArray.length; i++) {
      const v = mapArray[i];
      const j = i * 4;
      background[j] = v;
      background[j + 1] = v;
      background[j + 2] = v;
      background[j + 3] = 255;
    }
    this.backGroundCache.set(mapName, background);
    return background;
  }

  async create(tileFrequencies: Map<number, number>) {
    if (tileFrequencies.size === 0) return await this.mapBackground();
    const game = this.game;
    const width = this.width;
    const height = this.height;
    const radius = this.radius;
    const radiusSq = this.radiusSq;
    const heatAlpha = new Float32Array(width * height);
    for (const tileFrequency of tileFrequencies.entries()) {
      const x = game.x(tileFrequency[0]);
      const y = game.y(tileFrequency[0]);
      const value = tileFrequency[1] * 0.01;
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

          const dist = Math.sqrt(distSq);
          const norm = dist / radius;
          const intensity = value * Math.exp(-3 * norm * norm);

          const idx = py * width + px;
          heatAlpha[idx] += intensity * (1 - heatAlpha[idx]);
        }
      }
    }
    const heatmapData = new Uint8ClampedArray(width * height * 4);
    for (let i = 0; i < width * height; i++) {
      const alpha = heatAlpha[i];
      const [r, g, b, a] = this.interpolateColor(alpha);

      const idx = i * 4;
      heatmapData[idx] = r;
      heatmapData[idx + 1] = g;
      heatmapData[idx + 2] = b;
      heatmapData[idx + 3] = a;
    }
    const background = await this.mapBackground();
    if (!background) return;
    const heatmap = new Uint8ClampedArray(width * height * 4);
    for (let i = 0; i < heatmapData.length; i += 4) {
      const ha = heatmapData[i + 3] / 255;

      const br = background[i];
      const bg = background[i + 1];
      const bb = background[i + 2];
      if (ha === 0) {
        heatmap[i] = br;
        heatmap[i + 1] = bg;
        heatmap[i + 2] = bb;
        heatmap[i + 3] = 255;
        continue;
      }
      const hr = heatmapData[i];
      const hg = heatmapData[i + 1];
      const hb = heatmapData[i + 2];
      heatmap[i] = Math.round(hr * ha + br * (1 - ha));
      heatmap[i + 1] = Math.round(hg * ha + bg * (1 - ha));
      heatmap[i + 2] = Math.round(hb * ha + bb * (1 - ha));
      heatmap[i + 3] = 255;
    }
    return heatmap;
  }
  private lerp(a: number, b: number, t: number) {
    return a + (b - a) * t;
  }
  private interpolateColor(t: number) {
    const gradient = [
      { stop: 0, color: [0, 0, 255, 0] }, // transparent blue
      { stop: 0.3, color: [0, 0, 255, 255] }, // blue
      { stop: 0.5, color: [0, 255, 255, 255] }, // cyan
      { stop: 0.7, color: [0, 255, 0, 255] }, // lime
      { stop: 1, color: [255, 0, 0, 255] }, // red
    ];
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
    const r = Math.round(this.lerp(start.color[0], end.color[0], localT));
    const g = Math.round(this.lerp(start.color[1], end.color[1], localT));
    const b = Math.round(this.lerp(start.color[2], end.color[2], localT));
    const a = Math.round(this.lerp(start.color[3], end.color[3], localT));

    return [r, g, b, a];
  }
}
