import { PageHeader } from "@/components/admin/PageHeader";
import { ShipmentsPanel } from "@/components/ShipmentsPanel";
import { listShipments, listUsers } from "@/lib/db";
import { requireAdminPage } from "@/lib/session";

export const dynamic = "force-dynamic";

export default async function AdminShipmentsPage({ searchParams }: { searchParams: Promise<{ open?: string; q?: string; customer?: string }> }) {
  await requireAdminPage("/admin/shipments");
  const [{ open, q, customer }, shipments, users] = await Promise.all([searchParams, listShipments(), listUsers()]);
  const ownerNames = Object.fromEntries(users.map((u) => [u.id, `${u.company || u.name || u.username} (@${u.username})`]));
  return (
    <>
      <PageHeader title="Shipments" description="Every label booked, per customer: what it cost, what they paid and your profit." />
      <ShipmentsPanel shipments={shipments} initialOpenId={open ?? null} initialQuery={q ?? ""} initialCustomer={customer ?? "all"} ownerNames={ownerNames} />
    </>
  );
}
