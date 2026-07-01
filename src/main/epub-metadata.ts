import { readFile } from "node:fs/promises";
import path from "node:path";
import { DOMParser } from "@xmldom/xmldom";
import JSZip from "jszip";

export interface ExtractedEpubMetadata {
  title?: string;
  author?: string;
  cover?: {
    data: Buffer;
    extension: string;
    mediaType: string;
  };
}

interface ManifestItem {
  id: string;
  href: string;
  mediaType: string;
  properties: string;
}

type XmlDocument = ReturnType<DOMParser["parseFromString"]>;
type XmlElement =
  ReturnType<XmlDocument["getElementsByTagName"]> extends ArrayLike<infer ElementType>
    ? ElementType
    : never;

export async function extractEpubMetadata(
  epubPath: string
): Promise<ExtractedEpubMetadata> {
  const zip = await JSZip.loadAsync(await readFile(epubPath));
  const packagePath = await getPackagePath(zip);
  if (!packagePath) {
    return {};
  }

  const packageFile = findZipFile(zip, [packagePath]);
  const packageXml = await packageFile?.async("text");
  if (!packageXml) {
    return {};
  }

  const packageDocument = parseXml(packageXml);
  const metadata: ExtractedEpubMetadata = {
    title: getFirstText(packageDocument, "title"),
    author: getFirstText(packageDocument, "creator")
  };
  const coverHref = getCoverHref(packageDocument);
  if (!coverHref) {
    return metadata;
  }

  const coverPath = resolveZipPath(path.posix.dirname(packagePath), coverHref);
  const coverFile = findZipFile(zip, getZipPathCandidates(coverPath));
  if (!coverFile) {
    return metadata;
  }

  const mediaType = getMediaType(coverPath);
  metadata.cover = {
    data: await coverFile.async("nodebuffer"),
    extension: getImageExtension(mediaType, coverPath),
    mediaType
  };

  return metadata;
}

async function getPackagePath(zip: JSZip): Promise<string | null> {
  const containerFile = findZipFile(zip, ["META-INF/container.xml"]);
  const containerXml = await containerFile?.async("text");
  if (!containerXml) {
    return null;
  }

  const containerDocument = parseXml(containerXml);
  const rootfile =
    getElements(containerDocument, "rootfile").find(
      (element) =>
        element.getAttribute("media-type") === "application/oebps-package+xml"
    ) ?? getElements(containerDocument, "rootfile")[0];

  return rootfile?.getAttribute("full-path") ?? null;
}

function getCoverHref(packageDocument: XmlDocument): string | null {
  const manifestItems = getElements(packageDocument, "item").map(
    (element): ManifestItem => ({
      id: element.getAttribute("id") ?? "",
      href: element.getAttribute("href") ?? "",
      mediaType: element.getAttribute("media-type") ?? "",
      properties: element.getAttribute("properties") ?? ""
    })
  );

  const coverMetaId = getElements(packageDocument, "meta")
    .find((element) => element.getAttribute("name") === "cover")
    ?.getAttribute("content");
  const coverByMeta = coverMetaId
    ? manifestItems.find((item) => item.id === coverMetaId)
    : undefined;
  if (coverByMeta?.href) {
    return coverByMeta.href;
  }

  return (
    manifestItems.find((item) => hasProperty(item.properties, "cover-image")) ??
    manifestItems.find((item) => isImageItem(item) && item.id.toLowerCase() === "cover") ??
    manifestItems.find(
      (item) =>
        isImageItem(item) &&
        (item.id.toLowerCase().includes("cover") ||
          item.href.toLowerCase().includes("cover"))
    )
  )?.href ?? null;
}

function getElements(document: XmlDocument, localName: string): XmlElement[] {
  return Array.from(document.getElementsByTagName("*")).filter(
    (element) => getLocalName(element) === localName
  );
}

function getFirstText(document: XmlDocument, localName: string): string | undefined {
  const text = getElements(document, localName)[0]?.textContent?.trim();
  return text || undefined;
}

function getLocalName(element: XmlElement): string {
  return element.localName || element.nodeName.split(":").at(-1) || element.nodeName;
}

function hasProperty(properties: string, property: string): boolean {
  return properties.split(/\s+/).includes(property);
}

function isImageItem(item: ManifestItem): boolean {
  return item.mediaType.startsWith("image/") || /\.(avif|gif|jpe?g|png|svg|webp)$/i.test(item.href);
}

function parseXml(xml: string): XmlDocument {
  return new DOMParser().parseFromString(xml, "application/xml");
}

function resolveZipPath(basePath: string, href: string): string {
  const [pathPart] = href.split("#");
  return normalizeZipPath(path.posix.join(basePath, pathPart));
}

function normalizeZipPath(zipPath: string): string {
  return path.posix.normalize(zipPath).replace(/^\/+/, "").replace(/^\.\//, "");
}

function getZipPathCandidates(zipPath: string): string[] {
  const candidates = [zipPath];
  try {
    candidates.push(decodeURIComponent(zipPath));
  } catch {
    // Some EPUBs contain literal percent characters in file names.
  }
  return [...new Set(candidates.map(normalizeZipPath))];
}

function findZipFile(zip: JSZip, candidates: string[]) {
  for (const candidate of candidates) {
    const directMatch = zip.file(candidate);
    if (directMatch) {
      return directMatch;
    }
  }

  const lowerCandidates = new Set(candidates.map((candidate) => candidate.toLowerCase()));
  return Object.values(zip.files).find(
    (file) => !file.dir && lowerCandidates.has(file.name.toLowerCase())
  );
}

function getMediaType(filePath: string): string {
  const extension = path.extname(filePath).toLowerCase();
  switch (extension) {
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

function getImageExtension(mediaType: string, filePath: string): string {
  const extension = path.extname(filePath).toLowerCase();
  if (extension) {
    return extension;
  }

  switch (mediaType) {
    case "image/avif":
      return ".avif";
    case "image/gif":
      return ".gif";
    case "image/jpeg":
      return ".jpg";
    case "image/png":
      return ".png";
    case "image/svg+xml":
      return ".svg";
    case "image/webp":
      return ".webp";
    default:
      return ".img";
  }
}
