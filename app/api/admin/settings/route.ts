import { NextResponse } from "next/server";
import { SettingsSchema } from "@/lib/validation";
import { getSettings, updateSettings } from "@/lib/db";
import { requireAdmin } from "@/lib/session";
import { BodyError, readJson } from "@/lib/request";

export const runtime = "nodejs";

export async function GET(req: Request) {
  const auth = await requireAdmin(req);
  if ("response" in auth) return auth.response;
  return NextResponse.json({ settings: await getSettings() });
}

export async function PUT(req: Request) {
  const auth = await requireAdmin(req);
  if ("response" in auth) return auth.response;
  let raw: unknown;
  try {
    raw = await readJson(req, 2 * 1024);
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: (e as BodyError).status ?? 400 });
  }
  const parsed = SettingsSchema.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Invalid values." }, { status: 400 });
  }
  const settings = await updateSettings(parsed.data);
  return NextResponse.json({ settings });
}
