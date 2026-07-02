import { app, BrowserWindow, protocol, shell } from "electron";
import { existsSync } from "node:fs";
import path from "node:path";
import { registerBookProtocol } from "./book-protocol";
import { registerIpcHandlers } from "./ipc";
import { ProviderManager } from "./providers/provider-manager";
import { getAppPaths } from "./storage/app-paths";
import { LibraryDatabase } from "./storage/database";

protocol.registerSchemesAsPrivileged([
  {
    scheme: "silkroad-book",
    privileges: {
      standard: true,
      secure: true,
      corsEnabled: true,
      supportFetchAPI: true,
      stream: true
    }
  }
]);

let mainWindow: BrowserWindow | null = null;
let database: LibraryDatabase | null = null;
const APP_NAME = "SilkRoad";

app.setName(APP_NAME);

async function createWindow(): Promise<void> {
  const distDir = path.resolve(__dirname, "..", "..");
  const preloadPath = path.join(distDir, "main", "preload", "preload.js");
  const rendererIndexPath = path.join(distDir, "renderer", "index.html");
  const iconPath = getDevelopmentIconPath();

  if (iconPath && process.platform === "darwin") {
    app.dock?.setIcon(iconPath);
  }

  mainWindow = new BrowserWindow({
    width: 1280,
    height: 820,
    minWidth: 980,
    minHeight: 680,
    titleBarStyle: "hidden",
    title: APP_NAME,
    trafficLightPosition: { x: 8, y: 16 },
    backgroundColor: "#f6f6f3",
    ...(iconPath ? { icon: iconPath } : {}),
    webPreferences: {
      preload: preloadPath,
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      webSecurity: true
    }
  });

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith("https://") || url.startsWith("http://")) {
      void shell.openExternal(url);
    }
    return { action: "deny" };
  });

  mainWindow.webContents.on("will-navigate", (event, url) => {
    const devServerUrl = process.env.VITE_DEV_SERVER_URL;
    const allowedUrl = devServerUrl ?? `file://${rendererIndexPath}`;
    if (!url.startsWith(allowedUrl)) {
      event.preventDefault();
    }
  });

  if (process.env.VITE_DEV_SERVER_URL) {
    await mainWindow.loadURL(process.env.VITE_DEV_SERVER_URL);
  } else {
    await mainWindow.loadFile(rendererIndexPath);
  }
}

function getDevelopmentIconPath(): string | undefined {
  if (app.isPackaged) {
    return undefined;
  }

  const iconPath = path.join(process.cwd(), "build", "icon.png");
  return existsSync(iconPath) ? iconPath : undefined;
}

app.whenReady().then(async () => {
  const appPaths = getAppPaths();
  database = new LibraryDatabase(appPaths.databasePath);
  registerBookProtocol(database);
  registerIpcHandlers(database, new ProviderManager(database), appPaths);

  await createWindow();

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      void createWindow();
    }
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit();
  }
});

app.on("before-quit", () => {
  database?.close();
  database = null;
});
