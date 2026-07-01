import { describe, expect, it } from "vitest";
import { shouldUseWebSearch } from "./search-intent";

describe("web search intent", () => {
  it("does not search for ordinary reading questions", () => {
    expect(shouldUseWebSearch("Explain this passage in simpler terms.")).toBe(false);
    expect(shouldUseWebSearch("这段话是什么意思？")).toBe(false);
  });

  it("detects explicit external research intent", () => {
    expect(shouldUseWebSearch("Search the web for recent context.")).toBe(true);
    expect(shouldUseWebSearch("查一下这个概念的最新资料")).toBe(true);
  });
});
