import { execFileSync, spawnSync } from "node:child_process";
import { copyFileSync, existsSync, mkdirSync, rmSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const { appBuilderPath } = require("app-builder-bin");
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, "..");
const sourceSvg = path.join(rootDir, "assets", "icon.svg");
const buildDir = path.join(rootDir, "build");
const iconsetDir = path.join(buildDir, "icon.iconset");
const basePng = path.join(buildDir, "icon.png");
const icnsPath = path.join(buildDir, "icon.icns");
const appBuilderIconDir = path.join(buildDir, ".icon-icns");

if (!existsSync(sourceSvg)) {
  throw new Error(`Missing icon source: ${sourceSvg}`);
}

mkdirSync(buildDir, { recursive: true });
rmSync(iconsetDir, { recursive: true, force: true });
mkdirSync(iconsetDir, { recursive: true });

rasterizeSvg();

const iconsetFiles = [
  ["icon_16x16.png", 16],
  ["icon_16x16@2x.png", 32],
  ["icon_32x32.png", 32],
  ["icon_32x32@2x.png", 64],
  ["icon_128x128.png", 128],
  ["icon_128x128@2x.png", 256],
  ["icon_256x256.png", 256],
  ["icon_256x256@2x.png", 512],
  ["icon_512x512.png", 512],
  ["icon_512x512@2x.png", 1024]
];

for (const [fileName, size] of iconsetFiles) {
  resizePng(size, path.join(iconsetDir, fileName));
}

generateIcns();

console.log(`Generated ${path.relative(rootDir, basePng)}`);
if (existsSync(icnsPath)) {
  console.log(`Generated ${path.relative(rootDir, icnsPath)}`);
}

function rasterizeSvg() {
  if (commandExists("rsvg-convert")) {
    run("rsvg-convert", ["-w", "1024", "-h", "1024", sourceSvg, "-o", basePng]);
    return;
  }

  if (commandExists("magick")) {
    run("magick", [sourceSvg, "-resize", "1024x1024", basePng]);
    return;
  }

  throw new Error("Install rsvg-convert or ImageMagick to rasterize assets/icon.svg.");
}

function resizePng(size, outPath) {
  if (commandExists("magick")) {
    run("magick", [
      basePng,
      "-resize",
      `${size}x${size}`,
      "-strip",
      "-define",
      "png:color-type=6",
      outPath
    ]);
    return;
  }

  run("sips", ["-z", String(size), String(size), basePng, "--out", outPath]);
}

function generateIcns() {
  rmSync(appBuilderIconDir, { recursive: true, force: true });
  mkdirSync(appBuilderIconDir, { recursive: true });

  const output = execFileSync(
    appBuilderPath,
    [
      "icon",
      "--format",
      "icns",
      "--root",
      rootDir,
      "--out",
      appBuilderIconDir,
      "--input",
      basePng
    ],
    { encoding: "utf8" }
  );
  const result = JSON.parse(output);
  const generatedIcon = result.icons?.[0]?.file;
  if (!generatedIcon) {
    throw new Error("app-builder did not return an ICNS file.");
  }

  copyFileSync(generatedIcon, icnsPath);
  rmSync(appBuilderIconDir, { recursive: true, force: true });
}

function commandExists(command) {
  return spawnSync("which", [command], { stdio: "ignore" }).status === 0;
}

function run(command, args) {
  execFileSync(command, args, { stdio: "inherit" });
}
