import { dialog, ipcMain } from "electron";
import { copyFileSync } from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";
import type {
  AnnotationInput,
  AppSettings,
  ChatRequest,
  ImportAnnotationsPayload,
  ProviderKind,
  TranslateRequest
} from "../shared/types";
import type { AppPaths } from "./storage/app-paths";
import { LibraryDatabase } from "./storage/database";
import { ProviderManager } from "./providers/provider-manager";
import { translateWithAppleSystem } from "./system-translation";

export function registerIpcHandlers(
  database: LibraryDatabase,
  providerManager: ProviderManager,
  appPaths: AppPaths
): void {
  ipcMain.handle("books:list", () => database.listBooks());

  ipcMain.handle("books:import", async () => {
    const result = await dialog.showOpenDialog({
      title: "Import EPUB",
      properties: ["openFile"],
      filters: [{ name: "EPUB books", extensions: ["epub"] }]
    });

    if (result.canceled || result.filePaths.length === 0) {
      return null;
    }

    const sourcePath = result.filePaths[0];
    const id = randomUUID();
    const fileName = `${id}.epub`;
    const destinationPath = path.join(appPaths.booksDir, fileName);
    copyFileSync(sourcePath, destinationPath);

    const originalName = path.basename(sourcePath, path.extname(sourcePath));
    return database.createBook({
      id,
      title: originalName,
      fileName,
      filePath: destinationPath
    });
  });

  ipcMain.handle(
    "books:updateMetadata",
    (_event, bookId: string, metadata: { title: string; author?: string }) =>
      database.updateBookMetadata(bookId, metadata)
  );

  ipcMain.handle("books:markOpened", (_event, bookId: string) => {
    database.markBookOpened(bookId);
  });

  ipcMain.handle("reading:getLocation", (_event, bookId: string) =>
    database.getReadingLocation(bookId)
  );

  ipcMain.handle("reading:saveLocation", (_event, bookId: string, cfi: string) => {
    database.saveReadingLocation(bookId, cfi);
  });

  ipcMain.handle("annotations:list", (_event, bookId: string) =>
    database.listAnnotations(bookId)
  );

  ipcMain.handle("annotations:create", (_event, input: AnnotationInput) =>
    database.createAnnotation(input)
  );

  ipcMain.handle("annotations:remove", (_event, annotationId: string) => {
    database.removeAnnotation(annotationId);
  });

  ipcMain.handle("annotations:export", (_event, bookId: string) =>
    database.exportAnnotations(bookId)
  );

  ipcMain.handle(
    "annotations:import",
    (_event, payload: ImportAnnotationsPayload) =>
      database.importAnnotations(payload.bookId, payload.annotations)
  );

  ipcMain.handle("settings:get", () => database.getSettings());

  ipcMain.handle("settings:update", (_event, settings: AppSettings) =>
    database.saveSettings(settings)
  );

  ipcMain.handle("settings:validate", (_event, providerId: ProviderKind) =>
    providerManager.validate(providerId)
  );

  ipcMain.handle("ai:translate", (_event, request: TranslateRequest) =>
    providerManager.translate(request)
  );

  ipcMain.handle("translation:translate", async (_event, request: TranslateRequest) => {
    try {
      return await translateWithAppleSystem(request);
    } catch (error) {
      return {
        ok: false,
        providerId: "apple-system",
        text: "",
        error: formatSystemTranslationError(error)
      };
    }
  });

  ipcMain.handle("ai:chat", (_event, request: ChatRequest) =>
    providerManager.chat(request)
  );
}

function formatSystemTranslationError(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);

  if (message.includes("Unable to Translate")) {
    return "Apple Translation is unavailable for this selection right now.";
  }

  return message;
}
