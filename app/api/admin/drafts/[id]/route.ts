import { NextResponse } from "next/server";
import { deleteDraft } from "@/lib/db";
import { errorResponse } from "@/lib/http";

export const runtime = "nodejs";

/** Removes a draft and its unbought quotes. Admin only (middleware). */
export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    await deleteDraft((await params).id);
    return NextResponse.json({ ok: true });
  } catch (err) {
    return errorResponse(err);
  }
}
