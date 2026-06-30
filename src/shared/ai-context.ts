import type { ReaderContext, SearchResult } from "./types";

export const MAX_SELECTED_TEXT_CHARS = 8_000;
export const MAX_CHAPTER_TEXT_CHARS = 12_000;
export const MAX_SEARCH_RESULTS = 5;

export function truncateMiddle(text: string, maxChars: number): string {
  if (text.length <= maxChars) {
    return text;
  }

  const headLength = Math.floor(maxChars * 0.6);
  const tailLength = maxChars - headLength - 32;
  return `${text.slice(0, headLength)}\n\n[...truncated...]\n\n${text.slice(
    -tailLength
  )}`;
}

export function buildReaderContextBlock(context: ReaderContext): string {
  const selectedText = truncateMiddle(
    context.selectedText.trim(),
    MAX_SELECTED_TEXT_CHARS
  );
  const chapterText = context.currentChapterText
    ? truncateMiddle(context.currentChapterText.trim(), MAX_CHAPTER_TEXT_CHARS)
    : "";

  return [
    context.bookTitle ? `Book: ${context.bookTitle}` : undefined,
    selectedText ? `Selected text:\n${selectedText}` : undefined,
    chapterText ? `Current chapter excerpt:\n${chapterText}` : undefined
  ]
    .filter(Boolean)
    .join("\n\n");
}

export function formatSearchResults(results: SearchResult[]): string {
  return results
    .slice(0, MAX_SEARCH_RESULTS)
    .map((result, index) => {
      const url = result.url ? `\nURL: ${result.url}` : "";
      return `${index + 1}. ${result.title}${url}\n${result.snippet}`;
    })
    .join("\n\n");
}

export function buildChatUserPrompt(
  userMessage: string,
  context: ReaderContext,
  searchResults: SearchResult[]
): string {
  const sections = [
    buildReaderContextBlock(context),
    searchResults.length > 0
      ? `Web search results:\n${formatSearchResults(searchResults)}`
      : undefined,
    `User question:\n${userMessage}`
  ].filter(Boolean);

  return sections.join("\n\n---\n\n");
}

export function buildTranslationPrompt(
  text: string,
  targetLanguage: string,
  context?: ReaderContext
): string {
  const contextBlock = context ? buildReaderContextBlock(context) : "";
  return [
    `Translate the selected passage into ${targetLanguage}.`,
    "Preserve meaning, tone, names, and formatting where practical.",
    contextBlock ? `Reading context:\n${contextBlock}` : undefined,
    `Text to translate:\n${truncateMiddle(text.trim(), MAX_SELECTED_TEXT_CHARS)}`
  ]
    .filter(Boolean)
    .join("\n\n");
}
