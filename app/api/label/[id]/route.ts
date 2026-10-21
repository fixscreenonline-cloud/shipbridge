import { NextResponse } from "next/server";
import { getShipment } from "@/lib/db";
import { shippoKeyForOwner } from "@/lib/customers";
import { ownerOf } from "@/lib/types";
import { getTransaction } from "@/lib/shippo";
import { requireUser } from "@/lib/session";
import { safeHttpUrl } from "@/lib/request";

export const runtime = "nodejs";

const MAX_BYTES = 15 * 1024 * 1024;
const ALLOWED_TYPES = ["application/pdf", "image/png", "application/octet-stream"];

/**
 * Serves a booking's label from this site, so the page can print it (browsers only print same-site
 * documents). Fetches a fresh link from Shippo first, since stored label links expire.
 * Signed-in users (booking login or admin) only.
 */
export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireUser(req);
  if ("response" in auth) return auth.response;

  const { id } = await params;
  const shipment = await getShipment(id);
  // Customers can only reach their own labels; the admin can reach all.
  if (!shipment || (auth.actor.role !== "admin" && ownerOf(shipment) !== auth.actor.ownerId)) {
    return NextResponse.json({ error: "Shipment not found." }, { status: 404 });
  }

  let url = safeHttpUrl(shipment.labelUrls[0]);
  if (/^[0-9a-f]{32}$/.test(shipment.shipmentNo)) {
    const tx = await getTransaction(await shippoKeyForOwner(ownerOf(shipment)), shipment.shipmentNo).catch(() => null);
    url = safeHttpUrl(tx?.label_url) ?? url;
  }
  // Labels come from Shippo over https; http://localhost is allowed only in development (local stand-ins).
  const allowed = url?.startsWith("https://") || (process.env.NODE_ENV !== "production" && url?.startsWith("http://localhost:"));
  if (!url || !allowed) return NextResponse.json({ error: "This shipment has no label." }, { status: 404 });

  const upstream = await fetch(url, { cache: "no-store", signal: AbortSignal.timeout(20_000) }).catch(() => null);
  if (!upstream?.ok || !upstream.body) {
    return NextResponse.json({ error: "Couldn't download the label. Try Open label instead." }, { status: 502 });
  }
  const type = (upstream.headers.get("content-type") ?? "").split(";")[0].trim().toLowerCase();
  const size = Number(upstream.headers.get("content-length") ?? 0);
  if (!ALLOWED_TYPES.includes(type) || size > MAX_BYTES) {
    return NextResponse.json({ error: "Unexpected label file." }, { status: 502 });
  }
  const body = Buffer.from(await upstream.arrayBuffer());
  if (body.length > MAX_BYTES) return NextResponse.json({ error: "Label file is too large." }, { status: 502 });
  const isPng = type === "image/png" || body.subarray(0, 4).toString("hex") === "89504e47";

  return new NextResponse(body, {
    headers: {
      "Content-Type": isPng ? "image/png" : "application/pdf",
      "Content-Disposition": `inline; filename="label-${shipment.trackingNo ?? shipment.shipmentNo}.${isPng ? "png" : "pdf"}"`,
      "Cache-Control": "private, no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
