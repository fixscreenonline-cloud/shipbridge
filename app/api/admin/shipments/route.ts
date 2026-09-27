import { NextResponse } from "next/server";
import { listShipments } from "@/lib/db";

export const runtime = "nodejs";

export async function GET() {
  return NextResponse.json({ shipments: await listShipments() });
}
