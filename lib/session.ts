import "server-only";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { redirect } from "next/navigation";
import { createSessionToken, readSessionToken, SESSION_COOKIE, SESSION_TTL_MS, sessionCookieFrom } from "./auth";
import { createSession, deleteSession, getSession, getUser, type AdminSession, type Role } from "./db";
import { ADMIN_OWNER, type CustomerUser } from "./types";

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

/**
 * Who is acting: the operator (admin: own Shippo key, global margin) or a customer (their key, the fee
 * and settings the admin set). Everything a customer reads or writes is scoped to `ownerId`.
 */
export type Actor =
  | { role: "admin"; ownerId: typeof ADMIN_OWNER; username: string; user: null }
  | { role: "user"; ownerId: string; username: string; user: CustomerUser };

/** Resolves the session to an actor; a customer must still exist and be switched on. */
export async function actorOf(session: AdminSession): Promise<Actor | null> {
  if (roleOf(session) === "admin") return { role: "admin", ownerId: ADMIN_OWNER, username: session.username ?? "admin", user: null };
  const user = session.userId ? await getUser(session.userId) : null;
  if (!user || !user.active) {
    await deleteSession(session.id); // switched off or removed: this session ends now
    return null;
  }
  return { role: "user", ownerId: user.id, username: user.username, user };
}

/** Booking API handlers (rates, buy, labels, scan): admins and active customers. */
export async function requireUser(req: Request): Promise<{ session: AdminSession; actor: Actor } | { response: NextResponse }> {
  const session = await sessionFromRequest(req);
  const actor = session ? await actorOf(session) : null;
  if (session && actor) return { session, actor };
  return { response: unauthorized() };
}

export type CustomerActor = Extract<Actor, { role: "user" }>;

/** Booking (rates, buy, scan) is for customer accounts only; the admin manages, never books. */
export async function requireCustomer(req: Request): Promise<{ session: AdminSession; actor: CustomerActor } | { response: NextResponse }> {
  const auth = await requireUser(req);
  if ("response" in auth) return auth;
  if (auth.actor.role !== "user") {
    return { response: NextResponse.json({ error: "Only customer accounts can book labels.", code: "customers_only" }, { status: 403 }) };
  }
  return { session: auth.session, actor: auth.actor };
}

/** Same for server components (home, My orders, Settings). */
export async function actorFromCookies(): Promise<Actor | null> {
  const session = await sessionFromCookies();
  return session ? actorOf(session) : null;
}

/** Records a new session and sets its cookie on the response. */
export async function startSession(res: NextResponse, req: Request, role: Role, username: string, userId?: string) {
  const { id, expiresAt, token } = await createSessionToken();
  await createSession({
    id,
    createdAt: new Date().toISOString(),
    expiresAt: new Date(expiresAt).toISOString(),
    userAgent: (req.headers.get("user-agent") ?? "").slice(0, 200),
    role,
    username: username.slice(0, 64),
    ...(userId ? { userId } : {}),
  });
  res.cookies.set(SESSION_COOKIE, token, cookieOptions(SESSION_TTL_MS / 1000));
}

/** Deletes the request's session (if any) and clears the cookie. */
export async function endSession(res: NextResponse, req: Request) {
  const t = await readSessionToken(sessionCookieFrom(req));
  if (t) await deleteSession(t.id);
  res.cookies.set(SESSION_COOKIE, "", cookieOptions(0));
}
