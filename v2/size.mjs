// Prints the server bundle size and whether video.js got bundled.
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

const files = [];
const walk = (dir) => {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) walk(p);
    else if (p.endsWith(".mjs")) files.push(p);
  }
};
walk(".output/server");
const bytes = files.reduce((n, f) => n + statSync(f).size, 0);
const videojs = files.some((f) => readFileSync(f, "utf8").includes("videojs-vtt"));
console.log(`\nserver bundle: ${Math.round(bytes / 1024)} KB, video.js bundled: ${videojs ? "YES" : "no"}\n`);
