import { net, protocol } from "electron";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { LibraryDatabase } from "./storage/database";

export function registerBookProtocol(database: LibraryDatabase): void {
  protocol.handle("silkroad-book", async (request) => {
    const url = new URL(request.url);

    if (url.hostname === "book") {
      const bookId = decodeURIComponent(url.pathname.replace(/^\/+/, "")).replace(
        /\.epub$/i,
        ""
      );

      if (!bookId) {
        return new Response("Invalid SilkRoad book URL.", { status: 400 });
      }

      const filePath = database.getBookFilePath(bookId);
      if (!filePath) {
        return new Response("Book not found.", { status: 404 });
      }

      return fetchLocalFile(filePath, "application/epub+zip");
    }

    if (url.hostname === "cover") {
      const bookId = decodeURIComponent(url.pathname.replace(/^\/+/, ""));
      if (!bookId) {
        return new Response("Invalid SilkRoad cover URL.", { status: 400 });
      }

      const filePath = database.getBookCoverFilePath(bookId);
      if (!filePath) {
        return new Response("Cover not found.", { status: 404 });
      }

      return fetchLocalFile(filePath, getImageContentType(filePath));
    }

    return new Response("Invalid SilkRoad URL.", { status: 400 });
  });
}

async function fetchLocalFile(filePath: string, contentType: string): Promise<Response> {
  const response = await net.fetch(pathToFileURL(filePath).toString());
  return new Response(response.body, {
    headers: {
      "content-type": contentType
    },
    status: response.status,
    statusText: response.statusText
  });
}

function getImageContentType(filePath: string): string {
  switch (path.extname(filePath).toLowerCase()) {
    case ".avif":
      return "image/avif";
    case ".gif":
      return "image/gif";
    case ".jpg":
    case ".jpeg":
      return "image/jpeg";
    case ".png":
      return "image/png";
    case ".svg":
      return "image/svg+xml";
    case ".webp":
      return "image/webp";
    default:
      return "application/octet-stream";
  }
}
