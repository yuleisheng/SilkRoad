import { buildTranslationPrompt } from "../../shared/ai-context";
import type { TranslateRequest } from "../../shared/types";
import { assertApiKey, assertModel, type ChatProvider, type ChatProviderRequest } from "./types";
import { streamOpenAIChatCompletions, toOpenAIMessages } from "./http-stream";
import type { ProviderSettings } from "../../shared/types";

const DEFAULT_BASE_URL = "https://api.openai.com/v1";

export class OpenAICompatibleProvider implements ChatProvider {
  readonly id = "openai-compatible" as const;

  async validateSettings(settings: ProviderSettings) {
    try {
      assertApiKey(settings);
      assertModel(settings);
      new URL(settings.baseUrl || DEFAULT_BASE_URL);
      return { ok: true, message: "Provider settings look ready." };
    } catch (error) {
      return {
        ok: false,
        message: error instanceof Error ? error.message : "Invalid provider settings."
      };
    }
  }

  streamChat(request: ChatProviderRequest, settings: ProviderSettings) {
    const apiKey = assertApiKey(settings);
    const model = assertModel(settings);
    const baseUrl = normalizeBaseUrl(settings.baseUrl || DEFAULT_BASE_URL);

    return streamOpenAIChatCompletions(`${baseUrl}/chat/completions`, {
      authorization: `Bearer ${apiKey}`
    }, {
      model,
      messages: toOpenAIMessages(request.messages)
    });
  }

  translate(request: TranslateRequest, settings: ProviderSettings) {
    const prompt = buildTranslationPrompt(
      request.text,
      request.targetLanguage ?? "简体中文",
      request.context
    );

    return this.streamChat(
      {
        webSearchEnabled: false,
        messages: [
          {
            id: "system",
            role: "system",
            content: "You are a precise literary translator.",
            createdAt: new Date().toISOString()
          },
          {
            id: "translation-request",
            role: "user",
            content: prompt,
            createdAt: new Date().toISOString()
          }
        ]
      },
      settings
    );
  }
}

export function normalizeBaseUrl(baseUrl: string): string {
  return baseUrl.replace(/\/+$/, "");
}
