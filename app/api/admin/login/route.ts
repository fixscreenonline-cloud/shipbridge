import { NextResponse } from "next/server";
import { createHash, timingSafeEqual } from "crypto";
import { createSessionToken, SESSION_COOKIE, SESSION_TTL_MS } from "@/lib/auth";
import {
  DEVICE_COOKIE,
  DEVICE_COOKIE_MAX_AGE,
  deviceId,
  guardKeys,
  lockedUntil,
  recordFailure,
  recordSuccess,
} from "@/lib/login-guard";
import { errorResponse } from "@/lib/http";

export const runtime = "nodejs";

// Compare fixed-length digests so the check takes the same time whatever the password length.
function passwordMatches(given: string, expected: string) {
  const d = (s: string) => createHash("sha256").update(s).digest();
  return timingSafeEqual(d(given), d(expected));
}

const secure = process.env.NODE_ENV === "production";

function lockedResponse(until: Date) {
  const retryAfter = Math.max(1, Math.ceil((until.getTime() - Date.now()) / 1000));
  return NextResponse.json(
    {
      error: "Too many failed attempts. This device is locked.",
      code: "locked",
      lockedUntil: until.toISOString(),
    },
    { status: 429, headers: { "Retry-After": String(retryAfter) } },
  );
}

export async function POST(req: Request) {
  const expected = process.env.ADMIN_PASSWORD;
  if (!expected || expected === "change-me") {
    return NextResponse.json({ error: "Set ADMIN_PASSWORD in your .env file first." }, { status: 500 });
  }

  const device = deviceId(req);
  const keys = guardKeys(req, device.id);
  const withDevice = (res: NextResponse) => {
    if (device.isNew) {
      res.cookies.set(DEVICE_COOKIE, device.id, {
        httpOnly: true,
        secure,
        sameSite: "lax",
        path: "/",
        maxAge: DEVICE_COOKIE_MAX_AGE,
      });
    }
    return res;
  };

  try {
    // While locked, even the right password is refused.
    const locked = await lockedUntil(keys);
    if (locked) return withDevice(lockedResponse(locked));

    const body = await req.json().catch(() => null);
    const password = typeof body?.password === "string" ? body.password : "";

    if (!passwordMatches(password, expected)) {
      await new Promise((r) => setTimeout(r, 600)); // slow down guessing
      const result = await recordFailure(keys);
      if ("lockedUntil" in result) return withDevice(lockedResponse(result.lockedUntil));
      const n = result.attemptsLeft;
      return withDevice(
        NextResponse.json(
          { error: `Incorrect password. ${n} attempt${n === 1 ? "" : "s"} left before this device is locked.`, attemptsLeft: n },
          { status: 401 },
        ),
      );
    }

    await recordSuccess(keys);
    const res = NextResponse.json({ ok: true });
    res.cookies.set(SESSION_COOKIE, await createSessionToken(), {
      httpOnly: true,
      secure,
      sameSite: "lax",
      path: "/",
      maxAge: SESSION_TTL_MS / 1000,
    });
    return withDevice(res);
  } catch (err) {
    return errorResponse(err);
  }
}
