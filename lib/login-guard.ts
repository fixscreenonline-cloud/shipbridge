import "server-only";
import { createHash, randomUUID } from "crypto";
import { addLoginFailure, clearLoginAttempts, getLoginAttempts, lockLogin } from "./db";

/**
 * Admin sign-in lockout.
 *
 * A "device" is tracked two ways, and a lock on either one blocks sign-in:
 *  - a long-lived random cookie (survives network changes), and
 *  - the client IP (survives clearing cookies / private windows).
 * After MAX_FAILURES wrong passwords the device is locked. Each lockout doubles:
 * 1h → 2h → 4h → 8h → 16h → 24h (cap). A successful sign-in resets everything for that device.
 */
export const MAX_FAILURES = 3;
const FIRST_LOCK_MS = 60 * 60 * 1000;
const MAX_LOCK_MS = 24 * 60 * 60 * 1000;

export const DEVICE_COOKIE = "sb_device";
export const DEVICE_COOKIE_MAX_AGE = 365 * 24 * 60 * 60;

export function lockDuration(level: number) {
  return Math.min(FIRST_LOCK_MS * 2 ** level, MAX_LOCK_MS);
}

function clientIp(req: Request) {
  // Vercel sets x-real-ip; elsewhere fall back to the first x-forwarded-for hop.
  return req.headers.get("x-real-ip") || req.headers.get("x-forwarded-for")?.split(",")[0].trim() || "unknown";
}

const hash = (s: string) => createHash("sha256").update(s).digest("hex").slice(0, 32);

/** The device id from its cookie, or a new one to set. */
export function deviceId(req: Request) {
  const cookie = req.headers
    .get("cookie")
    ?.split(";")
    .map((c) => c.trim().split("="))
    .find(([k]) => k === DEVICE_COOKIE)?.[1];
  const valid = cookie && /^[0-9a-f-]{36}$/.test(cookie);
  return { id: valid ? cookie : randomUUID(), isNew: !valid };
}

/** Storage keys for this request. IPs are hashed so raw addresses aren't stored. */
export function guardKeys(req: Request, device: string) {
  return [`device:${device}`, `ip:${hash(clientIp(req))}`];
}

/** If any key is locked, when the lock ends. */
export async function lockedUntil(keys: string[]): Promise<Date | null> {
  const records = await getLoginAttempts(keys);
  const ends = Object.values(records)
    .map((a) => (a.lockedUntil ? Date.parse(a.lockedUntil) : 0))
    .filter((t) => t > Date.now());
  return ends.length ? new Date(Math.max(...ends)) : null;
}

/** Records a wrong password. Returns the lock end if this failure triggered a lockout, else attempts left. */
export async function recordFailure(keys: string[]): Promise<{ lockedUntil: Date } | { attemptsLeft: number }> {
  let lockEnd: Date | null = null;
  let left = MAX_FAILURES;
  for (const key of keys) {
    const a = await addLoginFailure(key);
    if (a.failures >= MAX_FAILURES) {
      const until = new Date(Date.now() + lockDuration(a.level));
      await lockLogin(key, a.failures, until.toISOString());
      if (!lockEnd || until > lockEnd) lockEnd = until;
    } else {
      left = Math.min(left, MAX_FAILURES - a.failures);
    }
  }
  return lockEnd ? { lockedUntil: lockEnd } : { attemptsLeft: left };
}

export function recordSuccess(keys: string[]) {
  return clearLoginAttempts(keys);
}
