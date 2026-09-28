import { cookies } from "next/headers";
import { AdminDashboard } from "@/components/AdminDashboard";
import { SESSION_COOKIE } from "@/lib/auth";
import { getSettings, listShipments } from "@/lib/db";

export const dynamic = "force-dynamic";

export default async function AdminPage() {
  const [settings, shipments, jar] = await Promise.all([getSettings(), listShipments(), cookies()]);
  // Middleware already verified the token; its middle part is the expiry time.
  const sessionEndsAt = Number(jar.get(SESSION_COOKIE)?.value.split(".")[1]) || null;
  return <AdminDashboard initialSettings={settings} initialShipments={shipments} sessionEndsAt={sessionEndsAt} />;
}
