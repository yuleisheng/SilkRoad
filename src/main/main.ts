import { app, BrowserWindow, protocol, shell } from "electron";
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

async function createWindow(): Promise<void> {
  const distDir = path.resolve(__dirname, "..", "..");
  const preloadPath = path.join(distDir, "main", "preload", "preload.js");
  const rendererIndexPath = path.join(distDir, "renderer", "index.html");

  mainWindow = new BrowserWindow({
    width: 1280,
    height: 820,
    minWidth: 980,
    minHeight: 680,
    titleBarStyle: "customButtonsOnHover",
    trafficLightPosition: { x: 14, y: 16 },
    backgroundColor: "#f6f6f3",
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
