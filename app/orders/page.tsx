import { redirect } from "next/navigation";
import { OrdersList, type OrderRow } from "@/components/OrdersList";
import { listShipments } from "@/lib/db";
import { usageThisMonth } from "@/lib/customers";
import { bookingRequest } from "@/lib/requests";
import { actorFromCookies } from "@/lib/session";

export const dynamic = "force-dynamic";

/** "My orders": the signed-in customer's labels. The admin sees everyone's in /admin/shipments. */
export default async function OrdersPage() {
  const actor = await actorFromCookies();
  if (!actor) redirect("/");
  if (actor.role === "admin") redirect("/admin/shipments");
  const [shipments, usage] = await Promise.all([listShipments(actor.ownerId), usageThisMonth(actor.ownerId)]);
  const place = (p?: { city: string; state: string } | null) => (p ? `${p.city}, ${p.state}` : "");
  const orders: OrderRow[] = shipments.map((s) => {
    const d = s.details;
    const parcel = d?.parcel
      ? `${d.parcel.length}×${d.parcel.width}×${d.parcel.height} ${d.parcel.distanceUnit ?? "in"} · ${d.parcel.weight} ${d.parcel.massUnit ?? "lb"}`
      : null;
    return {
      id: s.id,
      createdAt: s.createdAt,
      serviceName: s.serviceName,
      carrier: d?.carrier ?? s.carrierCode,
      trackingNo: s.trackingNo,
      trackingUrl: d?.trackingUrl && /^https?:\/\//.test(d.trackingUrl) ? d.trackingUrl : null,
      price: s.charged, // what the customer pays (their Shippo price + fee); the split isn't shown
      currency: s.currency,
      from: place(d?.from) || "—",
      to: d?.to ? `${d.to.name}, ${place(d.to)}` : s.recipient,
      parcel,
      canShipAgain: !!bookingRequest(s),
      hasLabel: s.labelUrls.length > 0,
    };
  });
  return (
    <div className="mx-auto w-full max-w-5xl px-4 pt-8 sm:px-6">
      <div className="mb-6">
        <h1 className="display text-3xl font-bold sm:text-4xl">My orders</h1>
        <p className="mt-2 text-steel">Every label you&apos;ve bought. Reprint, track or ship the same parcel again.</p>
      </div>
      <OrdersList orders={orders} month={{ labels: usage.labels, spend: usage.spend }} />
    </div>
  );
}
