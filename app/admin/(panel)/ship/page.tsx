import { ShipmentForm } from "@/components/ShipmentForm";
import { getDraft, listShipments } from "@/lib/db";
import { bookingRequest } from "@/lib/requests";
import type { ShipmentRequest } from "@/lib/types";
import { requireAdminPage } from "@/lib/session";

export const dynamic = "force-dynamic";

/** /admin/ship, optionally prefilled: ?draft=<id> (a price check) or ?booking=<id> (ship again). */
export default async function AdminShipPage({ searchParams }: { searchParams: Promise<{ draft?: string; booking?: string }> }) {
  await requireAdminPage("/admin/ship");
  const { draft: draftId, booking: bookingId } = await searchParams;
  let initial: ShipmentRequest | null = null;
  let from: string | undefined;

  if (draftId) {
    const d = await getDraft(draftId);
    if (d) {
      initial = { from: d.from, to: d.to, package: d.package, shipDate: d.shipDate };
      from = "draft";
    }
  } else if (bookingId) {
    const s = (await listShipments()).find((x) => x.id === bookingId);
    if (s) {
      initial = bookingRequest(s);
      from = "past booking";
    }
  }

  // key: a different draft/booking starts a fresh form.
  return <ShipmentForm key={draftId ?? bookingId ?? "new"} initialRequest={initial} prefilledFrom={from} admin scanEnabled={!!process.env.ANTHROPIC_API_KEY} />;
}
