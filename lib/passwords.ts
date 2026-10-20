import "server-only";
import { createHash, randomBytes, scrypt, timingSafeEqual } from "crypto";

/** Salted scrypt hash: "scrypt$<salt>$<hash>". Used for the booking login's password. */
export function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16);
  return new Promise((resolve, reject) =>
    scrypt(password, salt, 64, { N: 16384, r: 8, p: 1 }, (err, key) =>
      err ? reject(err) : resolve(`scrypt$${salt.toString("base64url")}$${key.toString("base64url")}`),
    ),
  );
}

export function verifyPassword(password: string, stored: string): Promise<boolean> {
  const [kind, saltB64, hashB64] = stored.split("$");
  if (kind !== "scrypt" || !saltB64 || !hashB64) return Promise.resolve(false);
  const expected = Buffer.from(hashB64, "base64url");
  return new Promise((resolve) =>
    scrypt(password, Buffer.from(saltB64, "base64url"), expected.length, { N: 16384, r: 8, p: 1 }, (err, key) =>
      resolve(!err && timingSafeEqual(key, expected)),
    ),
  );
}

/** Constant-time comparison of two strings of any length (for values kept in env vars). */
export function equalsConstantTime(given: string, expected: string) {
  const d = (s: string) => createHash("sha256").update(s).digest();
  return timingSafeEqual(d(given), d(expected));
}
