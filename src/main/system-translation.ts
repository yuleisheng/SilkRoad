import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import { existsSync } from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";
import type { TranslateRequest, TranslateResponse } from "../shared/types";

const APPLE_TRANSLATION_UI_TIMEOUT_MS = 3_000;

interface PendingRequest {
  resolve(response: TranslateResponse): void;
  reject(error: Error): void;
  timer: NodeJS.Timeout;
}

interface HelperResponse {
  id: string;
  ok: boolean;
  providerId?: string;
  presentation?: "system-ui";
  replacement?: string;
  error?: string;
}

let helperProcess: ChildProcessWithoutNullStreams | null = null;
let stdoutBuffer = "";
const pendingRequests = new Map<string, PendingRequest>();

export async function translateWithAppleSystem(
  request: TranslateRequest
): Promise<TranslateResponse> {
  const helperPath = getAppleTranslationHelperPath();
  if (!existsSync(helperPath)) {
    throw new Error(
      "Apple Translation UI helper is not available in this build. Rebuild on macOS 26+ with Swift toolchain support."
    );
  }

  const child = ensureAppleTranslationHelper(helperPath);
  const id = randomUUID();

  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      pendingRequests.delete(id);
      reject(new Error("Apple Translation UI did not respond."));
    }, APPLE_TRANSLATION_UI_TIMEOUT_MS);

    pendingRequests.set(id, { resolve, reject, timer });
    child.stdin.write(
      `${JSON.stringify({
        id,
        action: "present",
        text: request.text,
        anchorRect: request.anchorRect
      })}\n`
    );
  });
}

export function dismissAppleSystemTranslation(): void {
  if (!helperProcess || helperProcess.killed) {
    return;
  }

  helperProcess.stdin.write(
    `${JSON.stringify({
      id: randomUUID(),
      action: "dismiss"
    })}\n`
  );
}

function getAppleTranslationHelperPath(): string {
  return path.resolve(__dirname, "..", "helpers", "silkroad-translation-ui");
}

function ensureAppleTranslationHelper(helperPath: string): ChildProcessWithoutNullStreams {
  if (helperProcess && !helperProcess.killed) {
    return helperProcess;
  }

  const child = spawn(helperPath, [], {
    stdio: ["pipe", "pipe", "pipe"]
  });
  helperProcess = child;
  stdoutBuffer = "";

  child.stdout.on("data", (chunk: Buffer) => {
    stdoutBuffer += chunk.toString("utf8");
    flushHelperResponses();
  });

  child.stderr.on("data", (chunk: Buffer) => {
    const message = chunk.toString("utf8").trim();
    if (message) {
      console.warn(`[apple-translation-ui] ${message}`);
    }
  });

  child.on("error", (error) => {
    rejectAllPending(error);
    helperProcess = null;
  });

  child.on("exit", (code) => {
    rejectAllPending(
      new Error(`Apple Translation UI helper exited${code === null ? "" : ` with ${code}`}.`)
    );
    helperProcess = null;
  });

  return child;
}

function flushHelperResponses(): void {
  let newlineIndex = stdoutBuffer.indexOf("\n");

  while (newlineIndex !== -1) {
    const line = stdoutBuffer.slice(0, newlineIndex).trim();
    stdoutBuffer = stdoutBuffer.slice(newlineIndex + 1);

    if (line) {
      handleHelperResponse(line);
    }

    newlineIndex = stdoutBuffer.indexOf("\n");
  }
}

function handleHelperResponse(line: string): void {
  let response: HelperResponse;
  try {
    response = JSON.parse(line) as HelperResponse;
  } catch {
    console.warn(`[apple-translation-ui] Unreadable response: ${line}`);
    return;
  }

  const pending = pendingRequests.get(response.id);
  if (!pending) {
    return;
  }

  pendingRequests.delete(response.id);
  clearTimeout(pending.timer);

  pending.resolve({
    ok: response.ok,
    providerId: "apple-system",
    presentation: response.presentation,
    replacement: response.replacement,
    text: "",
    error: response.error
  });
}

function rejectAllPending(error: Error): void {
  for (const [id, pending] of pendingRequests) {
    pendingRequests.delete(id);
    clearTimeout(pending.timer);
    pending.reject(error);
  }
}
