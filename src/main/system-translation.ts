import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import path from "node:path";
import type { TranslateRequest, TranslateResponse } from "../shared/types";

const APPLE_TRANSLATION_TIMEOUT_MS = 12_000;

export async function translateWithAppleSystem(
  request: TranslateRequest
): Promise<TranslateResponse> {
  const helperPath = getAppleTranslationHelperPath();
  if (!existsSync(helperPath)) {
    throw new Error(
      "Apple Translation helper is not available in this build. Rebuild on macOS 26+ with Swift toolchain support."
    );
  }

  return runAppleTranslationHelper(helperPath, request);
}

function getAppleTranslationHelperPath(): string {
  return path.resolve(__dirname, "..", "helpers", "silkroad-apple-translate");
}

function runAppleTranslationHelper(
  helperPath: string,
  request: TranslateRequest
): Promise<TranslateResponse> {
  return new Promise((resolve, reject) => {
    const child = spawn(helperPath, [], {
      stdio: ["pipe", "pipe", "pipe"]
    });
    const stdout: Buffer[] = [];
    const stderr: Buffer[] = [];
    let settled = false;

    const timer = setTimeout(() => {
      if (settled) {
        return;
      }
      settled = true;
      child.kill("SIGTERM");
      reject(
        new Error(
          "Apple Translation did not respond. macOS may still be preparing translation models; try again later."
        )
      );
    }, APPLE_TRANSLATION_TIMEOUT_MS);

    child.stdout.on("data", (chunk: Buffer) => stdout.push(chunk));
    child.stderr.on("data", (chunk: Buffer) => stderr.push(chunk));
    child.on("error", (error) => {
      if (settled) {
        return;
      }
      settled = true;
      clearTimeout(timer);
      reject(error);
    });
    child.on("close", (code) => {
      if (settled) {
        return;
      }
      settled = true;
      clearTimeout(timer);

      const output = Buffer.concat(stdout).toString("utf8").trim();
      const errorOutput = Buffer.concat(stderr).toString("utf8").trim();

      if (code !== 0) {
        reject(new Error(readHelperError(errorOutput)));
        return;
      }

      try {
        const parsed = JSON.parse(output) as TranslateResponse;
        resolve(parsed);
      } catch {
        reject(new Error("Apple Translation returned an unreadable response."));
      }
    });

    child.stdin.end(
      JSON.stringify({
        text: request.text,
        targetLanguage: request.targetLanguage
      })
    );
  });
}

function readHelperError(errorOutput: string): string {
  if (!errorOutput) {
    return "Apple Translation failed.";
  }

  try {
    const parsed = JSON.parse(errorOutput) as { error?: string };
    return parsed.error || "Apple Translation failed.";
  } catch {
    return errorOutput;
  }
}
