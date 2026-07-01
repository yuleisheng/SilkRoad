import type { ReactNode } from "react";

interface MarkdownMessageProps {
  content: string;
}

type MarkdownBlock =
  | { type: "paragraph"; text: string }
  | { type: "heading"; level: 2 | 3 | 4; text: string }
  | { type: "quote"; text: string }
  | { type: "list"; ordered: boolean; items: string[] }
  | { type: "code"; language?: string; text: string };

export function MarkdownMessage({ content }: MarkdownMessageProps) {
  return (
    <div className="markdown-message">
      {parseBlocks(content).map((block, index) => renderBlock(block, index))}
    </div>
  );
}

function renderBlock(block: MarkdownBlock, index: number): ReactNode {
  if (block.type === "heading") {
    const HeadingTag = `h${block.level}` as "h2" | "h3" | "h4";
    return (
      <HeadingTag key={index}>
        {renderInline(block.text, `heading-${index}`)}
      </HeadingTag>
    );
  }

  if (block.type === "quote") {
    return (
      <blockquote key={index}>
        {renderMultilineInline(block.text, `quote-${index}`)}
      </blockquote>
    );
  }

  if (block.type === "list") {
    const ListTag = block.ordered ? "ol" : "ul";
    return (
      <ListTag key={index}>
        {block.items.map((item, itemIndex) => (
          <li key={itemIndex}>{renderInline(item, `list-${index}-${itemIndex}`)}</li>
        ))}
      </ListTag>
    );
  }

  if (block.type === "code") {
    return (
      <pre key={index}>
        {block.language ? <span>{block.language}</span> : null}
        <code>{block.text}</code>
      </pre>
    );
  }

  return <p key={index}>{renderMultilineInline(block.text, `paragraph-${index}`)}</p>;
}

