import { NextResponse } from "next/server";
import { z } from "zod";
import { deleteSessionsByUser, getUser, updateUser } from "@/lib/db";
import { errorResponse } from "@/lib/http";
import { requireAdmin } from "@/lib/session";
import { BodyError, readJson } from "@/lib/request";
import { CustomerUpdateSchema } from "@/lib/customers";
import { hashPassword } from "@/lib/passwords";
import { toCustomerView, type CustomerUser } from "@/lib/types";

export const runtime = "nodejs";

type Ctx = { params: Promise<{ id: string }> };

async function body(req: Request) {
  try {
    return { raw: await readJson(req, 8 * 1024) };
  } catch (e) {
    return { response: NextResponse.json({ error: (e as Error).message }, { status: (e as BodyError).status ?? 400 }) };
  }
}

/** Updates a customer's profile, on/off switch or settings. Switching off signs them out. Admin only. */
export async function PATCH(req: Request, { params }: Ctx) {
  const auth = await requireAdmin(req);
  if ("response" in auth) return auth.response;
  const { id } = await params;
  const b = await body(req);
  if ("response" in b) return b.response;
  // Usernames are permanent (the login and the account history stay tied to one name).
  if (b.raw && typeof b.raw === "object" && ("username" in b.raw || "usernameLower" in b.raw || "id" in b.raw)) {
    return NextResponse.json({ error: "A username can't be changed once the account is created." }, { status: 400 });
  }
  const parsed = CustomerUpdateSchema.safeParse(b.raw);
  if (!parsed.success) {
    const i = parsed.error.issues[0];
    return NextResponse.json({ error: i ? `${i.path.join(" › ")}: ${i.message}` : "Check the fields." }, { status: 400 });
  }
  try {
    const current = await getUser(id);
    if (!current) return NextResponse.json({ error: "Customer not found." }, { status: 404 });
    const { settings, ...rest } = parsed.data;
    const patch: Partial<CustomerUser> = { ...rest };
    if (settings) patch.settings = { ...current.settings, ...settings };
    const updated = await updateUser(id, patch);
    if (parsed.data.active === false) await deleteSessionsByUser(id);
    return NextResponse.json({ user: toCustomerView(updated!) });
  } catch (err) {
    return errorResponse(err);
  }
}

const Action = z.discriminatedUnion("action", [
  z.object({ action: z.literal("reset-password"), password: z.string().min(8, "Password needs at least 8 characters").max(256) }),
  z.object({ action: z.literal("remove-shippo-key") }),
]);

/** Account actions: reset password (signs them out) or remove their Shippo key. Admin only. */
export async function POST(req: Request, { params }: Ctx) {
  const auth = await requireAdmin(req);
  if ("response" in auth) return auth.response;
  const { id } = await params;
  const b = await body(req);
  if ("response" in b) return b.response;
  const parsed = Action.safeParse(b.raw);
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Unknown action." }, { status: 400 });
  try {
    if (!(await getUser(id))) return NextResponse.json({ error: "Customer not found." }, { status: 404 });
    if (parsed.data.action === "reset-password") {
      await updateUser(id, { passwordHash: await hashPassword(parsed.data.password) });
      await deleteSessionsByUser(id);
    } else {
      await updateUser(id, { shippo: { tokenEnc: null, last4: null, mode: null, updatedAt: new Date().toISOString() } });
    }
    return NextResponse.json({ ok: true });
  } catch (err) {
    return errorResponse(err);
  }
}
