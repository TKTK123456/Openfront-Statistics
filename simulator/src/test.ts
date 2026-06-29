import ffmpeg from "ffmpeg";
import path from "path";
import fs from "fs";
import { fileURLToPath } from "url";
import { exec } from "child_process";

const gameID = "24cQJmGp";

let heatmapFolderPath = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  `../out/${gameID}/`,
);
exec(
  `ffmpeg -y -framerate 10 -i ${heatmapFolderPath}%04d.png -c:v libx264 -pix_fmt yuv420p ${heatmapFolderPath}output.mp4`,
  (err, stdout, stderr) => {
    console.log(stdout);
    if (err) console.error(err);
    else console.log("Video created!");
  },
);
