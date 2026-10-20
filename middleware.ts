import { NextResponse, type NextRequest } from "next/server";
import { SESSION_COOKIE, verifySessionToken } from "@/lib/auth";

// The whole site is private: every page and API needs a signed-in session, except the sign-in screens.
// Buying a label spends money from YOUR Shippo account.
// This is the fast first check (signed, unexpired cookie). Admin pages and API handlers also confirm
// the session still exists in the database (lib/session.ts), so signed-out sessions stop working.
const PUBLIC_PATHS = ["/admin/login", "/api/admin/login", "/api/login"];
const UNSAFE_METHODS = new Set(["POST", "PUT", "PATCH", "DELETE"]);

/** Changes must come from this site's own pages (blocks cross-site request forgery). */
function sameOrigin(req: NextRequest) {
  const origin = req.headers.get("origin");
  if (!origin) return true; // same-origin fetches from older browsers may omit it; the SameSite cookie still applies
  const host = req.headers.get("x-forwarded-host") ?? req.headers.get("host");
  try {
    return new URL(origin).host === host;
  } catch {
    return false;
  }
}

export async function middleware(req: NextRequest) {
  const { pathname, search } = req.nextUrl;

  if (UNSAFE_METHODS.has(req.method) && !sameOrigin(req)) {
    return NextResponse.json({ error: "Request blocked: it didn't come from this site." }, { status: 403 });
  }
  if (PUBLIC_PATHS.includes(pathname)) return NextResponse.next();

  const ok = await verifySessionToken(req.cookies.get(SESSION_COOKIE)?.value);
  if (ok) return NextResponse.next();

  if (pathname.startsWith("/api/")) {
    return NextResponse.json({ error: "Sign in to continue.", code: "unauthorized" }, { status: 401 });
  }
  const url = new URL("/admin/login", req.url);
  url.searchParams.set("next", pathname + search);
  return NextResponse.redirect(url);
}

export const config = {
  // "/" isn't listed: it shows the booking sign-in screen itself when signed out.
  matcher: ["/admin/:path*", "/api/admin/:path*", "/api/buy", "/api/rates", "/api/login", "/api/scan-address", "/api/label/:path*"],
};
