import { Overview } from "@/components/admin/Overview";
import { getSettings, listDrafts, listShipments } from "@/lib/db";
import { collectCarrierNotes } from "@/lib/requests";
import { requireAdminPage } from "@/lib/session";

export const dynamic = "force-dynamic";

export default async function AdminOverviewPage() {
  await requireAdminPage("/admin");
  const [settings, shipments, drafts] = await Promise.all([getSettings(), listShipments(), listDrafts()]);
  return <Overview shipments={shipments} drafts={drafts} settings={settings} noteCount={collectCarrierNotes(drafts).length} />;
}
