import { afterEach, describe, expect, it, vi } from "vitest";
import { OllamaCloudProvider, normalizeOllamaBaseUrl } from "./ollama-cloud";
import type { ProviderSettings } from "../../shared/types";

describe("OllamaCloudProvider", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("normalizes cloud base URLs", () => {
    expect(normalizeOllamaBaseUrl("https://ollama.com/")).toBe("https://ollama.com");
    expect(normalizeOllamaBaseUrl()).toBe("https://ollama.com");
  });

  it("calls the web search endpoint with bearer auth", async () => {
    const fetchMock = vi.fn(async () =>
      new Response(
        JSON.stringify({
          results: [
            {
              title: "Result",
              url: "https://example.com",
              snippet: "Useful snippet"
            }
          ]
        }),
        { status: 200, headers: { "content-type": "application/json" } }
      )
    );
    vi.stubGlobal("fetch", fetchMock);

    const provider = new OllamaCloudProvider();
    const settings: ProviderSettings = {
      id: "ollama-cloud",
      label: "Ollama Cloud",
      enabled: true,
      model: "gpt-oss:20b-cloud",
      apiKey: "ollama-key",
      baseUrl: "https://ollama.com",
      webSearchEnabled: true
    };

    const results = await provider.search("silk road", settings);

    expect(fetchMock).toHaveBeenCalledWith(
      "https://ollama.com/api/web_search",
      expect.objectContaining({
        method: "POST",
        headers: expect.objectContaining({
          authorization: "Bearer ollama-key"
        })
      })
    );
    expect(results[0]).toMatchObject({
      title: "Result",
      url: "https://example.com",
      snippet: "Useful snippet",
      source: "ollama-cloud"
    });
  });
});
