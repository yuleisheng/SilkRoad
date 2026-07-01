import { buildTranslationPrompt } from "../../shared/ai-context";
import type { ProviderSettings, SearchResult, TranslateRequest } from "../../shared/types";
import {
  assertApiKey,
  assertModel,
  type ChatProvider,
  type ChatProviderRequest,
  type SearchProvider
} from "./types";
import { assertOkResponse, streamOllamaNdjson } from "./http-stream";

const OLLAMA_BASE_URL = "https://ollama.com";

export class OllamaCloudProvider implements ChatProvider, SearchProvider {
  readonly id = "ollama-cloud" as const;

  async validateSettings(settings: ProviderSettings) {
    try {
      const apiKey = assertApiKey(settings);
      const model = assertModel(settings);
      const baseUrl = normalizeOllamaBaseUrl(settings.baseUrl);
      new URL(baseUrl);

      const availableModels = await listCloudModels(baseUrl, apiKey);
      if (availableModels.includes(model)) {
        return {
          ok: true,
          message: `Connected to Ollama Cloud. Model "${model}" is available.`
        };
      }

      const suggestedModel = getDirectApiModelSuggestion(model, availableModels);
      return {
        ok: false,
        message: suggestedModel
          ? `Model "${model}" was not found. For direct https://ollama.com API access, try "${suggestedModel}".`
          : `Connected to Ollama Cloud, but model "${model}" was not found.`
      };
    } catch (error) {
      return {
        ok: false,
        message: error instanceof Error ? error.message : "Invalid Ollama Cloud settings."
      };
    }
  }

  streamChat(request: ChatProviderRequest, settings: ProviderSettings) {
    const apiKey = assertApiKey(settings);
    const model = assertModel(settings);
    const baseUrl = normalizeOllamaBaseUrl(settings.baseUrl);

    return streamOllamaNdjson(`${baseUrl}/api/chat`, {
      authorization: `Bearer ${apiKey}`
    }, {
      model,
      stream: true,
      messages: request.messages.map((message) => ({
        role: message.role,
        content: message.content
      }))
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
    const apiKey = assertApiKey(settings);
    const baseUrl = normalizeOllamaBaseUrl(settings.baseUrl);
    const response = await fetch(`${baseUrl}/api/web_search`, {
      method: "POST",
      headers: {
        authorization: `Bearer ${apiKey}`,
        "content-type": "application/json"
      },
      body: JSON.stringify({ query })
    });

    await assertOkResponse(response);
    const payload = (await response.json()) as {
      results?: Array<{ title?: string; url?: string; content?: string; snippet?: string }>;
    };

    return (payload.results ?? []).map((result) => ({
      title: result.title ?? result.url ?? "Search result",
      url: result.url,
      snippet: result.snippet ?? result.content ?? "",
      source: "ollama-cloud"
    }));
  }

  async fetch(url: string, settings: ProviderSettings): Promise<string> {
    const apiKey = assertApiKey(settings);
    const baseUrl = normalizeOllamaBaseUrl(settings.baseUrl);
    const response = await fetch(`${baseUrl}/api/web_fetch`, {
      method: "POST",
      headers: {
        authorization: `Bearer ${apiKey}`,
        "content-type": "application/json"
      },
      body: JSON.stringify({ url })
    });

    await assertOkResponse(response);
    const payload = (await response.json()) as { content?: string };
    return payload.content ?? "";
  }
}

export function normalizeOllamaBaseUrl(baseUrl?: string): string {
  const normalized = (baseUrl || OLLAMA_BASE_URL).replace(/\/+$/, "");
  return normalized.endsWith("/api") ? normalized.slice(0, -4) : normalized;
}

async function listCloudModels(baseUrl: string, apiKey: string): Promise<string[]> {
  const response = await fetch(`${baseUrl}/api/tags`, {
    headers: {
      authorization: `Bearer ${apiKey}`
    }
  });

  await assertOkResponse(response);
  const payload = (await response.json()) as {
    models?: Array<{ name?: string; model?: string }>;
  };

  return (payload.models ?? [])
    .flatMap((model) => [model.name, model.model])
    .filter((name): name is string => Boolean(name));
}

function getDirectApiModelSuggestion(
  model: string,
  availableModels: string[]
): string | null {
  const cloudSuffixPatterns = [/(:cloud)$/u, /(-cloud)$/u];

  for (const pattern of cloudSuffixPatterns) {
    const candidate = model.replace(pattern, "");
    if (candidate !== model && availableModels.includes(candidate)) {
      return candidate;
    }
  }

  return null;
}
