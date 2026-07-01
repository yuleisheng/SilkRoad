import { randomUUID } from "node:crypto";
import {
  buildChatUserPrompt,
  buildReaderContextBlock,
  formatSearchResults
} from "../../shared/ai-context";
import { shouldUseWebSearch } from "../../shared/search-intent";
import type {
  AppSettings,
  ChatMessage,
  ChatRequest,
  ChatResponse,
  ProviderHealth,
  ProviderKind,
  SearchResult,
  TranslateRequest,
  TranslateResponse
} from "../../shared/types";
import { LibraryDatabase } from "../storage/database";
import { collectStream } from "./http-stream";
import { CodexSubscriptionProvider } from "./codex-subscription";
import { OllamaCloudProvider } from "./ollama-cloud";
import { OpenAICompatibleProvider } from "./openai-compatible";
import { OpenRouterProvider } from "./openrouter";
import type { ChatProvider, SearchProvider } from "./types";

const SYSTEM_PROMPT = [
  "You are SilkRoad, an AI reading companion embedded in a private EPUB reader.",
  "Help explain, translate, compare, and reason about passages.",
  "When web search results are present from the app or provider, cite them briefly by title or URL.",
  "Do not claim you searched the web unless search results were provided by the app or provider."
].join(" ");

export class ProviderManager {
  private readonly chatProviders: Record<ProviderKind, ChatProvider>;
  private readonly searchProviders: Partial<Record<ProviderKind, SearchProvider>>;

  constructor(private readonly database: LibraryDatabase) {
    const openRouter = new OpenRouterProvider();
    const ollamaCloud = new OllamaCloudProvider();

    this.chatProviders = {
      openrouter: openRouter,
      "openai-compatible": new OpenAICompatibleProvider(),
      "ollama-cloud": ollamaCloud,
      "codex-subscription": new CodexSubscriptionProvider()
    };

    this.searchProviders = {
      openrouter: openRouter,
      "ollama-cloud": ollamaCloud
    };
  }

  async validate(providerId: ProviderKind): Promise<ProviderHealth> {
    const settings = this.getSettings();
    const providerSettings = settings.providers[providerId];
    const provider = this.chatProviders[providerId];
    if (!providerSettings || !provider) {
      return { ok: false, message: "Provider is not registered." };
    }
    return provider.validateSettings(providerSettings);
  }

  async translate(request: TranslateRequest): Promise<TranslateResponse> {
    const settings = this.getSettings();
    const providerId = request.providerId ?? settings.defaultChatProvider;
    const providerSettings = settings.providers[providerId];
    const provider = this.chatProviders[providerId];

    if (!providerSettings.enabled) {
      throw new Error(`${providerSettings.label} is disabled.`);
    }

    const text = await collectStream(provider.translate(request, providerSettings));
    return {
      text,
      providerId
    };
  }

  async chat(request: ChatRequest): Promise<ChatResponse> {
    const settings = this.getSettings();
    const providerId = request.providerId ?? settings.defaultChatProvider;
    const providerSettings = settings.providers[providerId];
    const provider = this.chatProviders[providerId];

    if (!providerSettings.enabled) {
      throw new Error(`${providerSettings.label} is disabled.`);
    }

    const lastUserMessage = [...request.messages].reverse().find(
      (message) => message.role === "user"
    );
    const searchQuery = lastUserMessage?.content ?? request.context.selectedText;
    const searchResults = await this.maybeSearch(
      providerId,
      providerSettings,
      searchQuery
    );

    const messages = buildMessages(request.messages, request.context, searchResults);
    const text = await collectStream(
      provider.streamChat(
        {
          webSearchEnabled: this.shouldUseProviderNativeWebSearch(providerId, searchQuery),
          messages
        },
        providerSettings
      )
    );

    return {
      message: {
        id: randomUUID(),
        role: "assistant",
        content: text,
        createdAt: new Date().toISOString()
      },
      searchResults
    };
  }

  private async maybeSearch(
    providerId: ProviderKind,
    providerSettings: AppSettings["providers"][ProviderKind],
    query: string
  ): Promise<SearchResult[]> {
    if (
      !shouldUseWebSearch(query) ||
      this.shouldUseProviderNativeWebSearch(providerId, query)
    ) {
      return [];
    }

    const searchProvider = this.searchProviders[providerId];

    if (!searchProvider || !providerSettings.enabled) {
      return [];
    }

    try {
      return await searchProvider.search(query, providerSettings);
    } catch (error) {
      console.warn(
        `SilkRoad web search failed for ${providerId}:`,
        error instanceof Error ? error.message : error
      );
      return [];
    }
  }

  private shouldUseProviderNativeWebSearch(providerId: ProviderKind, query: string): boolean {
    return providerId === "openrouter" && shouldUseWebSearch(query);
  }

  private getSettings(): AppSettings {
    return this.database.getSettingsWithSecrets();
  }
}

function buildMessages(
  messages: ChatMessage[],
  context: ChatRequest["context"],
  searchResults: SearchResult[]
): ChatMessage[] {
  const now = new Date().toISOString();
  const conversation = messages.filter((message) => message.role !== "system");
  const lastUserMessage = [...conversation].reverse().find(
    (message) => message.role === "user"
  );
  const priorMessages = lastUserMessage
    ? conversation.filter((message) => message.id !== lastUserMessage.id)
    : conversation;
  const prompt = buildChatUserPrompt(
    lastUserMessage?.content ?? "",
    context,
    searchResults
  );

  return [
    {
      id: "system",
      role: "system",
      content: SYSTEM_PROMPT,
      createdAt: now
    },
    ...priorMessages,
    {
      id: "reader-context",
      role: "system",
      content: [
        "Current reader context follows.",
        buildReaderContextBlock(context),
        searchResults.length ? `Search results:\n${formatSearchResults(searchResults)}` : ""
      ]
        .filter(Boolean)
        .join("\n\n"),
      createdAt: now
    },
    {
      id: lastUserMessage?.id ?? randomUUID(),
      role: "user",
      content: prompt,
      createdAt: lastUserMessage?.createdAt ?? now
    }
  ];
}
