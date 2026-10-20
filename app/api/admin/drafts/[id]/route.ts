import { NextResponse } from "next/server";
import { deleteDraft } from "@/lib/db";
import { errorResponse } from "@/lib/http";
import { requireAdmin } from "@/lib/session";

export const runtime = "nodejs";

/** Removes a draft and its unbought quotes. Admin only (middleware). */
export async function DELETE(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireAdmin(req);
  if ("response" in auth) return auth.response;
  try {
    await deleteDraft((await params).id);
    return NextResponse.json({ ok: true });
  } catch (err) {
    return errorResponse(err);
  }
}
