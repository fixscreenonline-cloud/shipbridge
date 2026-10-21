import "server-only";
import { NextResponse } from "next/server";
import { DEVICE_COOKIE, DEVICE_COOKIE_MAX_AGE, deviceId, guardKeys, lockedUntil, recordFailure, recordSuccess } from "./login-guard";
import { errorResponse } from "./http";
import { getSecurity, getUserByUsername, updateSecurity, type Role } from "./db";
import { ensureLegacyBookingUser } from "./customers";
import type { CustomerUser } from "./types";
import { endSession, startSession } from "./session";
import { BodyError, rateLimit, readJson } from "./request";
import { decryptSecret, verifyCode } from "./totp";
import { equalsConstantTime, verifyPassword } from "./passwords";

const secure = process.env.NODE_ENV === "production";
const norm = (s: string) => s.trim().toLowerCase();

export const adminUsername = () => process.env.ADMIN_USERNAME?.trim() || "admin";

// A valid scrypt hash of a random string: verifying against it costs the same as a real check.
const DUMMY_HASH = "scrypt$AAAAAAAAAAAAAAAAAAAAAA$" + "A".repeat(86);

function lockedResponse(until: Date) {
  const retryAfter = Math.max(1, Math.ceil((until.getTime() - Date.now()) / 1000));
  return NextResponse.json(
    { error: "Too many failed attempts. This device is locked.", code: "locked", lockedUntil: until.toISOString() },
    { status: 429, headers: { "Retry-After": String(retryAfter) } },
  );
}

/**
 * Sign-in for both logins. `role` decides whose credentials are checked:
 *  - "admin": ADMIN_USERNAME + ADMIN_PASSWORD, then the 2FA code if turned on;
 *  - "user": the booking login.
 * Both share the lockout (device + network) and the per-network rate limit.
 */
export async function handleLogin(req: Request, role: Role) {
  if (role === "admin") {
    const expected = process.env.ADMIN_PASSWORD;
    if (!expected || expected === "change-me") {
      return NextResponse.json({ error: "Set ADMIN_PASSWORD in your .env file first." }, { status: 500 });
    }
  }

  // Besides the lockout, cap sign-in requests per network (slows scripted guessing).
  const limited = await rateLimit(req, "login", 20, 10 * 60 * 1000);
  if (limited) return limited;

  const device = deviceId(req);
  const keys = guardKeys(req, device.id);
  const withDevice = (res: NextResponse) => {
    if (device.isNew) {
      res.cookies.set(DEVICE_COOKIE, device.id, { httpOnly: true, secure, sameSite: "lax", path: "/", maxAge: DEVICE_COOKIE_MAX_AGE });
    }
    return res;
  };

  try {
    // While locked, even the right password is refused.
    const locked = await lockedUntil(keys);
    if (locked) return withDevice(lockedResponse(locked));

    let body: { username?: unknown; password?: unknown; code?: unknown } | null;
    try {
      body = (await readJson(req, 2 * 1024)) as typeof body;
    } catch (e) {
      return NextResponse.json({ error: (e as Error).message }, { status: (e as BodyError).status ?? 400 });
    }
    const username = typeof body?.username === "string" ? body.username.slice(0, 64) : "";
    const password = typeof body?.password === "string" ? body.password.slice(0, 256) : "";
    const code = typeof body?.code === "string" ? body.code.slice(0, 10) : "";

    // Wrong username/password or wrong 2FA code: all count toward the lockout.
    const fail = async (what: "username or password" | "code") => {
      await new Promise((r) => setTimeout(r, 600)); // slow down guessing
      const result = await recordFailure(keys);
      if ("lockedUntil" in result) return withDevice(lockedResponse(result.lockedUntil));
      const n = result.attemptsLeft;
      return withDevice(
        NextResponse.json(
          { error: `Incorrect ${what}. ${n} attempt${n === 1 ? "" : "s"} left before this device is locked.`, attemptsLeft: n },
          { status: 401 },
        ),
      );
    };

    // Check username and password together (both always evaluated) so the reply doesn't reveal which was wrong.
    let ok: boolean;
    let canonicalName: string;
    let customer: CustomerUser | null = null;
    if (role === "admin") {
      canonicalName = adminUsername();
      const userOk = equalsConstantTime(norm(username), norm(canonicalName));
      const passOk = equalsConstantTime(password, process.env.ADMIN_PASSWORD!);
      ok = userOk && passOk;
    } else {
      // Customer accounts (Admin → Users). The old single booking login is moved over on first use.
      await ensureLegacyBookingUser();
      customer = await getUserByUsername(username);
      canonicalName = customer?.username ?? username;
      // Always run the hash check (against a dummy when the user doesn't exist) so timing doesn't reveal usernames.
      const passOk = await verifyPassword(password, customer?.passwordHash ?? DUMMY_HASH);
      ok = !!customer && passOk;
    }
    if (!ok) return fail("username or password");
    if (customer && !customer.active) {
      return withDevice(NextResponse.json({ error: "This account is switched off. Contact your provider." }, { status: 403 }));
    }

    // Admin two-factor sign-in, when turned on (Admin → Security). ADMIN_2FA_RESET=true skips it for recovery.
    if (role === "admin") {
      const security = await getSecurity();
      if (security.totpSecret && process.env.ADMIN_2FA_RESET !== "true") {
        if (!code) return withDevice(NextResponse.json({ step: "code" }));
        const secret = decryptSecret(security.totpSecret);
        if (!secret) {
          return NextResponse.json(
            { error: "Two-factor settings can't be read (was ADMIN_SESSION_SECRET changed?). Set ADMIN_2FA_RESET=true, sign in, and set up 2FA again." },
            { status: 500 },
          );
        }
        const step = verifyCode(secret, code, security.totpLastStep);
        if (step === null) return fail("code");
        await updateSecurity({ totpLastStep: step }); // the same code can't be used again
      }
    }

    await recordSuccess(keys);
    const res = NextResponse.json({ ok: true, role });
    await endSession(res, req); // a fresh session id every sign-in; the old one stops working
    await startSession(res, req, role, canonicalName, customer?.id);
    return withDevice(res);
  } catch (err) {
    return errorResponse(err);
  }
}
