// Works in both the Edge runtime (middleware) and Node (route handlers).
//
// The session cookie is `<sessionId>.<expiry>.<signature>`. Middleware checks the signature and
// expiry; route handlers and admin pages also check that the session still exists in the database
// (lib/session.ts), so signing out ends it immediately.

/**
 * On HTTPS (production) the cookie uses the `__Host-` prefix: the browser only accepts it when it's
 * Secure, has Path=/ and no Domain, so it can't be set or overwritten by another subdomain.
 */
export const SESSION_COOKIE = process.env.NODE_ENV === "production" ? "__Host-sb_admin" : "sb_admin";
/** Admin sessions end 1 hour after sign-in. */
export const SESSION_TTL_MS = 60 * 60 * 1000;

const enc = new TextEncoder();

function toBase64Url(buf: ArrayBuffer | Uint8Array) {
  let s = "";
  for (const b of new Uint8Array(buf)) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

async function sign(data: string) {
  const secret = process.env.ADMIN_SESSION_SECRET;
  if (!secret || secret.length < 16) throw new Error("ADMIN_SESSION_SECRET must be set (16+ characters).");
  const key = await crypto.subtle.importKey("raw", enc.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, [
    "sign",
  ]);
  return toBase64Url(await crypto.subtle.sign("HMAC", key, enc.encode(data)));
}

export function safeEqual(a: string, b: string) {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

/** A new random session id and its signed cookie value. */
export async function createSessionToken() {
  const id = toBase64Url(crypto.getRandomValues(new Uint8Array(24)));
  const expiresAt = Date.now() + SESSION_TTL_MS;
  const payload = `${id}.${expiresAt}`;
  return { id, expiresAt, token: `${payload}.${await sign(payload)}` };
}

/** The session id if the cookie is genuine and unexpired, else null. Doesn't check the database. */
export async function readSessionToken(token: string | undefined): Promise<{ id: string; expiresAt: number } | null> {
  if (!token) return null;
  const parts = token.split(".");
  if (parts.length !== 3) return null;
  const [id, exp, sig] = parts;
  const expiresAt = Number(exp);
  if (!/^[A-Za-z0-9_-]{32}$/.test(id) || !(expiresAt > Date.now())) return null;
  // Reject tokens claiming a longer lifetime than today's limit.
  if (expiresAt - Date.now() > SESSION_TTL_MS) return null;
  try {
    return safeEqual(sig, await sign(`${id}.${exp}`)) ? { id, expiresAt } : null;
  } catch {
    return null;
  }
}

export async function verifySessionToken(token: string | undefined) {
  return (await readSessionToken(token)) !== null;
}

/** Reads the session cookie from a request's Cookie header. */
export function sessionCookieFrom(req: Request) {
  return req.headers
    .get("cookie")
    ?.split(";")
    .map((c) => c.trim())
    .find((c) => c.startsWith(`${SESSION_COOKIE}=`))
    ?.slice(SESSION_COOKIE.length + 1);
}
