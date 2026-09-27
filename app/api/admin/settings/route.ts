import { NextResponse } from "next/server";
import { SettingsSchema } from "@/lib/validation";
import { getSettings, updateSettings } from "@/lib/db";

export const runtime = "nodejs";

export async function GET() {
  return NextResponse.json({ settings: await getSettings() });
}

export async function PUT(req: Request) {
  const parsed = SettingsSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Invalid values." }, { status: 400 });
  }
  const settings = await updateSettings(parsed.data);
  return NextResponse.json({ settings });
}
