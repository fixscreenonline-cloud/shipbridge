import { NextResponse } from "next/server";
import { listDrafts, listShipments } from "@/lib/db";
import { errorResponse } from "@/lib/http";

export const runtime = "nodejs";

const RECENT_BOOKINGS = 20;

/** Drafts from the last 24 hours and recent bookings, for refilling the shipment form. Admin only (middleware). */
export async function GET() {
  try {
    const [drafts, shipments] = await Promise.all([listDrafts(), listShipments()]);
    const bookings = shipments.slice(0, RECENT_BOOKINGS).map((s) => ({
      id: s.id,
      createdAt: s.createdAt,
      serviceName: s.serviceName,
      carrierCode: s.carrierCode,
      charged: s.charged,
      currency: s.currency,
      trackingNo: s.trackingNo,
      request: s.request ?? null,
      details: s.details ?? null,
    }));
    return NextResponse.json({ drafts, bookings });
  } catch (err) {
    return errorResponse(err);
  }
}
