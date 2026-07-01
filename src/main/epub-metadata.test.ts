import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import JSZip from "jszip";
import { extractEpubMetadata } from "./epub-metadata";

describe("extractEpubMetadata", () => {
  it("extracts title, author, and manifest cover image", async () => {
    const zip = new JSZip();
    zip.file(
      "META-INF/container.xml",
      `<?xml version="1.0"?>
       <container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container">
         <rootfiles>
           <rootfile full-path="OPS/package.opf" media-type="application/oebps-package+xml"/>
         </rootfiles>
       </container>`
    );
    zip.file(
      "OPS/package.opf",
      `<?xml version="1.0"?>
       <package xmlns="http://www.idpf.org/2007/opf" version="3.0">
         <metadata xmlns:dc="http://purl.org/dc/elements/1.1/">
           <dc:title>Real Cover Book</dc:title>
           <dc:creator>Cover Person</dc:creator>
           <meta name="cover" content="cover-image"/>
         </metadata>
         <manifest>
           <item id="cover-image" href="images/cover.jpg" media-type="image/jpeg"/>
         </manifest>
       </package>`
    );
    const coverData = Buffer.from([0xff, 0xd8, 0xff, 0xdb]);
    zip.file("OPS/images/cover.jpg", coverData);

    const tempDir = await mkdtemp(path.join(tmpdir(), "silkroad-epub-test-"));
    const epubPath = path.join(tempDir, "book.epub");
    await writeFile(epubPath, await zip.generateAsync({ type: "nodebuffer" }));

    const metadata = await extractEpubMetadata(epubPath);

    expect(metadata.title).toBe("Real Cover Book");
    expect(metadata.author).toBe("Cover Person");
    expect(metadata.cover?.extension).toBe(".jpg");
    expect(metadata.cover?.mediaType).toBe("image/jpeg");
    expect(metadata.cover?.data.equals(coverData)).toBe(true);
  });
});
