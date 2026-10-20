"use client";

import { useEffect, useState } from "react";
import NextLink from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { AlertIcon, BoxIcon, DraftIcon, GridIcon, ListIcon, LogoutIcon, PercentIcon, PlusIcon, ShieldIcon } from "../icons";

const NAV = [
  { href: "/admin", label: "Overview", icon: GridIcon },
  { href: "/admin/ship", label: "New shipment", icon: PlusIcon },
  { href: "/admin/shipments", label: "Shipments", icon: ListIcon },
  { href: "/admin/drafts", label: "Drafts", icon: DraftIcon },
  { href: "/admin/margin", label: "Margin", icon: PercentIcon },
  { href: "/admin/carriers", label: "Carrier notes", icon: AlertIcon },
  { href: "/admin/security", label: "Security", icon: ShieldIcon },
];

// Whole path segments only, so /admin/shipments doesn't also light up /admin/ship.
const isActive = (path: string, href: string) => path === href || (href !== "/admin" && path.startsWith(`${href}/`));

function useSession(sessionEndsAt: number | null) {
  const router = useRouter();
  const [now, setNow] = useState<number | null>(null); // null until mounted: times use the viewer's clock

  useEffect(() => {
    setNow(Date.now());
    const tick = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(tick);
  }, []);

  // Sessions last 1 hour; leave the page when it runs out rather than failing on the next action.
  useEffect(() => {
    if (!sessionEndsAt) return;
    const t = setTimeout(
      () => router.replace(`/admin/login?next=${encodeURIComponent(location.pathname)}`),
      Math.max(sessionEndsAt - Date.now(), 0),
    );
    return () => clearTimeout(t);
  }, [sessionEndsAt, router]);

  async function signOut() {
    await fetch("/api/admin/logout", { method: "POST" });
    router.replace("/admin/login");
    router.refresh();
  }

  const minutesLeft = now && sessionEndsAt ? Math.max(0, Math.ceil((sessionEndsAt - now) / 60000)) : null;
  const endsAt = now && sessionEndsAt ? new Date(sessionEndsAt).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" }) : null;
  return { minutesLeft, endsAt, signOut };
}

export function AdminShell({ sessionEndsAt, children }: { sessionEndsAt: number | null; children: React.ReactNode }) {
  const path = usePathname();
  const { minutesLeft, endsAt, signOut } = useSession(sessionEndsAt);
  const lowTime = minutesLeft !== null && minutesLeft <= 5;

  return (
    <div className="mx-auto w-full max-w-7xl px-4 pt-6 sm:px-6 lg:grid lg:grid-cols-[232px_1fr] lg:gap-8 lg:pt-8">
      {/* Desktop: sidebar */}
      <aside className="hidden lg:block">
        <div className="sticky top-6 space-y-4">
          <nav aria-label="Admin" className="rounded-xl border border-ink/10 bg-content1 p-2 shadow-sm">
            <p className="px-3 pb-2 pt-2 text-[11px] font-semibold uppercase tracking-[0.12em] text-steel">Admin</p>
            <ul className="space-y-0.5">
              {NAV.map(({ href, label, icon: Icon }) => {
                const active = isActive(path, href);
                return (
                  <li key={href}>
                    <NextLink
                      href={href}
                      aria-current={active ? "page" : undefined}
                      className={`flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium outline-none transition-colors focus-visible:ring-2 focus-visible:ring-hivis ${
                        active ? "bg-ink text-white shadow-sm" : "text-foreground/80 hover:bg-default-100 hover:text-foreground"
                      }`}
                    >
                      <Icon className={`size-[18px] ${active ? "text-hivis" : "text-steel"}`} />
                      {label}
                    </NextLink>
                  </li>
                );
              })}
            </ul>
          </nav>

          <div className="rounded-xl border border-ink/10 bg-content1 p-4 text-sm shadow-sm">
            <p className="flex items-center gap-2 font-medium">
              <span className={`size-2 rounded-full ${lowTime ? "bg-warning" : "bg-success"}`} aria-hidden />
              Signed in
            </p>
            <p className={`mt-1 text-xs ${lowTime ? "text-warning-600" : "text-steel"}`}>
              {endsAt ? `Session ends ${endsAt}${minutesLeft !== null ? ` · ${minutesLeft} min left` : ""}` : "Session active"}
            </p>
            <button
              type="button"
              onClick={signOut}
              className="mt-3 flex w-full items-center justify-center gap-2 rounded-lg border border-ink/15 px-3 py-2 text-sm font-medium outline-none transition-colors hover:bg-default-100 focus-visible:ring-2 focus-visible:ring-hivis"
            >
              <LogoutIcon /> Sign out
            </button>
          </div>

          <NextLink href="/" className="flex items-center gap-2 px-3 text-xs text-steel hover:text-foreground">
            <BoxIcon className="size-3.5" /> Open the public quote page
          </NextLink>
        </div>
      </aside>

      {/* iPad / phone: scrollable tabs */}
      <div className="lg:hidden">
        <div className="mb-3 flex items-center justify-between gap-3 text-xs text-steel">
          <span className="flex items-center gap-2">
            <span className={`size-2 rounded-full ${lowTime ? "bg-warning" : "bg-success"}`} aria-hidden />
            {endsAt ? `Session ends ${endsAt}` : "Signed in"}
          </span>
          <button type="button" onClick={signOut} className="flex items-center gap-1.5 rounded-md px-2 py-1 font-medium hover:bg-default-100">
            <LogoutIcon className="size-3.5" /> Sign out
          </button>
        </div>
        <nav aria-label="Admin" className="-mx-4 mb-6 overflow-x-auto px-4 sm:-mx-6 sm:px-6 [-webkit-overflow-scrolling:touch]">
          <ul className="flex w-max gap-1 rounded-xl border border-ink/10 bg-content1 p-1 shadow-sm">
            {NAV.map(({ href, label, icon: Icon }) => {
              const active = isActive(path, href);
              return (
                <li key={href}>
                  <NextLink
                    href={href}
                    aria-current={active ? "page" : undefined}
                    className={`flex items-center gap-2 whitespace-nowrap rounded-lg px-3 py-2 text-sm font-medium outline-none focus-visible:ring-2 focus-visible:ring-hivis ${
                      active ? "bg-ink text-white" : "text-foreground/80 hover:bg-default-100"
                    }`}
                  >
                    <Icon className={`size-4 ${active ? "text-hivis" : "text-steel"}`} />
                    {label}
                  </NextLink>
                </li>
              );
            })}
          </ul>
        </nav>
      </div>

      <div className="min-w-0">{children}</div>
    </div>
  );
}
