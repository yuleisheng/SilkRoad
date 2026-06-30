import { net, protocol } from "electron";
import { pathToFileURL } from "node:url";
import { LibraryDatabase } from "./storage/database";

export function registerBookProtocol(database: LibraryDatabase): void {
  protocol.handle("silkroad-book", async (request) => {
    const url = new URL(request.url);
    const bookId = decodeURIComponent(url.pathname.replace(/^\/+/, ""));

    if (url.hostname !== "book" || !bookId) {
      return new Response("Invalid SilkRoad book URL.", { status: 400 });
    }

    const filePath = database.getBookFilePath(bookId);
    if (!filePath) {
      return new Response("Book not found.", { status: 404 });
    }

    return net.fetch(pathToFileURL(filePath).toString());
  });
}
