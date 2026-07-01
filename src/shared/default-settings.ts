import type { AppSettings } from "./types";

export const DEFAULT_SETTINGS: AppSettings = {
  appLanguage: "zh-CN",
  defaultChatProvider: "openrouter",
  providers: {
    openrouter: {
      id: "openrouter",
      label: "OpenRouter",
      model: "",
      baseUrl: "https://openrouter.ai/api/v1"
    },
    "openai-compatible": {
      id: "openai-compatible",
      label: "OpenAI Compatible",
      model: "",
      baseUrl: "https://api.openai.com/v1"
    },
    "ollama-cloud": {
      id: "ollama-cloud",
      label: "Ollama Cloud",
      model: "",
      baseUrl: "https://ollama.com"
    },
    "codex-subscription": {
      id: "codex-subscription",
      label: "Codex Subscription",
      model: "",
      experimental: true
    }
  }
};
