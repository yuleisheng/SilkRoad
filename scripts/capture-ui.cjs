const { app, BrowserWindow } = require("electron");
const fs = require("node:fs/promises");
const path = require("node:path");

const baseUrl = process.argv[2] || "http://127.0.0.1:5174/?demo=1";
const outputDir =
  process.argv[3] || path.resolve(__dirname, "..", "artifacts", "ui-review");

app.commandLine.appendSwitch("disable-gpu");

app.whenReady().then(async () => {
  await fs.mkdir(outputDir, { recursive: true });

  const win = new BrowserWindow({
    width: 1280,
    height: 820,
    show: false,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true
    }
  });

  await step("load library", () => loadScreen(win, "library"));
  await step("screenshot library", () => screenshot(win, "01-library.png"));

  await step("load settings", () => loadScreen(win, "settings"));
  await step("screenshot settings", () => screenshot(win, "02-settings.png"));

  await step("load reader notes", () => loadScreen(win, "reader", "annotations"));
  await step("screenshot reader notes", () => screenshot(win, "03-reader-notes.png"));

  await step("open reader translation popover", async () => {
    await clickText(win, "翻译");
    await wait(350);
  });
  await step("screenshot translation popover", () =>
    screenshot(win, "04-reader-translation-popover.png")
  );

  await step("load reader ai", () => loadScreen(win, "reader", "ai"));
  await step("screenshot ai", () => screenshot(win, "05-reader-ai.png"));

  win.destroy();
  app.quit();
}).catch((error) => {
  console.error(error);
  app.quit();
});

async function loadScreen(win, screen, tab) {
  const url = new URL(baseUrl);
  url.searchParams.set("demo", "1");
  url.searchParams.set("demoScreen", screen);
  if (tab) {
    url.searchParams.set("demoTab", tab);
  }
  await win.loadURL(url.toString());
  await wait(500);
}

async function step(label, fn) {
  console.log(`[capture] ${label}`);
  try {
    return await fn();
  } catch (error) {
    error.message = `[${label}] ${error.message}`;
    throw error;
  }
}

async function screenshot(win, fileName) {
  const image = await win.webContents.capturePage();
  await fs.writeFile(path.join(outputDir, fileName), image.toPNG());
}

async function clickSelector(win, selector) {
  await exec(
    win,
    `
      const el = document.querySelector(${JSON.stringify(selector)});
      if (!el) throw new Error('Missing selector: ${selector}');
      el.click();
    `
  );
}

async function clickText(win, text) {
  await exec(
    win,
    `
      const text = ${JSON.stringify(text)};
      const candidates = Array.from(document.querySelectorAll('button, .book-tile'));
      const el = candidates.find((item) => item.textContent && item.textContent.includes(text));
      if (!el) throw new Error('Missing text: ' + text);
      el.click();
    `
  );
}

async function clickTab(win, text) {
  await exec(
    win,
    `
      const text = ${JSON.stringify(text)};
      const el = Array.from(document.querySelectorAll('.tabs button'))
        .find((item) => item.textContent && item.textContent.includes(text));
      if (!el) throw new Error('Missing tab: ' + text);
      el.click();
    `
  );
}

async function exec(win, source) {
  return win.webContents.executeJavaScript(source, true);
}

function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
