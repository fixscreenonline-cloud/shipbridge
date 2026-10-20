import { redirect } from "next/navigation";
import { AdminShell } from "@/components/admin/AdminShell";
import { roleOf, sessionFromCookies } from "@/lib/session";

export const dynamic = "force-dynamic";

// Every admin page (not the sign-in page) shares this menu. Middleware checked the cookie's signature;
// here we also confirm the session still exists, so a signed-out session can't open admin pages.
export default async function AdminPanelLayout({ children }: { children: React.ReactNode }) {
  const session = await sessionFromCookies();
  // Booking-only sign-ins can't open the admin area.
  if (!session || roleOf(session) !== "admin") redirect("/admin/login");
  return <AdminShell sessionEndsAt={Date.parse(session.expiresAt)}>{children}</AdminShell>;
}
