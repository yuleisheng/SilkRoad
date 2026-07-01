import { afterEach, describe, expect, it, vi } from "vitest";
import { OllamaCloudProvider, normalizeOllamaBaseUrl } from "./ollama-cloud";
import type { ProviderSettings } from "../../shared/types";

describe("OllamaCloudProvider", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("normalizes cloud base URLs", () => {
    expect(normalizeOllamaBaseUrl("https://ollama.com/")).toBe("https://ollama.com");
    expect(normalizeOllamaBaseUrl("https://ollama.com/api")).toBe("https://ollama.com");
    expect(normalizeOllamaBaseUrl()).toBe("https://ollama.com");
  });

  it("checks that a configured model is available", async () => {
    const fetchMock = vi.fn(async () =>
      new Response(
        JSON.stringify({
          models: [{ name: "glm-5.2", model: "glm-5.2" }]
        }),
        { status: 200, headers: { "content-type": "application/json" } }
      )
    );
    vi.stubGlobal("fetch", fetchMock);

    const provider = new OllamaCloudProvider();
    const result = await provider.validateSettings({
      id: "ollama-cloud",
      label: "Ollama Cloud",
      model: "glm-5.2",
      apiKey: "ollama-key",
      baseUrl: "https://ollama.com"
    });

    expect(fetchMock).toHaveBeenCalledWith(
      "https://ollama.com/api/tags",
      expect.objectContaining({
        headers: expect.objectContaining({
          authorization: "Bearer ollama-key"
        })
      })
    );
    expect(result).toMatchObject({
      ok: true,
      message: expect.stringContaining("glm-5.2")
    });
  });

  it("suggests the direct API model name when a cloud-suffixed name is entered", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        new Response(
          JSON.stringify({
            models: [{ name: "glm-5.2", model: "glm-5.2" }]
          }),
          { status: 200, headers: { "content-type": "application/json" } }
        )
      )
    );

    const provider = new OllamaCloudProvider();
    const result = await provider.validateSettings({
      id: "ollama-cloud",
      label: "Ollama Cloud",
      model: "glm-5.2:cloud",
      apiKey: "ollama-key",
      baseUrl: "https://ollama.com"
    });

    expect(result).toMatchObject({
      ok: false,
      message: expect.stringContaining('try "glm-5.2"')
    });
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
      model: "gpt-oss:20b",
      apiKey: "ollama-key",
      baseUrl: "https://ollama.com"
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
