# SilkRoad

SilkRoad is a lightweight macOS EPUB reader inspired by the quiet parts of Apple Books. It keeps the local reading workflow and adds selection-first tools: highlight, note, translate, and AI chat with optional web search.

## Status

This is a v1 Electron implementation scaffold with real app boundaries:

- Electron + React + TypeScript + Vite
- DRM-free EPUB reading through `epubjs`
- Local SQLite library, reading progress, highlights, notes, settings, and message tables
- Main-process-only API key storage through Electron `safeStorage`
- Provider adapters for OpenRouter, OpenAI-compatible APIs, Ollama Cloud, and an experimental Codex subscription path
- Renderer access through a narrow preload IPC API

## Development

```bash
npm install
npm run dev
```

Useful checks:

```bash
npm run typecheck
npm test
npm run build
```

## Provider Notes

- OpenRouter uses the OpenAI-compatible chat completions surface and appends `:online` to the model when web search is enabled.
- Ollama Cloud uses `https://ollama.com/api/chat`, `https://ollama.com/api/web_search`, and `https://ollama.com/api/web_fetch`.
- Codex subscription support is experimental. It uses the Codex SDK and relies on an existing local Codex login. SilkRoad does not read, copy, or save `~/.codex/auth.json`.

## Scope

V1 targets macOS and DRM-free EPUB files. It does not implement cloud sync, accounts, DRM, PDF, MOBI, or a bookstore.
