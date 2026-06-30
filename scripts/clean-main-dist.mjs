import { rmSync } from "node:fs";
import { resolve } from "node:path";

rmSync(resolve("dist/main"), { force: true, recursive: true });
