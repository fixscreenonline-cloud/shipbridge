import { Overview } from "@/components/admin/Overview";
import { listDrafts, listShipments, listUsers } from "@/lib/db";
import { collectCarrierNotes } from "@/lib/requests";
import { requireAdminPage } from "@/lib/session";

export const dynamic = "force-dynamic";

export default async function AdminOverviewPage() {
  await requireAdminPage("/admin");
  const [shipments, drafts, users] = await Promise.all([listShipments(), listDrafts(), listUsers()]);
  const customers = users.map((u) => ({ id: u.id, name: u.company || u.name || u.username, username: u.username, active: u.active }));
  return <Overview shipments={shipments} customers={customers} noteCount={collectCarrierNotes(drafts).length} />;
}
