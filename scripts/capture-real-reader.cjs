const { app, BrowserWindow } = require("electron");
const fs = require("node:fs/promises");
const os = require("node:os");
const path = require("node:path");

const outputPath =
  process.argv[2] ||
  path.resolve(__dirname, "..", "artifacts", "ui-review", "real-reader.png");
const userDataDir =
  process.argv[3] ||
  path.join(os.homedir(), "Library", "Application Support", "silkroad");

app.setName("silkroad");
app.setPath("userData", userDataDir);
app.commandLine.appendSwitch("disable-gpu");

app
  .whenReady()
  .then(async () => {
    const appPaths = {
      userDataDir,
      databasePath: path.join(userDataDir, "silkroad.sqlite3"),
      booksDir: path.join(userDataDir, "books"),
      exportsDir: path.join(userDataDir, "exports")
    };
    const { LibraryDatabase } = require("../dist/main/main/storage/database.js");
    const { registerBookProtocol } = require("../dist/main/main/book-protocol.js");
    const { registerIpcHandlers } = require("../dist/main/main/ipc.js");
    const { ProviderManager } = require("../dist/main/main/providers/provider-manager.js");

    const database = new LibraryDatabase(appPaths.databasePath);
    registerBookProtocol(database);
    registerIpcHandlers(database, new ProviderManager(database), appPaths);

    const win = new BrowserWindow({
      width: 1600,
      height: 1000,
      show: false,
      webPreferences: {
        preload: path.resolve(__dirname, "..", "dist", "main", "preload", "preload.js"),
        contextIsolation: true,
        nodeIntegration: false,
        sandbox: true,
        webSecurity: true
      }
    });

    win.webContents.on("console-message", (_event, level, message) => {
      console.log(`[renderer:${level}] ${message}`);
    });

    await win.loadFile(path.resolve(__dirname, "..", "dist", "renderer", "index.html"));
    await wait(600);
    await exec(
      win,
      `
        const firstBook = document.querySelector('.book-tile');
        if (!firstBook) throw new Error('No imported books found.');
        firstBook.click();
      `
    );
    await waitForReader(win);

    const info = await exec(
      win,
      `
        ({
          hasIframe: Boolean(document.querySelector('.epub-viewer iframe')),
          hasError: Boolean(document.querySelector('.reader-error')),
          errorText: document.querySelector('.reader-error')?.textContent || '',
          bodyText: document.body.innerText.slice(0, 500)
        })
      `
    );
    console.log(JSON.stringify(info, null, 2));

    await fs.mkdir(path.dirname(outputPath), { recursive: true });
    const image = await win.webContents.capturePage();
    await fs.writeFile(outputPath, image.toPNG());

    win.destroy();
    database.close();
    app.quit();
  })
  .catch((error) => {
    console.error(error);
    app.quit();
  });

async function waitForReader(win) {
  const deadline = Date.now() + 7000;
  while (Date.now() < deadline) {
    const done = await exec(
      win,
      `
        Boolean(document.querySelector('.reader-error')) ||
        (Boolean(document.querySelector('.epub-viewer iframe')) &&
         !document.querySelector('.reader-loading'))
      `
    );
    if (done) {
      return;
    }
    await wait(250);
  }
}

async function exec(win, source) {
  return win.webContents.executeJavaScript(source, true);
}

function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
