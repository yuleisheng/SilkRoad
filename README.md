# SilkRoad

SilkRoad is a lightweight, macOS-first EPUB reader for people who read local
DRM-free books and want selection-first tools without the rest of Apple Books.

The app is intentionally small: import an EPUB, read it locally, highlight a
passage, attach a note, translate selected text with the native Apple
Translation UI, or ask an AI model about the passage you are reading.

## Status

SilkRoad is an early v1 Electron app. The core reading loop works, but the
project is still evolving and should be treated as a personal-reader prototype
rather than a polished store-distributed macOS app.

## Features

- Local EPUB library for DRM-free `.epub` files
- Real EPUB cover extraction when available
- Paginated reading with EPUB CFI progress restore
- Mouse and keyboard page navigation
- Selection popup for highlight, inline notes, native translation, and AI chat
- Saved highlights and notes stored locally
- AI chat with streamed responses and rich Markdown rendering
- Selection context injected into chat messages
- Intent-based web search for providers that support it
- App language setting for Simplified Chinese, English, Spanish, French, and Japanese
- API keys stored only in the Electron main process with `safeStorage`

## Tech Stack

- Electron
- React
- TypeScript
- Vite
- epub.js
- SQLite through `better-sqlite3`

## Requirements

- macOS
- Node.js and npm
- DRM-free EPUB files

Apple Translation requires a macOS version where the system Translation UI is
available. AI chat requires a configured model provider.

## Development

Install dependencies:

```bash
npm install
```

Run the app in development:

```bash
npm run dev
```

Run checks:

```bash
npm run typecheck
npm test
npm run build
```

Build a macOS package:

```bash
npm run dist
```

## Model Providers

Configure the provider from Settings. SilkRoad currently supports:

- OpenRouter
- OpenAI-compatible APIs
- Ollama Cloud

OpenRouter uses an OpenAI-compatible chat completions endpoint. When a message
looks like it needs current information, SilkRoad enables OpenRouter's native
web-search path by appending `:online` to the configured model name.

OpenAI-compatible providers are used for chat only. Set the base URL, model
name, and API key for your provider.

Ollama Cloud defaults to `https://ollama.com` and calls:

- `/api/chat`
- `/api/web_search`
- `/api/web_fetch`
- `/api/tags` for the Settings health check

Use the model name returned by Ollama Cloud's model list. The Settings `Check`
button validates the API key and model name before you read.

## Translation

SilkRoad uses Apple's built-in Translation UI for selected text instead of
routing translation through an AI provider. This keeps translation fast,
familiar, and free when the macOS system service is available.

## Privacy And Storage

- Books are copied into the local SilkRoad library.
- Reading progress, annotations, settings, and messages are stored locally.
- API keys are stored in the main process and encrypted with Electron
  `safeStorage` when the platform supports it.
- The renderer only talks to the main process through a narrow preload IPC API.
- EPUB content is treated as untrusted book content.

SilkRoad does not provide cloud sync, accounts, a bookstore, DRM handling, PDF
support, or MOBI support.

## License

SilkRoad is licensed under GPL-3.0-only. See [LICENSE](LICENSE).
