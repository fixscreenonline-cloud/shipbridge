import { NextResponse } from "next/server";
import { listUsers } from "@/lib/db";
import { errorResponse } from "@/lib/http";
import { requireAdmin } from "@/lib/session";
import { BodyError, readJson } from "@/lib/request";
import { NewCustomerSchema, ensureLegacyBookingUser, newCustomer, nextBookingUsername, usageThisMonth } from "@/lib/customers";
import { toCustomerView } from "@/lib/types";

export const runtime = "nodejs";

/** All customer accounts with this month's usage. Admin only. */
export async function GET(req: Request) {
  const auth = await requireAdmin(req);
  if ("response" in auth) return auth.response;
  try {
    await ensureLegacyBookingUser();
    const users = await listUsers();
    const rows = await Promise.all(users.map(async (u) => ({ ...toCustomerView(u), usage: await usageThisMonth(u.id) })));
    return NextResponse.json({ users: rows });
  } catch (err) {
    return errorResponse(err);
  }
}

/** Creates a customer account named booking<next number>. Admin only. */
export async function POST(req: Request) {
  const auth = await requireAdmin(req);
  if ("response" in auth) return auth.response;
  let raw: unknown;
  try {
    raw = await readJson(req, 4 * 1024);
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: (e as BodyError).status ?? 400 });
  }
  const parsed = NewCustomerSchema.safeParse(raw);
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Check the fields." }, { status: 400 });
  try {
    // Two admins creating at the same moment could pick the same number; the unique index refuses the
    // second, so try the next number.
    const existing = await listUsers();
    for (let attempt = 0; attempt < 5; attempt++) {
      try {
        const user = await newCustomer({ ...parsed.data, username: nextBookingUsername(existing, attempt) });
        return NextResponse.json({ user: toCustomerView(user) }, { status: 201 });
      } catch (err) {
        if ((err as Error).message !== "username taken") throw err;
      }
    }
    return NextResponse.json({ error: "Couldn't pick a free username. Try again." }, { status: 503 });
  } catch (err) {
    return errorResponse(err);
  }
}