function parseBlocks(markdown: string): MarkdownBlock[] {
  const lines = markdown.replace(/\r\n?/g, "\n").split("\n");
  const blocks: MarkdownBlock[] = [];
  let index = 0;

  while (index < lines.length) {
    const line = lines[index];

    if (!line.trim()) {
      index += 1;
      continue;
    }

    const fence = line.match(/^```(\S*)\s*$/);
    if (fence) {
      const codeLines: string[] = [];
      index += 1;
      while (index < lines.length && !lines[index].startsWith("```")) {
        codeLines.push(lines[index]);
        index += 1;
      }
      if (index < lines.length) {
        index += 1;
      }
      blocks.push({
        type: "code",
        language: fence[1] || undefined,
        text: codeLines.join("\n")
      });
      continue;
    }

    const heading = line.match(/^(#{1,4})\s+(.+)$/);
    if (heading) {
      blocks.push({
        type: "heading",
        level: Math.min(Math.max(heading[1].length + 1, 2), 4) as 2 | 3 | 4,
        text: heading[2].trim()
      });
      index += 1;
      continue;
    }

    if (/^\s*>\s?/.test(line)) {
      const quoteLines: string[] = [];
      while (index < lines.length && /^\s*>\s?/.test(lines[index])) {
        quoteLines.push(lines[index].replace(/^\s*>\s?/, ""));
        index += 1;
      }
      blocks.push({ type: "quote", text: quoteLines.join("\n").trim() });
      continue;
    }

    const listMatch = line.match(/^(\s*)([-*+]|\d+[.)])\s+(.+)$/);
    if (listMatch) {
      const ordered = /\d+[.)]/.test(listMatch[2]);
      const items: string[] = [];
      while (index < lines.length) {
        const itemMatch = lines[index].match(/^(\s*)([-*+]|\d+[.)])\s+(.+)$/);
        if (!itemMatch || /\d+[.)]/.test(itemMatch[2]) !== ordered) {
          break;
        }
        items.push(itemMatch[3].trim());
        index += 1;
      }
      blocks.push({ type: "list", ordered, items });
      continue;
    }

    const paragraphLines: string[] = [];
    while (index < lines.length && lines[index].trim()) {
      if (
        /^```/.test(lines[index]) ||
        /^(#{1,4})\s+/.test(lines[index]) ||
        /^\s*>\s?/.test(lines[index]) ||
        /^(\s*)([-*+]|\d+[.)])\s+/.test(lines[index])
      ) {
        break;
      }
      paragraphLines.push(lines[index]);
      index += 1;
    }

    blocks.push({ type: "paragraph", text: paragraphLines.join("\n") });
  }

  return blocks;
}

function renderMultilineInline(text: string, keyPrefix: string): ReactNode[] {
  const lines = text.split("\n");
  return lines.flatMap((line, index) => [
    ...renderInline(line, `${keyPrefix}-${index}`),
    ...(index < lines.length - 1 ? [<br key={`${keyPrefix}-break-${index}`} />] : [])
  ]);
}

function renderInline(text: string, keyPrefix: string): ReactNode[] {
  const nodes: ReactNode[] = [];
  let index = 0;

  const pushText = (value: string) => {
    if (value) {
      nodes.push(value);
    }
  };

  while (index < text.length) {
    if (text.startsWith("**", index)) {
      const end = text.indexOf("**", index + 2);
      if (end > index + 2) {
        nodes.push(
          <strong key={`${keyPrefix}-strong-${index}`}>
            {renderInline(text.slice(index + 2, end), `${keyPrefix}-strong-${index}`)}
          </strong>
        );
        index = end + 2;
        continue;
      }
    }

    if (text[index] === "`") {
      const end = text.indexOf("`", index + 1);
      if (end > index + 1) {
        nodes.push(<code key={`${keyPrefix}-code-${index}`}>{text.slice(index + 1, end)}</code>);
        index = end + 1;
        continue;
      }
    }

    if (text[index] === "*" && text[index + 1] !== "*") {
      const end = text.indexOf("*", index + 1);
      if (end > index + 1) {
        nodes.push(
          <em key={`${keyPrefix}-em-${index}`}>
            {renderInline(text.slice(index + 1, end), `${keyPrefix}-em-${index}`)}
          </em>
        );
        index = end + 1;
        continue;
      }
    }

    if (text[index] === "[") {
      const link = parseLink(text, index);
      if (link) {
        nodes.push(
          <a key={`${keyPrefix}-link-${index}`} href={link.href} target="_blank" rel="noreferrer">
            {renderInline(link.label, `${keyPrefix}-link-${index}`)}
          </a>
        );
        index = link.end;
        continue;
      }
    }

    const url = parseAutolink(text, index);
    if (url) {
      nodes.push(
        <a key={`${keyPrefix}-url-${index}`} href={url.href} target="_blank" rel="noreferrer">
          {url.href}
        </a>
      );
      index = url.end;
      continue;
    }

    const nextMarker = findNextMarker(text, index + 1);
    pushText(text.slice(index, nextMarker));
    index = nextMarker;
  }

  return nodes;
}

function parseLink(text: string, start: number): { label: string; href: string; end: number } | null {
  const closeLabel = text.indexOf("]", start + 1);
  if (closeLabel < 0 || text[closeLabel + 1] !== "(") {
    return null;
  }

  const closeHref = text.indexOf(")", closeLabel + 2);
  if (closeHref < 0) {
    return null;
  }

  const href = text.slice(closeLabel + 2, closeHref).trim();
  if (!isSafeUrl(href)) {
    return null;
  }

  return {
    label: text.slice(start + 1, closeLabel),
    href,
    end: closeHref + 1
  };
}

function parseAutolink(text: string, start: number): { href: string; end: number } | null {
  const match = text.slice(start).match(/^https?:\/\/[^\s<>()]+/);
  if (!match) {
    return null;
  }

  const href = match[0].replace(/[.,;:!?]+$/, "");
  return {
    href,
    end: start + href.length
  };
}

function isSafeUrl(url: string): boolean {
  return /^https?:\/\//i.test(url);
}

function findNextMarker(text: string, start: number): number {
  const markerIndexes = ["**", "`", "*", "[", "http://", "https://"]
    .map((marker) => text.indexOf(marker, start))
    .filter((markerIndex) => markerIndex >= 0);

  return markerIndexes.length ? Math.min(...markerIndexes) : text.length;
}
