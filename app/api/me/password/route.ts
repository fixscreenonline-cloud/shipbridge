import { NextResponse } from "next/server";
import { z } from "zod";
import { deleteSessionsByUser, updateUser } from "@/lib/db";
import { errorResponse } from "@/lib/http";
import { requireUser, startSession } from "@/lib/session";
import { BodyError, rateLimit, readJson } from "@/lib/request";
import { hashPassword, verifyPassword } from "@/lib/passwords";

export const runtime = "nodejs";

const Body = z.object({
  current: z.string().min(1).max(256),
  next: z.string().min(8, "New password needs at least 8 characters").max(256),
});

/** A customer changes their own password; their other devices are signed out. */
export async function POST(req: Request) {
  const auth = await requireUser(req);
  if ("response" in auth) return auth.response;
  const user = auth.actor.user;
  if (!user) return NextResponse.json({ error: "The admin password is set in the environment." }, { status: 400 });
  const limited = await rateLimit(req, "password-change", 10, 10 * 60 * 1000);
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
    if (!(await verifyPassword(parsed.data.current, user.passwordHash))) {
      return NextResponse.json({ error: "Current password is incorrect." }, { status: 400 });
    }
    await updateUser(user.id, { passwordHash: await hashPassword(parsed.data.next) });
    await deleteSessionsByUser(user.id); // every device signs in again...
    const res = NextResponse.json({ ok: true });
    await startSession(res, req, "user", user.username, user.id); // ...except this one
    return res;
  } catch (err) {
    return errorResponse(err);
  }
}
