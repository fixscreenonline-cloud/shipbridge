import { PageHeader } from "@/components/admin/PageHeader";
import { SecurityCenter } from "@/components/admin/SecurityCenter";
import { getSecurity, listLockedLogins, listSessions } from "@/lib/db";
import { requireAdminPage, roleOf } from "@/lib/session";
import { adminUsername, bookingLogin } from "@/lib/login-flow";

export const dynamic = "force-dynamic";

export default async function AdminSecurityPage() {
  const me = await requireAdminPage("/admin/security");
  const [security, sessions, locked, booking] = await Promise.all([getSecurity(), listSessions(), listLockedLogins(), bookingLogin()]);

  const password = process.env.ADMIN_PASSWORD ?? "";
  const kinds = [/[a-z]/, /[A-Z]/, /\d/, /[^A-Za-z0-9]/].filter((r) => r.test(password)).length;
  const isProd = process.env.NODE_ENV === "production";
  const twoFactorOn = !!security.totpSecret;

  const checks = [
    {
      label: "Strong admin password",
      ok: password.length >= 12 && kinds >= 3,
      detail: password.length >= 12 && kinds >= 3 ? `${password.length} characters, mixed types` : "Use 12+ characters with upper, lower, digits and symbols",
    },
    {
      label: "Two-factor sign-in",
      ok: twoFactorOn && process.env.ADMIN_2FA_RESET !== "true",
      detail: twoFactorOn ? (process.env.ADMIN_2FA_RESET === "true" ? "Skipped: ADMIN_2FA_RESET is set" : "Code required at sign-in") : "Turn it on below",
    },
    { label: "1-hour sessions, signed out server-side", ok: true, detail: "Sign out ends a session everywhere" },
    { label: "Lockout after 3 wrong attempts", ok: true, detail: "1 h, doubling up to 24 h" },
    {
      label: "Session secret",
      ok: (process.env.ADMIN_SESSION_SECRET ?? "").length >= 32,
      detail: (process.env.ADMIN_SESSION_SECRET ?? "").length >= 32 ? "Long random value" : "Use 32+ random characters",
    },
    {
      label: "HTTPS-only cookie",
      ok: isProd,
      detail: isProd ? "Secure __Host- cookie + HSTS" : "Applies on the live (https) site; local dev uses http",
    },
  ];

  return (
    <>
      <PageHeader title="Security" description="Who can sign in to ShipBridge admin, and how." />
      <SecurityCenter
        twoFactorOn={twoFactorOn}
        twoFactorSince={security.totpEnabledAt}
        resetFlag={process.env.ADMIN_2FA_RESET === "true"}
        sessions={sessions.map((s) => ({
          ...s,
          current: s.id === me.id,
          role: roleOf(s),
          username: s.username ?? (roleOf(s) === "admin" ? adminUsername() : "booking"),
        }))}
        booking={{ username: booking?.username ?? null, source: booking?.source ?? null, updatedAt: security.bookingUpdatedAt }}
        adminUsername={adminUsername()}
        lockouts={locked.map((l) => ({ kind: l.key.startsWith("device:") ? "device" : "network", lockedUntil: l.lockedUntil, level: l.level }))}
        checks={checks}
      />
    </>
  );
}
