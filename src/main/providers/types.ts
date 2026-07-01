import type {
  ChatMessage,
  ProviderHealth,
  ProviderKind,
  ProviderSettings,
  SearchResult,
  TranslateRequest
} from "../../shared/types";

export interface ChatProviderRequest {
  messages: ChatMessage[];
  webSearchEnabled: boolean;
}

export interface ChatProvider {
  id: ProviderKind;
  validateSettings(settings: ProviderSettings): Promise<ProviderHealth>;
  streamChat(
    request: ChatProviderRequest,
    settings: ProviderSettings
  ): AsyncIterable<string>;
  translate(
    request: TranslateRequest,
    settings: ProviderSettings
  ): AsyncIterable<string>;
}

export interface SearchProvider {
  id: ProviderKind;
  search(query: string, settings: ProviderSettings): Promise<SearchResult[]>;
  fetch?(url: string, settings: ProviderSettings): Promise<string>;
}

export interface ProviderCapability {
  chat: boolean;
  translate: boolean;
  search: boolean;
}

export class ProviderConfigurationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ProviderConfigurationError";
  }
}

export function assertApiKey(settings: ProviderSettings): string {
  if (!settings.apiKey?.trim()) {
    throw new ProviderConfigurationError(`${settings.label} API key is missing.`);
  }
  return settings.apiKey.trim();
}

export function assertModel(settings: ProviderSettings): string {
  if (!settings.model.trim()) {
    throw new ProviderConfigurationError(`${settings.label} model is missing.`);
  }
  return settings.model.trim();
}
