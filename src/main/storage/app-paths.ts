import { app } from "electron";
import { mkdirSync } from "node:fs";
import path from "node:path";

export interface AppPaths {
  userDataDir: string;
  databasePath: string;
  booksDir: string;
  exportsDir: string;
}

export function getAppPaths(): AppPaths {
  const userDataDir = app.getPath("userData");
  const booksDir = path.join(userDataDir, "books");
  const exportsDir = path.join(userDataDir, "exports");

  mkdirSync(booksDir, { recursive: true });
  mkdirSync(exportsDir, { recursive: true });

  return {
    userDataDir,
    databasePath: path.join(userDataDir, "silkroad.sqlite3"),
    booksDir,
    exportsDir
  };
}
