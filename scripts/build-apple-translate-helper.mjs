import { mkdirSync } from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";

const rootDir = path.resolve(import.meta.dirname, "..");
const sourcePath = path.join(
  rootDir,
  "native",
  "apple-translate",
  "SilkRoadTranslationUI.swift"
);
const outputDir = path.join(rootDir, "dist", "main", "helpers");
const outputPath = path.join(outputDir, "silkroad-translation-ui");
const moduleCachePath = path.join("/private", "tmp", "silkroad-swift-module-cache");

mkdirSync(outputDir, { recursive: true });
mkdirSync(moduleCachePath, { recursive: true });

const result = spawnSync(
  "swiftc",
  ["-parse-as-library", sourcePath, "-o", outputPath],
  {
    cwd: rootDir,
    env: {
      ...process.env,
      CLANG_MODULE_CACHE_PATH: moduleCachePath
    },
    encoding: "utf8"
  }
);

if (result.status !== 0) {
  const detail = [result.stderr, result.stdout].filter(Boolean).join("\n").trim();
  console.warn(
    `[build] Apple Translation helper was not built.${detail ? `\n${detail}` : ""}`
  );
}
