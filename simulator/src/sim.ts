import { createGameRunner, GameRunner } from "../OpenFrontIO/src/core/GameRunner";
import { GameStartInfo, GameStartInfoSchema, Turn, TurnSchema,  } from "../OpenFrontIO/src/core/Schemas";
import { MapManifest } from "../OpenFrontIO/src/core/game/TerrainMapLoader";
import { GameMapType } from "../OpenFrontIO/src/core/game/Game"
import { GameMapLoader, MapData } from "../OpenFrontIO/src/core/game/GameMapLoader"; 
import fs from "fs"
import path from "path"
import { fileURLToPath } from "url";
import { ErrorUpdate, GameUpdateViewData } from "../OpenFrontIO/src/core/game/GameUpdates";
import { decompressGameRecord } from "../OpenFrontIO/src/core/Util";

const PROJECT_ROOT = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../OpenFrontIO",
);

async function fetchGame(id: string): Promise<[GameStartInfo | undefined, Turn[]]> {
  let res = await fetch("https://api.openfront.io/public/game/" + id);
  const json = await res.json();
  const startInfo = GameStartInfoSchema.safeParse(json.info)
  const turns = decompressGameRecord(json).turns
  return [startInfo.data, turns]
}

const gameInfo = await fetchGame("rJTLpUjY")
//console.log(gameInfo)

class gameMapLoader implements GameMapLoader {
  constructor(private mapsDir: string) {}

  getMapData(map: GameMapType): MapData {
    const key = Object.keys(GameMapType).find(
      (k) => GameMapType[k as keyof typeof GameMapType] === map,
    );
    if (key === undefined) {
      throw new Error(`unknown map: ${map}`);
    }
    const dir = path.join(this.mapsDir, key.toLowerCase());
    const readBin = (name: string) => async () =>
      new Uint8Array(fs.readFileSync(path.join(dir, name)));
    return {
      mapBin: readBin("map.bin"),
      map4xBin: readBin("map4x.bin"),
      map16xBin: readBin("map16x.bin"),
      manifest: async () =>
        JSON.parse(
          fs.readFileSync(path.join(dir, "manifest.json"), "utf8"),
        ) as MapManifest,
      webpPath: path.join(dir, "thumbnail.webp"),
    };
  }
}
const mapLoader = new gameMapLoader(
    path.join(PROJECT_ROOT, "/resources/maps"),
  );
let gameRunner: Promise<GameRunner> | null = null;
let gr: GameRunner;
const gameUpdate = function(g: GameUpdateViewData | ErrorUpdate) {
  if (gr.game.ticks()<1000||gr.game.ticks() !% 100) return
  console.log(gr.game.allPlayers().filter(p => {
    return p.tiles().size > 1000
  }).map(p=>{
    return p.name()
  }))
  console.log(gr.game.ticks()+"/"+gameInfo[1].length)
}

if (gameInfo[0] !== undefined) {
  gameRunner = createGameRunner(gameInfo[0], undefined, mapLoader, gameUpdate).then((gr) => {return gr;});
  gr = await gameRunner;
  console.log(gameInfo[1].length)
  for (let turnNum = 0; turnNum < gameInfo[1].length; turnNum++) {
    const turn = gameInfo[1][turnNum]
    gr.addTurn(turn)
    gr.executeNextTick()
  }
  console.log("Done")
}