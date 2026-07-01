import type { TranslateRequest, ProviderSettings, SearchResult } from "../../shared/types";
import { buildTranslationPrompt } from "../../shared/ai-context";
import {
  assertApiKey,
  assertModel,
  type ChatProvider,
  type ChatProviderRequest,
  type SearchProvider
} from "./types";
import { streamOpenAIChatCompletions, toOpenAIMessages } from "./http-stream";
import { normalizeBaseUrl } from "./openai-compatible";

const OPENROUTER_BASE_URL = "https://openrouter.ai/api/v1";

export class OpenRouterProvider implements ChatProvider, SearchProvider {
  readonly id = "openrouter" as const;

  async validateSettings(settings: ProviderSettings) {
    try {
      assertApiKey(settings);
      assertModel(settings);
      new URL(settings.baseUrl || OPENROUTER_BASE_URL);
      return { ok: true, message: "OpenRouter settings look ready." };
    } catch (error) {
      return {
        ok: false,
        message: error instanceof Error ? error.message : "Invalid OpenRouter settings."
      };
    }
  }

  streamChat(request: ChatProviderRequest, settings: ProviderSettings) {
    const apiKey = assertApiKey(settings);
    const model = getOpenRouterModel(assertModel(settings), request.webSearchEnabled);
    const baseUrl = normalizeBaseUrl(settings.baseUrl || OPENROUTER_BASE_URL);

    return streamOpenAIChatCompletions(`${baseUrl}/chat/completions`, {
      authorization: `Bearer ${apiKey}`,
      "http-referer": "https://github.com/yulei/silkroad",
      "x-title": "SilkRoad"
    }, {
      model,
      messages: toOpenAIMessages(request.messages)
    });
  }

  translate(request: TranslateRequest, settings: ProviderSettings) {
    const prompt = buildTranslationPrompt(request.text, request.context);

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

  async search(query: string, settings: ProviderSettings): Promise<SearchResult[]> {
    const text = await collectText(
      this.streamChat(
        {
          webSearchEnabled: true,
          messages: [
            {
              id: "system",
              role: "system",
              content:
                "Search the web for the user's query and return a concise answer with source names and URLs when available.",
              createdAt: new Date().toISOString()
            },
            {
              id: "search-query",
              role: "user",
              content: query,
              createdAt: new Date().toISOString()
            }
          ]
        },
        settings
      )
    );

    return [
      {
        title: "OpenRouter web search",
        snippet: text,
        source: "openrouter"
      }
    ];
  }
}

function getOpenRouterModel(model: string, webSearchEnabled: boolean): string {
  if (!webSearchEnabled || model.endsWith(":online")) {
    return model;
  }
  return `${model}:online`;
}

async function collectText(stream: AsyncIterable<string>): Promise<string> {
  let text = "";
  for await (const chunk of stream) {
    text += chunk;
  }
  return text;
}
