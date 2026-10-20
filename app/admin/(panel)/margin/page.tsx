import { PageHeader } from "@/components/admin/PageHeader";
import { MarginSettings } from "@/components/admin/MarginSettings";
import { getSettings } from "@/lib/db";
import { requireAdminPage } from "@/lib/session";

export const dynamic = "force-dynamic";

export default async function AdminMarginPage() {
  await requireAdminPage("/admin/margin");
  const settings = await getSettings();
  return (
    <>
      <PageHeader title="Margin" description="Added on top of every Shippo rate. Customers only see the final price." />
      <MarginSettings initial={settings} />
    </>
  );
}
