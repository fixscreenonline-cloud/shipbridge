import { NextResponse } from "next/server";
import { z } from "zod";
import { updateUser } from "@/lib/db";
import { errorResponse } from "@/lib/http";
import { requireUser } from "@/lib/session";
import { BodyError, rateLimit, readJson } from "@/lib/request";
import { sealShippoKey } from "@/lib/customers";
import { CarrierApiError, checkShippoKey } from "@/lib/shippo";

export const runtime = "nodejs";

const Body = z.object({ token: z.string().trim().regex(/^shippo_(test|live)_[A-Za-z0-9]{10,100}$/, "That doesn't look like a Shippo API key (shippo_test_… or shippo_live_…).") });

/** A customer saves their own Shippo key; it's checked with Shippo first and stored encrypted. */
export async function PUT(req: Request) {
  const auth = await requireUser(req);
  if ("response" in auth) return auth.response;
  if (!auth.actor.user) return NextResponse.json({ error: "Admin bookings use SHIPPO_API_TOKEN." }, { status: 400 });
  const limited = await rateLimit(req, "shippo-key", 10, 10 * 60 * 1000);
  if (limited) return limited;

  let raw: unknown;
  try {
    raw = await readJson(req, 2 * 1024);
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: (e as BodyError).status ?? 400 });
  }
  const parsed = Body.safeParse(raw);
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message }, { status: 400 });

  try {
    const mode = await checkShippoKey(parsed.data.token);
    await updateUser(auth.actor.user.id, {
      shippo: { ...sealShippoKey(parsed.data.token), mode, updatedAt: new Date().toISOString() },
    });
    return NextResponse.json({ ok: true, mode, last4: parsed.data.token.slice(-4) });
  } catch (err) {
    if (err instanceof CarrierApiError) {
      return NextResponse.json({ error: `Shippo didn't accept this key: ${err.message}` }, { status: 400 });
    }
    return errorResponse(err);
  }
}

/** A customer removes their Shippo key. */
export async function DELETE(req: Request) {
  const auth = await requireUser(req);
  if ("response" in auth) return auth.response;
  if (!auth.actor.user) return NextResponse.json({ error: "Not available for admin." }, { status: 400 });
  await updateUser(auth.actor.user.id, { shippo: { tokenEnc: null, last4: null, mode: null, updatedAt: new Date().toISOString() } });
  return NextResponse.json({ ok: true });
}
