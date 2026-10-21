import { NextResponse } from "next/server";
import { getShipment } from "@/lib/db";
import { shippoKeyForOwner } from "@/lib/customers";
import { ownerOf } from "@/lib/types";
import { getTransaction } from "@/lib/shippo";
import { errorResponse } from "@/lib/http";
import { safeHttpUrl } from "@/lib/request";
import { requireAdmin } from "@/lib/session";

export const runtime = "nodejs";

/**
 * Opens a booking's label. Shippo label links are signed and expire, so fetch the transaction again
 * for a fresh link, falling back to the stored one. Admin only (middleware).
 */
export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireAdmin(req);
  if ("response" in auth) return auth.response;
  try {
    const { id } = await params;
    const shipment = await getShipment(id);
    if (!shipment) return NextResponse.json({ error: "Shipment not found." }, { status: 404 });

    let url = safeHttpUrl(shipment.labelUrls[0]);
    if (/^[0-9a-f]{32}$/.test(shipment.shipmentNo)) {
      const tx = await getTransaction(await shippoKeyForOwner(ownerOf(shipment)), shipment.shipmentNo).catch(() => null);
      if (safeHttpUrl(tx?.label_url)) url = safeHttpUrl(tx?.label_url);
    }
    if (!url) return NextResponse.json({ error: "This shipment has no label." }, { status: 404 });
    return NextResponse.redirect(url);
  } catch (err) {
    return errorResponse(err);
  }
}
