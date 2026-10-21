import NextLink from "next/link";
import { notFound } from "next/navigation";
import { PageHeader } from "@/components/admin/PageHeader";
import { CustomerEditor } from "@/components/admin/CustomerEditor";
import { getUser, listDrafts, listShipments } from "@/lib/db";
import { usageThisMonth } from "@/lib/customers";
import { requireAdminPage } from "@/lib/session";
import { toCustomerView } from "@/lib/types";

export const dynamic = "force-dynamic";

export default async function AdminCustomerPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  await requireAdminPage(`/admin/users/${id}`);
  const user = await getUser(id);
  if (!user) notFound();
  const [usage, shipments, drafts] = await Promise.all([usageThisMonth(id), listShipments(id), listDrafts(id)]);
  return (
    <>
      <PageHeader
        title={user.company || user.name || user.username}
        description={
          <NextLink href="/admin/users" className="hover:underline">
            ← All users
          </NextLink>
        }
      />
      {/* key: after a save + refresh, the editor starts from the saved values */}
      <CustomerEditor key={user.updatedAt} customer={toCustomerView(user)} usage={usage} recent={shipments.slice(0, 6)} drafts={drafts} />
    </>
  );
}
