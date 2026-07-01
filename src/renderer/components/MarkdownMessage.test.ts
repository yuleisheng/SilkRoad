import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { MarkdownMessage } from "./MarkdownMessage";

describe("MarkdownMessage", () => {
  it("renders common assistant markdown as rich HTML", () => {
    const html = renderToStaticMarkup(
      createElement(MarkdownMessage, {
        content: [
          "This is a **reading note** with *emphasis*.",
          "",
          "> A route is also a habit of attention.",
          "",
          "- First point",
          "- Second point",
          "",
          "Inline `code-style` text and https://example.com links."
        ].join("\n")
      })
    );

    expect(html).toContain("<strong>reading note</strong>");
    expect(html).toContain("<em>emphasis</em>");
    expect(html).toContain("<blockquote>");
    expect(html).toContain("<li>First point</li>");
    expect(html).toContain("<code>code-style</code>");
    expect(html).toContain('href="https://example.com"');
    expect(html).not.toContain("**reading note**");
  });

  it("does not create unsafe javascript links", () => {
    const html = renderToStaticMarkup(
      createElement(MarkdownMessage, {
        content: "[bad](javascript:alert(1))"
      })
    );

    expect(html).not.toContain("href=");
    expect(html).toContain("javascript:alert(1)");
  });
});
