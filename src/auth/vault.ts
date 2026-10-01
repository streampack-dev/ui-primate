/* Seals the API's tokens before they're kept in a reader's session, as ui-pudl's TokenVault does,
   so a copy of the session store doesn't hand out sign-ins: AES-256-GCM, a fresh nonce for each
   seal, the key derived from SESSION_SECRET (changing it signs everyone out). */
import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";

function secret(): string {
  const configured = process.env.SESSION_SECRET;
  if (configured) return configured;
  if (process.env.NODE_ENV === "production") console.warn("SESSION_SECRET isn't set: sign-ins won't survive a restart.");
  return (globalThis as { __uiSecret?: string }).__uiSecret ??= randomBytes(32).toString("hex");
}
const key = () => createHash("sha256").update(secret()).digest();

export function seal(plain: string): string {
  const nonce = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key(), nonce);
  const sealed = Buffer.concat([cipher.update(plain, "utf8"), cipher.final(), cipher.getAuthTag()]);
  return Buffer.concat([nonce, sealed]).toString("base64url");
}

/** The sealed value, or null if it can't be read (another secret, or tampered with). */
export function open(sealed: string): string | null {
  try {
    const bytes = Buffer.from(sealed, "base64url");
    const decipher = createDecipheriv("aes-256-gcm", key(), bytes.subarray(0, 12));
    decipher.setAuthTag(bytes.subarray(bytes.length - 16));
    return Buffer.concat([decipher.update(bytes.subarray(12, bytes.length - 16)), decipher.final()]).toString("utf8");
  } catch {
    return null;
  }
}
