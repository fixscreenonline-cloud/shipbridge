import "server-only";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { redirect } from "next/navigation";
import { createSessionToken, readSessionToken, SESSION_COOKIE, SESSION_TTL_MS, sessionCookieFrom } from "./auth";
import { createSession, deleteSession, getSession, type AdminSession, type Role } from "./db";

const cookieOptions = (maxAgeSeconds: number) => ({
  httpOnly: true,
  secure: process.env.NODE_ENV === "production",
  sameSite: "lax" as const,
  path: "/",
  maxAge: maxAgeSeconds,
});

/** Sessions created before roles existed were admin sign-ins. */
export const roleOf = (s: AdminSession): Role => s.role ?? "admin";

async function lookup(token: string | undefined): Promise<AdminSession | null> {
  const t = await readSessionToken(token);
  return t ? getSession(t.id) : null;
}

/** The signed-in session (admin or booking user) for an API request, or null. */
export function sessionFromRequest(req: Request) {
  return lookup(sessionCookieFrom(req));
}

/** Same, for server components. */
export async function sessionFromCookies() {
  return lookup((await cookies()).get(SESSION_COOKIE)?.value);
}

/** Admin pages: anyone who isn't a signed-in admin goes to the admin sign-in page. */
export async function requireAdminPage(next = "/admin") {
  const session = await sessionFromCookies();
  if (!session || roleOf(session) !== "admin") redirect(`/admin/login?next=${encodeURIComponent(next)}`);
  return session;
}

const unauthorized = (message = "Sign in to continue.") =>
  NextResponse.json({ error: message, code: "unauthorized" }, { status: 401 });

/** Admin-only API handlers. */
export async function requireAdmin(req: Request): Promise<{ session: AdminSession } | { response: NextResponse }> {
  const session = await sessionFromRequest(req);
  if (session && roleOf(session) === "admin") return { session };
  return { response: unauthorized(session ? "Admin sign-in required." : undefined) };
}

/** Booking API handlers (rates, buy): admins and booking users. */
export async function requireUser(req: Request): Promise<{ session: AdminSession } | { response: NextResponse }> {
  const session = await sessionFromRequest(req);
  if (session) return { session };
  return { response: unauthorized() };
}

/** Records a new session and sets its cookie on the response. */
export async function startSession(res: NextResponse, req: Request, role: Role, username: string) {
  const { id, expiresAt, token } = await createSessionToken();
  await createSession({
    id,
    createdAt: new Date().toISOString(),
    expiresAt: new Date(expiresAt).toISOString(),
    userAgent: (req.headers.get("user-agent") ?? "").slice(0, 200),
    role,
    username: username.slice(0, 64),
  });
  res.cookies.set(SESSION_COOKIE, token, cookieOptions(SESSION_TTL_MS / 1000));
}

/** Deletes the request's session (if any) and clears the cookie. */
export async function endSession(res: NextResponse, req: Request) {
  const t = await readSessionToken(sessionCookieFrom(req));
  if (t) await deleteSession(t.id);
  res.cookies.set(SESSION_COOKIE, "", cookieOptions(0));
}
