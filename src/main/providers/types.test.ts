import { describe, expect, it } from "vitest";
import type { ProviderSettings } from "../../shared/types";
import { assertApiKey, ProviderConfigurationError } from "./types";

describe("provider settings helpers", () => {
  it("surfaces stored API key recovery errors before missing-key errors", () => {
    const settings: ProviderSettings = {
      id: "openrouter",
      label: "OpenRouter",
      model: "openai/gpt-4.1",
      apiKeyError: "OpenRouter API key could not be decrypted. Re-enter it in Settings."
    };

    expect(() => assertApiKey(settings)).toThrow(ProviderConfigurationError);
    expect(() => assertApiKey(settings)).toThrow("could not be decrypted");
  });
});
