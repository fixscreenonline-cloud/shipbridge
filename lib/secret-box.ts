import "server-only";
import { createCipheriv, createDecipheriv, createHash, randomBytes } from "crypto";

/**
 * Encrypts small secrets at rest (e.g. customers' Shippo API keys) with AES-256-GCM. The key is derived
 * from ADMIN_SESSION_SECRET plus a purpose label, so each kind of secret uses its own key.
 */
function key(purpose: string) {
  const secret = process.env.ADMIN_SESSION_SECRET;
  if (!secret || secret.length < 16) throw new Error("ADMIN_SESSION_SECRET must be set (16+ characters).");
  return createHash("sha256").update(`shipbridge:${purpose}:${secret}`).digest();
}

export function seal(plain: string, purpose: string) {
  const iv = randomBytes(12);
  const c = createCipheriv("aes-256-gcm", key(purpose), iv);
  const data = Buffer.concat([c.update(plain, "utf8"), c.final()]);
  return [iv, c.getAuthTag(), data].map((b) => b.toString("base64url")).join(".");
}

/** Null if it can't be decrypted (e.g. ADMIN_SESSION_SECRET changed). */
export function unseal(stored: string, purpose: string): string | null {
  try {
    const [iv, tag, data] = stored.split(".").map((s) => Buffer.from(s, "base64url"));
    const d = createDecipheriv("aes-256-gcm", key(purpose), iv);
    d.setAuthTag(tag);
    return Buffer.concat([d.update(data), d.final()]).toString("utf8");
  } catch {
    return null;
  }
}
