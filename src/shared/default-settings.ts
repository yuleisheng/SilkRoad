import type { AppSettings } from "./types";

export const DEFAULT_SETTINGS: AppSettings = {
  appLanguage: "zh-CN",
  defaultChatProvider: "openrouter",
  providers: {
    openrouter: {
      id: "openrouter",
      label: "OpenRouter",
      enabled: true,
      model: "",
      baseUrl: "https://openrouter.ai/api/v1"
    },
    "openai-compatible": {
      id: "openai-compatible",
      label: "OpenAI Compatible",
      enabled: false,
      model: "",
      baseUrl: "https://api.openai.com/v1"
    },
    "ollama-cloud": {
      id: "ollama-cloud",
      label: "Ollama Cloud",
      enabled: false,
      model: "",
      baseUrl: "https://ollama.com"
    },
    "codex-subscription": {
      id: "codex-subscription",
      label: "Codex Subscription",
      enabled: false,
      model: "",
      experimental: true
    }
  }
};
