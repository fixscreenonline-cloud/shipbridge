import { PageHeader } from "@/components/admin/PageHeader";
import { DraftsList } from "@/components/admin/DraftsList";
import { listDrafts } from "@/lib/db";
import { requireAdminPage } from "@/lib/session";

export const dynamic = "force-dynamic";

export default async function AdminDraftsPage() {
  await requireAdminPage("/admin/drafts");
  const drafts = await listDrafts();
  return (
    <>
      <PageHeader
        title="Drafts"
        description="Price checks from the last 24 hours. Use one to refill the form and get fresh prices; drafts delete themselves after 24 hours."
      />
      <DraftsList drafts={drafts} />
    </>
  );
}
