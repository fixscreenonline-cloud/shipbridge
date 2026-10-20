/**
 * Where to go after sign-in. Parsed the way a browser would (browsers ignore tabs/newlines and treat
 * "\" like "/", so "/\evil.com" or "/\t/evil.com" would otherwise leave the site), and only paths on
 * this site under /admin (or the home page) are allowed.
 */
export function safeNextPath(next: string | undefined | null, fallback = "/admin") {
  if (!next || typeof next !== "string" || next.length > 512) return fallback;
  try {
    const base = "https://shipbridge.invalid";
    const u = new URL(next, base);
    if (u.origin !== base) return fallback;
    if (u.pathname !== "/" && u.pathname !== "/admin" && !u.pathname.startsWith("/admin/")) return fallback;
    if (u.pathname.startsWith("/admin/login")) return fallback;
    return u.pathname + u.search + u.hash;
  } catch {
    return fallback;
  }
}
