import { PageHeader } from "@/components/admin/PageHeader";
import { UsersList } from "@/components/admin/UsersList";
import { listUsers } from "@/lib/db";
import { ensureLegacyBookingUser, usageThisMonth } from "@/lib/customers";
import { requireAdminPage } from "@/lib/session";
import { toCustomerView } from "@/lib/types";

export const dynamic = "force-dynamic";

export default async function AdminUsersPage() {
  await requireAdminPage("/admin/users");
  await ensureLegacyBookingUser();
  const users = await listUsers();
  const rows = await Promise.all(users.map(async (u) => ({ ...toCustomerView(u), usage: await usageThisMonth(u.id) })));
  return (
    <>
      <PageHeader
        title="Users"
        description="Your customers. Each signs in on the home screen, uses their own Shippo account, and pays you the fee you set."
      />
      <UsersList users={rows} />
    </>
  );
}
