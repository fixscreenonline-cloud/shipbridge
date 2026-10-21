import "server-only";
import { randomUUID } from "crypto";
import { z } from "zod";
import { createUser, getSecurity, getUser, listShipments, listUsers, updateSecurity } from "./db";
import { hashPassword } from "./passwords";
import { seal, unseal } from "./secret-box";
import { AddressSchema } from "./validation";
import { ADMIN_OWNER, defaultCustomerSettings, type CustomerUser } from "./types";

const KEY_PURPOSE = "shippo-key";

export const USERNAME_RE = /^[A-Za-z0-9._@-]{3,64}$/;

/** The customer's Shippo key, decrypted (server only), or null if none / unreadable. */
export function customerShippoKey(u: CustomerUser): string | null {
  return u.shippo.tokenEnc ? unseal(u.shippo.tokenEnc, KEY_PURPOSE) : null;
}

export function sealShippoKey(token: string) {
  return { tokenEnc: seal(token, KEY_PURPOSE), last4: token.slice(-4) };
}

export async function newCustomer(input: { username: string; password: string; name: string; company: string; email: string }) {
  const now = new Date().toISOString();
  const user: CustomerUser = {
    id: "u_" + randomUUID().replace(/-/g, "").slice(0, 20),
    username: input.username.trim(),
    usernameLower: input.username.trim().toLowerCase(),
    passwordHash: await hashPassword(input.password),
    name: input.name.trim(),
    company: input.company.trim(),
    email: input.email.trim(),
    active: true,
    createdAt: now,
    updatedAt: now,
    settings: defaultCustomerSettings(),
    shippo: { tokenEnc: null, last4: null, mode: null, updatedAt: null },
  };
  await createUser(user);
  return user;
}

/**
 * One-time move from the single "booking login" (Admin → Security, or BOOKING_* env vars) to a customer
 * account, so the existing login keeps working. Runs only while there are no customer accounts yet.
 */
export async function ensureLegacyBookingUser() {
  if ((await listUsers()).length > 0) return;
  const sec = await getSecurity();
  const username = sec.bookingUsername ?? process.env.BOOKING_USERNAME?.trim();
  if (!username) return;
  let passwordHash = sec.bookingPasswordHash;
  if (!passwordHash) {
    const pw = process.env.BOOKING_PASSWORD;
    if (!pw) return;
    passwordHash = await hashPassword(pw);
  }
  const now = new Date().toISOString();
  await createUser({
    id: "u_" + randomUUID().replace(/-/g, "").slice(0, 20),
    username,
    usernameLower: username.toLowerCase(),
    passwordHash,
    name: username,
    company: "",
    email: "",
    active: true,
    createdAt: now,
    updatedAt: now,
    settings: defaultCustomerSettings(),
    shippo: { tokenEnc: null, last4: null, mode: null, updatedAt: null },
  }).catch(() => undefined); // another request may have just done it
  await updateSecurity({ bookingUsername: null, bookingPasswordHash: null });
}

/** Labels, spend (what they paid incl. your fee) and your fees in the current calendar month (UTC). */
export async function usageThisMonth(ownerId: string) {
  const start = new Date();
  start.setUTCDate(1);
  start.setUTCHours(0, 0, 0, 0);
  const rows = (await listShipments(ownerId)).filter((s) => s.createdAt >= start.toISOString());
  const round = (n: number) => Math.round(n * 100) / 100;
  return {
    since: start.toISOString(),
    labels: rows.length,
    spend: round(rows.reduce((t, s) => t + s.charged, 0)),
    fees: round(rows.reduce((t, s) => t + s.profit, 0)),
  };
}

// ---- What the admin can change ----
const money = (max: number) => z.coerce.number().min(0).max(max);
export const CustomerUpdateSchema = z
  .object({
    name: z.string().trim().max(100),
    company: z.string().trim().max(120),
    email: z.union([z.literal(""), z.string().trim().email("Enter a valid email").max(254)]),
    active: z.boolean(),
    settings: z
      .object({
        feePercent: money(500),
        feeFlat: money(100),
        defaultSender: AddressSchema.nullable(),
        monthlyLabelLimit: z.coerce.number().int().min(0).max(1_000_000).nullable(),
        monthlySpendLimit: money(10_000_000).nullable(),
        allowedCarriers: z.array(z.string().trim().min(1).max(40)).max(40),
        labelFileType: z.enum(["PDF_4x6", "PDF_4x8", "PDF", "PDF_A4", "PDF_A6", "PDF_2.3x7.5", "PNG", "PNG_2.3x7.5", "ZPLII"]),
        scanEnabled: z.boolean(),
      })
      .partial(),
  })
  .partial();

/** The next free "booking<number>" username: booking1, booking2, … (one past the highest in use). */
export function nextBookingUsername(existing: { usernameLower: string }[], skip = 0): string {
  const highest = existing.reduce((max, u) => {
    const m = /^booking(\d+)$/.exec(u.usernameLower);
    return m ? Math.max(max, Number(m[1])) : max;
  }, 0);
  return `booking${highest + 1 + skip}`;
}

/** The admin never picks a username: the server assigns the next one (see nextBookingUsername). */
export const NewCustomerSchema = z.object({
  password: z.string().min(8, "Password needs at least 8 characters").max(256),
  name: z.string().trim().max(100).default(""),
  company: z.string().trim().max(120).default(""),
  email: z.union([z.literal(""), z.string().trim().email("Enter a valid email").max(254)]).default(""),
});

/** The Shippo key that owns a booking: the customer's own, or SHIPPO_API_TOKEN for the admin's. */
export async function shippoKeyForOwner(ownerId: string): Promise<string | null> {
  if (ownerId === ADMIN_OWNER) return process.env.SHIPPO_API_TOKEN || null;
  const user = await getUser(ownerId);
  return user ? customerShippoKey(user) : null;
}
