import type { ChatMessage } from "../../shared/types";

export interface OpenAIChatPayload {
  model: string;
  messages: Array<Pick<ChatMessage, "role" | "content">>;
  stream?: boolean;
  [key: string]: unknown;
}

export async function* streamOpenAIChatCompletions(
  url: string,
  headers: Record<string, string>,
  payload: OpenAIChatPayload,
  fetchImpl: typeof fetch = fetch
): AsyncIterable<string> {
  const response = await fetchImpl(url, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      ...headers
    },
    body: JSON.stringify({
      ...payload,
      stream: true
    })
  });

  await assertOkResponse(response);

  if (!response.body) {
    return;
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  while (true) {
    const { value, done } = await reader.read();
    if (done) {
      break;
    }

    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split(/\r?\n/);
    buffer = lines.pop() ?? "";

    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed.startsWith("data:")) {
        continue;
      }

      const data = trimmed.slice(5).trim();
      if (!data || data === "[DONE]") {
        continue;
      }

      const parsed = JSON.parse(data) as {
        choices?: Array<{ delta?: { content?: string }; message?: { content?: string } }>;
      };
      const chunk =
        parsed.choices?.[0]?.delta?.content ??
        parsed.choices?.[0]?.message?.content ??
        "";
      if (chunk) {
        yield chunk;
      }
    }
  }
}

export async function* streamOllamaNdjson(
  url: string,
  headers: Record<string, string>,
  payload: unknown,
  fetchImpl: typeof fetch = fetch
): AsyncIterable<string> {
  const response = await fetchImpl(url, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      ...headers
    },
    body: JSON.stringify(payload)
  });

  await assertOkResponse(response);

  if (!response.body) {
    return;
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  while (true) {
    const { value, done } = await reader.read();
    if (done) {
      break;
    }

    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split(/\r?\n/);
    buffer = lines.pop() ?? "";

    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed) {
        continue;
      }

      const parsed = JSON.parse(trimmed) as {
        message?: { content?: string };
        response?: string;
        done?: boolean;
      };

      const chunk = parsed.message?.content ?? parsed.response ?? "";
      if (chunk) {
        yield chunk;
      }
    }
  }
}

export async function collectStream(stream: AsyncIterable<string>): Promise<string> {
  let text = "";
  for await (const chunk of stream) {
    text += chunk;
  }
  return text;
}

export function toOpenAIMessages(messages: ChatMessage[]): OpenAIChatPayload["messages"] {
  return messages.map((message) => ({
    role: message.role,
    content: message.content
  }));
}

export async function assertOkResponse(response: Response): Promise<void> {
  if (response.ok) {
    return;
  }

  let detail = "";
  try {
    detail = await response.text();
  } catch {
    detail = response.statusText;
  }

  throw new Error(`Provider request failed (${response.status}): ${detail}`);
}
