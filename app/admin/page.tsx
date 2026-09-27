import { AdminDashboard } from "@/components/AdminDashboard";
import { getSettings, listShipments } from "@/lib/db";

export const dynamic = "force-dynamic";

export default async function AdminPage() {
  const [settings, shipments] = await Promise.all([getSettings(), listShipments()]);
  return <AdminDashboard initialSettings={settings} initialShipments={shipments} />;
}
