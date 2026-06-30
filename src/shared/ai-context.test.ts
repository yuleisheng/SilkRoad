import { describe, expect, it } from "vitest";
import {
  MAX_CHAPTER_TEXT_CHARS,
  buildChatUserPrompt,
  buildReaderContextBlock,
  truncateMiddle
} from "./ai-context";

describe("reader AI context", () => {
  it("keeps selected text and truncates long chapter context", () => {
    const selectedText = "important passage";
    const currentChapterText = "a".repeat(MAX_CHAPTER_TEXT_CHARS + 500);

    const block = buildReaderContextBlock({
      bookTitle: "Test Book",
      selectedText,
      currentChapterText
    });

    expect(block).toContain("Test Book");
    expect(block).toContain(selectedText);
    expect(block).toContain("[...truncated...]");
    expect(block.length).toBeLessThan(MAX_CHAPTER_TEXT_CHARS + 800);
  });

  it("injects search results into the final user prompt", () => {
    const prompt = buildChatUserPrompt(
      "Explain this.",
      { selectedText: "The Silk Road crossed many regions." },
      [
        {
          title: "Source",
          url: "https://example.com",
          snippet: "A short result",
          source: "injected"
        }
      ]
    );

    expect(prompt).toContain("Selected text");
    expect(prompt).toContain("Web search results");
    expect(prompt).toContain("https://example.com");
    expect(prompt).toContain("Explain this.");
  });

  it("truncates in the middle so the end of the passage survives", () => {
    const result = truncateMiddle("0123456789".repeat(20), 60);

    expect(result).toContain("[...truncated...]");
    expect(result.endsWith("6789")).toBe(true);
  });
});
