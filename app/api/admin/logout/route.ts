import { NextResponse } from "next/server";
import { endSession } from "@/lib/session";

export const runtime = "nodejs";

/** Ends this session on the server too, so a copied cookie stops working. */
export async function POST(req: Request) {
  const res = NextResponse.json({ ok: true });
  await endSession(res, req);
  return res;
}
