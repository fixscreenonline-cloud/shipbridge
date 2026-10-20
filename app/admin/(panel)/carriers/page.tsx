import { PageHeader } from "@/components/admin/PageHeader";
import { CarrierNotes } from "@/components/CarrierNotes";
import { listDrafts } from "@/lib/db";
import { collectCarrierNotes } from "@/lib/requests";
import { requireAdminPage } from "@/lib/session";

export const dynamic = "force-dynamic";

export default async function AdminCarriersPage() {
  await requireAdminPage("/admin/carriers");
  const drafts = await listDrafts();
  return (
    <>
      <PageHeader
        title="Carrier notes"
        description={`Why some carriers didn't quote, from ${drafts.length} price check${drafts.length === 1 ? "" : "s"} in the last 24 hours. Customers don't see these.`}
      />
      <CarrierNotes notes={collectCarrierNotes(drafts)} totalChecks={drafts.length} />
    </>
  );
}
