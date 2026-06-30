import type { AppSettings } from "./types";

export const DEFAULT_SETTINGS: AppSettings = {
  targetLanguage: "简体中文",
  defaultChatProvider: "openrouter",
  defaultSearchProvider: "openrouter",
  providers: {
    openrouter: {
      id: "openrouter",
      label: "OpenRouter",
      enabled: true,
      model: "",
      baseUrl: "https://openrouter.ai/api/v1",
      webSearchEnabled: true
    },
    "openai-compatible": {
      id: "openai-compatible",
      label: "OpenAI Compatible",
      enabled: false,
      model: "",
      baseUrl: "https://api.openai.com/v1",
      webSearchEnabled: false
    },
    "ollama-cloud": {
      id: "ollama-cloud",
      label: "Ollama Cloud",
      enabled: false,
      model: "",
      baseUrl: "https://ollama.com",
      webSearchEnabled: true
    },
    "codex-subscription": {
      id: "codex-subscription",
      label: "Codex Subscription",
      enabled: false,
      model: "",
      experimental: true,
      webSearchEnabled: false
    }
  }
};
