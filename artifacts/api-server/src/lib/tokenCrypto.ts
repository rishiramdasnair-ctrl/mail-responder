import { createCipheriv, createDecipheriv, randomBytes, scryptSync } from "crypto";

const ALGORITHM = "aes-256-gcm";
const IV_LENGTH = 12;
const AUTH_TAG_LENGTH = 16;
const SALT = "replyai-token-encryption-salt-v1";

function getDerivedKey(): Buffer {
  const raw = process.env.TOKEN_ENCRYPTION_KEY;
  if (!raw) {
    throw new Error("TOKEN_ENCRYPTION_KEY environment variable is not set. Cannot encrypt/decrypt tokens.");
  }
  return scryptSync(raw, SALT, 32);
}

export function encryptToken(plaintext: string): string {
  const key = getDerivedKey();
  const iv = randomBytes(IV_LENGTH);
  const cipher = createCipheriv(ALGORITHM, key, iv, { authTagLength: AUTH_TAG_LENGTH });
  const encrypted = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const authTag = cipher.getAuthTag();
  const combined = Buffer.concat([iv, authTag, encrypted]);
  return "enc:" + combined.toString("base64");
}

export function decryptToken(ciphertext: string): string {
  if (!ciphertext.startsWith("enc:")) {
    return ciphertext;
  }
  const key = getDerivedKey();
  const combined = Buffer.from(ciphertext.slice(4), "base64");
  const iv = combined.subarray(0, IV_LENGTH);
  const authTag = combined.subarray(IV_LENGTH, IV_LENGTH + AUTH_TAG_LENGTH);
  const encrypted = combined.subarray(IV_LENGTH + AUTH_TAG_LENGTH);
  const decipher = createDecipheriv(ALGORITHM, key, iv, { authTagLength: AUTH_TAG_LENGTH });
  decipher.setAuthTag(authTag);
  const decrypted = Buffer.concat([decipher.update(encrypted), decipher.final()]);
  return decrypted.toString("utf8");
}

export function isEncryptionAvailable(): boolean {
  return !!process.env.TOKEN_ENCRYPTION_KEY;
}

export function maybeEncrypt(value: string | null | undefined): string | null | undefined {
  if (!value) return value;
  if (!isEncryptionAvailable()) {
    throw new Error("TOKEN_ENCRYPTION_KEY is required to encrypt tokens. Set this environment variable before storing OAuth credentials.");
  }
  if (value.startsWith("enc:")) return value;
  return encryptToken(value);
}

export function maybeDecrypt(value: string | null | undefined): string | null | undefined {
  if (!value) return value;
  if (!value.startsWith("enc:")) return value;
  if (!isEncryptionAvailable()) {
    throw new Error("TOKEN_ENCRYPTION_KEY is required to decrypt stored tokens.");
  }
  return decryptToken(value);
}

/**
 * Encrypts sensitive token fields (accessToken, refreshToken, token) within
 * a connector config object before writing to the database.
 */
export function encryptConnectorConfig(config: Record<string, unknown>): Record<string, unknown> {
  if (!isEncryptionAvailable()) return config;
  const result = { ...config };
  for (const field of ["accessToken", "refreshToken", "token", "access_token", "refresh_token"]) {
    if (typeof result[field] === "string" && result[field]) {
      result[field] = maybeEncrypt(result[field] as string);
    }
  }
  return result;
}

/**
 * Decrypts sensitive token fields within a connector config object read from the database.
 */
export function decryptConnectorConfig(config: Record<string, unknown>): Record<string, unknown> {
  const result = { ...config };
  for (const field of ["accessToken", "refreshToken", "token", "access_token", "refresh_token"]) {
    if (typeof result[field] === "string") {
      result[field] = maybeDecrypt(result[field] as string);
    }
  }
  return result;
}
