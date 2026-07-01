import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { buildTranslationPrompt } from "../../shared/ai-context";
import type { ProviderSettings, TranslateRequest } from "../../shared/types";
import type { ChatProvider, ChatProviderRequest } from "./types";

export class CodexSubscriptionProvider implements ChatProvider {
  readonly id = "codex-subscription" as const;

  async validateSettings() {
    try {
      await import("@openai/codex-sdk");
      return {
        ok: true,
        message:
          "Codex SDK is installed. This experimental provider requires an existing local Codex login."
      };
    } catch {
      return {
        ok: false,
        message: "Codex SDK is not installed or could not be loaded."
      };
    }
  }

  async *streamChat(request: ChatProviderRequest, settings: ProviderSettings) {
    const prompt = request.messages
      .filter((message) => message.role !== "system")
      .map((message) => `${message.role}: ${message.content}`)
      .join("\n\n");

    const result = await runCodexPrompt(prompt, settings.model);
    yield result;
  }

  translate(request: TranslateRequest, settings: ProviderSettings) {
    const prompt = buildTranslationPrompt(request.text, request.context);

    return this.streamChat(
      {
        webSearchEnabled: false,
        messages: [
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

async function runCodexPrompt(prompt: string, model?: string): Promise<string> {
  const sdk = (await import("@openai/codex-sdk")) as any;
  const Codex = sdk.Codex ?? sdk.default?.Codex ?? sdk.default;
  if (!Codex) {
    throw new Error("Codex SDK did not expose a Codex constructor.");
  }

  const workspace = await mkdtemp(path.join(tmpdir(), "silkroad-codex-"));
  const codex = new Codex({ cwd: workspace });
  const thread =
    typeof codex.startThread === "function"
      ? codex.startThread(model?.trim() ? { model } : undefined)
      : codex.thread_start(model?.trim() ? { model } : undefined);

  const result =
    typeof thread.run === "function"
      ? await thread.run(prompt)
      : await thread.turn(prompt);

  return (
    result?.final_response ??
    result?.finalResponse ??
    result?.text ??
    result?.toString?.() ??
    ""
  );
}
