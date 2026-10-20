import { NextResponse } from "next/server";
import QRCode from "qrcode";
import { z } from "zod";
import { clearAllLoginAttempts, deleteOtherSessions, deleteSession, deleteSessionsByRole, getSecurity, updateSecurity } from "@/lib/db";
import { hashPassword } from "@/lib/passwords";
import { errorResponse } from "@/lib/http";
import { requireAdmin } from "@/lib/session";
import { deviceId, guardKeys, lockedUntil, recordFailure } from "@/lib/login-guard";
import { BodyError, readJson } from "@/lib/request";
import { decryptSecret, encryptSecret, generateSecret, otpauthUri, verifyCode } from "@/lib/totp";

export const runtime = "nodejs";

const Body = z.discriminatedUnion("action", [
  z.object({ action: z.literal("2fa-start") }),
  z.object({ action: z.literal("2fa-confirm"), code: z.string().max(10) }),
  z.object({ action: z.literal("2fa-disable"), code: z.string().max(10) }),
  z.object({ action: z.literal("sign-out-session"), id: z.string().max(64) }),
  z.object({ action: z.literal("sign-out-others") }),
  z.object({ action: z.literal("clear-lockouts") }),
  z.object({
    action: z.literal("set-booking-login"),
    username: z
      .string()
      .trim()
      .min(3, "Username needs at least 3 characters")
      .max(64, "Username is too long")
      .regex(/^[A-Za-z0-9._@-]+$/, "Use letters, digits and . _ @ - only"),
    password: z.string().min(8, "Password needs at least 8 characters").max(256, "Password is too long"),
  }),
]);

const bad = (error: string, status = 400) => NextResponse.json({ error }, { status });

/** Admin → Security actions. Admin only. */
export async function POST(req: Request) {
  const auth = await requireAdmin(req);
  if ("response" in auth) return auth.response;
  let raw: unknown;
  try {
    raw = await readJson(req, 4 * 1024);
  } catch (e) {
    return bad((e as BodyError).message, (e as BodyError).status ?? 400);
  }
  const parsed = Body.safeParse(raw);
  if (!parsed.success) {
    // Field problems (e.g. a short password) are worth showing; anything else is just a bad request.
    const isBookingForm = (raw as { action?: unknown } | null)?.action === "set-booking-login";
    return bad(isBookingForm ? (parsed.error.issues[0]?.message ?? "Check the fields.") : "Unknown action.");
  }
  const body = parsed.data;

  // Wrong 2FA codes here count toward the same lockout as sign-in, so codes can't be guessed.
  const keys = guardKeys(req, deviceId(req).id);
  const wrongCode = async (message: string) => {
    const r = await recordFailure(keys);
    return bad("lockedUntil" in r ? "Too many wrong codes. This device is locked for a while." : message, "lockedUntil" in r ? 429 : 400);
  };

  try {
    if ((body.action === "2fa-confirm" || body.action === "2fa-disable") && (await lockedUntil(keys))) {
      return bad("Too many wrong codes. This device is locked for a while.", 429);
    }

    switch (body.action) {
      case "2fa-start": {
        // Replacing an active 2FA would let a stolen session swap in the attacker's phone:
        // turning it off (which needs a current code) must come first.
        if ((await getSecurity()).totpSecret) return bad("Two-factor sign-in is already on. Turn it off first (needs a current code).", 409);
        // A new secret waits as "pending" until the first code from the app confirms it.
        const secret = generateSecret();
        await updateSecurity({ totpPending: encryptSecret(secret) });
        const uri = otpauthUri(secret);
        const qrSvg = await QRCode.toString(uri, { type: "svg", margin: 1, errorCorrectionLevel: "M" });
        return NextResponse.json({ qrSvg, secret: secret.replace(/(.{4})/g, "$1 ").trim() });
      }
      case "2fa-confirm": {
        const sec = await getSecurity();
        if (sec.totpSecret) return bad("Two-factor sign-in is already on.", 409);
        const secret = sec.totpPending && decryptSecret(sec.totpPending);
        if (!secret) return bad("Start the setup again.");
        const step = verifyCode(secret, body.code);
        if (step === null) return wrongCode("That code didn't match. Check the time on your phone and try the newest code.");
        await updateSecurity({
          totpSecret: sec.totpPending,
          totpPending: null,
          totpEnabledAt: new Date().toISOString(),
          totpLastStep: step,
        });
        // Anyone else signed in with only the password is signed out.
        await deleteOtherSessions(auth.session.id);
        return NextResponse.json({ ok: true });
      }
      case "2fa-disable": {
        const sec = await getSecurity();
        const secret = sec.totpSecret && decryptSecret(sec.totpSecret);
        if (!sec.totpSecret) return bad("Two-factor sign-in is already off.");
        // If the secret can't be read (session secret changed), only ADMIN_2FA_RESET can turn it off.
        if (!secret && process.env.ADMIN_2FA_RESET !== "true") return bad("Two-factor settings can't be read. Use ADMIN_2FA_RESET.", 409);
        if (secret) {
          const step = verifyCode(secret, body.code, sec.totpLastStep);
          if (step === null) return wrongCode("That code didn't match.");
        }
        await updateSecurity({ totpSecret: null, totpPending: null, totpEnabledAt: null, totpLastStep: -1 });
        return NextResponse.json({ ok: true });
      }
      case "sign-out-session": {
        if (body.id === auth.session.id) return bad("Use Sign out to end this session.");
        await deleteSession(body.id);
        return NextResponse.json({ ok: true });
      }
      case "sign-out-others": {
        await deleteOtherSessions(auth.session.id);
        return NextResponse.json({ ok: true });
      }
      case "clear-lockouts": {
        await clearAllLoginAttempts();
        return NextResponse.json({ ok: true });
      }
      case "set-booking-login": {
        // Stored as a salted scrypt hash; everyone signed in with the old booking login is signed out.
        await updateSecurity({
          bookingUsername: body.username,
          bookingPasswordHash: await hashPassword(body.password),
          bookingUpdatedAt: new Date().toISOString(),
        });
        await deleteSessionsByRole("user");
        return NextResponse.json({ ok: true });
      }
    }
  } catch (err) {
    return errorResponse(err);
  }
}
