import { PageHeader } from "@/components/admin/PageHeader";
import { ShipmentsPanel } from "@/components/ShipmentsPanel";
import { listShipments } from "@/lib/db";
import { requireAdminPage } from "@/lib/session";

export const dynamic = "force-dynamic";

export default async function AdminShipmentsPage({ searchParams }: { searchParams: Promise<{ open?: string }> }) {
  await requireAdminPage("/admin/shipments");
  const [{ open }, shipments] = await Promise.all([searchParams, listShipments()]);
  return (
    <>
      <PageHeader title="Shipments" description="Every label you bought, with what it cost, what the customer paid and your profit." />
      <ShipmentsPanel shipments={shipments} initialOpenId={open ?? null} />
    </>
  );
}
