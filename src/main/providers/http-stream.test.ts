import { describe, expect, it } from "vitest";
import { collectStream, streamOpenAIChatCompletions, streamOllamaNdjson } from "./http-stream";

describe("provider streaming parsers", () => {
  it("parses OpenAI-compatible SSE chunks", async () => {
    const body = [
      'data: {"choices":[{"delta":{"content":"Hello"}}]}',
      "",
      'data: {"choices":[{"delta":{"content":" world"}}]}',
      "",
      "data: [DONE]",
      ""
    ].join("\n");
    const fetchImpl = async () =>
      new Response(toStream(body), {
        status: 200
      });

    const text = await collectStream(
      streamOpenAIChatCompletions(
        "https://example.test/chat/completions",
        {},
        {
          model: "test",
          messages: []
        },
        fetchImpl as typeof fetch
      )
    );

    expect(text).toBe("Hello world");
  });

  it("parses Ollama NDJSON chunks", async () => {
    const body = [
      '{"message":{"content":"Hello"}}',
      '{"message":{"content":" cloud"}}',
      '{"done":true}'
    ].join("\n");
    const fetchImpl = async () =>
      new Response(toStream(body), {
        status: 200
      });

    const text = await collectStream(
      streamOllamaNdjson(
        "https://ollama.com/api/chat",
        {},
        { model: "test", messages: [] },
        fetchImpl as typeof fetch
      )
    );

    expect(text).toBe("Hello cloud");
  });
});

function toStream(text: string): ReadableStream<Uint8Array> {
  return new ReadableStream({
    start(controller) {
      controller.enqueue(new TextEncoder().encode(text));
      controller.close();
    }
  });
}
