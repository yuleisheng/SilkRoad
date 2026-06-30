import { safeStorage } from "electron";

const PREFIX = "safe:";

export function encryptSecret(secret: string): string {
  if (!secret.trim()) {
    return "";
  }

  if (!safeStorage.isEncryptionAvailable()) {
    throw new Error("Secure storage is unavailable on this system.");
  }

  return `${PREFIX}${safeStorage.encryptString(secret).toString("base64")}`;
}

export function decryptSecret(ciphertext?: string): string | undefined {
  if (!ciphertext) {
    return undefined;
  }

  if (!ciphertext.startsWith(PREFIX)) {
    return undefined;
  }

  if (!safeStorage.isEncryptionAvailable()) {
    throw new Error("Secure storage is unavailable on this system.");
  }

  const payload = ciphertext.slice(PREFIX.length);
  return safeStorage.decryptString(Buffer.from(payload, "base64"));
}
