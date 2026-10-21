"use client";

import { useEffect, useMemo, useState } from "react";
import NextLink from "next/link";
import { Button } from "@heroui/react";
import { CarrierBadge } from "../CarrierBadge";
import { ArrowRightIcon, PlusIcon } from "../icons";
import { PageHeader } from "./PageHeader";
import { formatMoney, round2 } from "@/lib/pricing";
import type { ShipmentRecord } from "@/lib/types";

const DAY = 24 * 60 * 60 * 1000;

function sum(list: ShipmentRecord[]) {
  return list.reduce(
    (t, s) => ({ labels: t.labels + 1, cost: t.cost + s.cost, charged: t.charged + s.charged, profit: t.profit + s.profit }),
    { labels: 0, cost: 0, charged: 0, profit: 0 },
  );
}

function ago(iso: string, now: number) {
  const min = Math.round((now - Date.parse(iso)) / 60000);
  if (min < 1) return "just now";
  if (min < 60) return `${min} min ago`;
  const h = Math.round(min / 60);
  if (h < 24) return `${h} h ago`;
  return new Date(iso).toLocaleDateString();
}

function Stat({ label, value, sub, accent }: { label: string; value: string; sub?: string; accent?: boolean }) {
  return (
    <div className={`rounded-xl border p-4 shadow-sm ${accent ? "border-hivis bg-hivis/10" : "border-ink/10 bg-content1"}`}>
      <p className="text-xs font-medium uppercase tracking-wide text-steel">{label}</p>
      <p className="display mt-1 text-2xl font-bold tabular-nums sm:text-3xl">{value}</p>
      {sub && <p className="mt-1 text-xs text-steel">{sub}</p>}
    </div>
  );
}

function Card({ title, action, children }: { title: string; action?: React.ReactNode; children: React.ReactNode }) {
  return (
    <section className="rounded-xl border border-ink/10 bg-content1 shadow-sm">
      <header className="flex items-center justify-between gap-3 border-b border-ink/10 px-5 py-3.5">
        <h2 className="display text-base font-semibold">{title}</h2>
        {action}
      </header>
      <div className="p-2">{children}</div>
    </section>
  );
}

type CustomerInfo = { id: string; name: string; username: string; active: boolean };
type ByCustomer = { key: string; name: string; sub: string; active: boolean; month: ReturnType<typeof sum>; all: ReturnType<typeof sum> };

const ownerKey = (s: ShipmentRecord) => (s.ownerId && s.ownerId !== "admin" ? s.ownerId : "admin");

const viewAll = (href: string, label = "View all") => (
  <NextLink href={href} className="flex items-center gap-1 text-sm font-medium text-steel hover:text-foreground">
    {label} <ArrowRightIcon className="size-3.5" />
  </NextLink>
);

export function Overview({
  shipments,
  customers,
  noteCount,
}: {
  shipments: ShipmentRecord[];
  customers: CustomerInfo[];
  noteCount: number;
}) {
  // "Today" and relative times depend on the viewer's clock, so compute them after mounting.
  const [now, setNow] = useState<number | null>(null);
  useEffect(() => setNow(Date.now()), []);

  const stats = useMemo(() => {
    if (now === null) return null;
    const today = new Date(now).toDateString();
    return {
      today: sum(shipments.filter((s) => new Date(s.createdAt).toDateString() === today)),
      week: sum(shipments.filter((s) => now - Date.parse(s.createdAt) <= 7 * DAY)),
      all: sum(shipments),
    };
  }, [shipments, now]);

  // One row per customer (plus you), ranked by profit this month, then all time.
  const byCustomer = useMemo(() => {
    if (now === null) return null;
    const monthStart = new Date(now);
    monthStart.setDate(1);
    monthStart.setHours(0, 0, 0, 0);
    const groups = new Map<string, ShipmentRecord[]>();
    for (const s of shipments) groups.set(ownerKey(s), [...(groups.get(ownerKey(s)) ?? []), s]);
    const row = (key: string, name: string, sub: string, active: boolean): ByCustomer => {
      const list = groups.get(key) ?? [];
      return { key, name, sub, active, month: sum(list.filter((s) => Date.parse(s.createdAt) >= monthStart.getTime())), all: sum(list) };
    };
    const known = new Set(customers.map((c) => c.id));
    const rows = [
      row("admin", "You", "labels you booked before customer accounts", true),
      ...customers.map((c) => row(c.id, c.name, `@${c.username}`, c.active)),
      // Bookings by a customer account that no longer exists
      ...[...groups.keys()]
        .filter((k) => k !== "admin" && !known.has(k))
        .map((k) => row(k, groups.get(k)![0].ownerName ?? "Former customer", "removed", false)),
    ];
    return rows.filter((r) => r.key !== "admin" || r.all.labels > 0).sort((a, b) => b.month.profit - a.month.profit || b.all.profit - a.all.profit);
  }, [shipments, customers, now]);

  const money = (n: number | undefined) => (n === undefined ? "—" : formatMoney(round2(n)));
  const activeCustomers = customers.filter((c) => c.active).length;
  const markup = stats && stats.all.cost > 0 ? `${round2((stats.all.profit / stats.all.cost) * 100)}%` : "—";

  return (
    <>
      <PageHeader
        title="Overview"
        description="How your customers are doing and what you earn from each."
        actions={
          <Button as={NextLink} href="/admin/users" color="secondary" className="font-semibold" startContent={<PlusIcon />}>
            Add customer
          </Button>
        }
      />

      <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
        <Stat label="Profit today" value={money(stats?.today.profit)} sub={stats ? `${stats.today.labels} label${stats.today.labels === 1 ? "" : "s"}` : undefined} accent />
        <Stat label="Profit · 7 days" value={money(stats?.week.profit)} sub={stats ? `${stats.week.labels} labels` : undefined} />
        <Stat label="Customers paid · 7 days" value={money(stats?.week.charged)} sub={stats ? `Shippo cost ${money(stats.week.cost)}` : undefined} />
        <Stat label="Avg. markup" value={markup} sub={`${activeCustomers} active customer${activeCustomers === 1 ? "" : "s"}`} />
      </div>

      <div className="mt-3 flex flex-wrap items-center justify-between gap-3 rounded-xl bg-ink px-5 py-4 text-white shadow-sm">
        <p className="text-sm text-white/70">All time</p>
        <div className="flex flex-wrap gap-x-8 gap-y-2 text-sm">
          <span>
            <span className="text-white/60">Labels </span>
            <strong className="tabular-nums">{stats?.all.labels ?? "—"}</strong>
          </span>
          <span>
            <span className="text-white/60">Customers paid </span>
            <strong className="tabular-nums">{money(stats?.all.charged)}</strong>
          </span>
          <span>
            <span className="text-white/60">Profit </span>
            <strong className="tabular-nums text-hivis">{money(stats?.all.profit)}</strong>
          </span>
        </div>
      </div>

      <div className="mt-8">
        <Card title="Profit by customer" action={viewAll("/admin/users", "Manage users")}>
          {!byCustomer ? (
            <p className="px-3 py-6 text-center text-sm text-steel">Loading…</p>
          ) : byCustomer.length === 0 ? (
            <p className="px-3 py-8 text-center text-sm text-steel">
              No customers yet.{" "}
              <NextLink href="/admin/users" className="font-medium text-foreground underline">
                Add your first customer
              </NextLink>
              .
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[620px] text-sm">
                <thead>
                  <tr className="text-left text-xs uppercase tracking-wide text-steel">
                    <th className="px-3 py-2 font-medium">Customer</th>
                    <th className="px-3 py-2 text-right font-medium">Labels · this month</th>
                    <th className="px-3 py-2 text-right font-medium">Profit · this month</th>
                    <th className="px-3 py-2 text-right font-medium">Labels · all time</th>
                    <th className="px-3 py-2 text-right font-medium">Profit · all time</th>
                  </tr>
                </thead>
                <tbody>
                  {byCustomer.map((c) => (
                    <tr key={c.key} className="border-t border-ink/10 hover:bg-default-100">
                      <td className="px-3 py-2.5">
                        <NextLink href={`/admin/shipments?customer=${encodeURIComponent(c.key)}`} className="block">
                          <span className="font-medium">{c.name}</span>
                          <span className="ml-2 text-xs text-steel">{c.sub}</span>
                          {!c.active && c.key !== "admin" && <span className="ml-2 rounded bg-default-100 px-1.5 py-0.5 text-xs text-steel">off</span>}
                        </NextLink>
                      </td>
                      <td className="px-3 py-2.5 text-right tabular-nums">{c.month.labels}</td>
                      <td className={`px-3 py-2.5 text-right font-semibold tabular-nums ${c.month.profit < 0 ? "text-danger" : c.month.profit > 0 ? "text-success" : "text-steel"}`}>
                        {money(c.month.profit)}
                      </td>
                      <td className="px-3 py-2.5 text-right tabular-nums text-steel">{c.all.labels}</td>
                      <td className="px-3 py-2.5 text-right tabular-nums">{money(c.all.profit)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>
      </div>

      <div className="mt-6 grid items-start gap-6 xl:grid-cols-[1.4fr_1fr]">
        <Card title="Latest bookings" action={shipments.length > 0 && viewAll("/admin/shipments")}>
          {shipments.length === 0 ? (
            <p className="px-3 py-8 text-center text-sm text-steel">No labels yet.</p>
          ) : (
            <ul>
              {shipments.slice(0, 6).map((s) => (
                <li key={s.id}>
                  <NextLink
                    href={`/admin/shipments?open=${encodeURIComponent(s.id)}`}
                    className="flex items-center gap-3 rounded-lg px-3 py-2.5 hover:bg-default-100"
                  >
                    <CarrierBadge carrier={s.details?.carrier ?? s.carrierCode} />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-medium">{s.serviceName}</span>
                      <span className="block truncate text-xs text-steel">
                        {ownerKey(s) === "admin" ? "You" : customers.find((c) => c.id === s.ownerId)?.name ?? s.ownerName ?? "Customer"} → {s.recipient}
                        {now !== null && ` · ${ago(s.createdAt, now)}`}
                      </span>
                    </span>
                    <span className="text-right">
                      <span className="block text-sm font-semibold tabular-nums">{formatMoney(s.charged, s.currency)}</span>
                      <span className={`block text-xs tabular-nums ${s.profit < 0 ? "text-danger" : "text-success"}`}>
                        +{formatMoney(s.profit, s.currency)}
                      </span>
                    </span>
                  </NextLink>
                </li>
              ))}
            </ul>
          )}
        </Card>

        <div className="grid grid-cols-2 gap-3">
          <NextLink href="/admin/users" className="rounded-xl border border-ink/10 bg-content1 p-4 shadow-sm transition-colors hover:border-ink/30">
            <p className="text-xs font-medium uppercase tracking-wide text-steel">Customers</p>
            <p className="display mt-1 text-2xl font-bold">{activeCustomers}</p>
            <p className="mt-1 text-xs text-steel">{customers.length - activeCustomers ? `${customers.length - activeCustomers} switched off` : "All active"}</p>
          </NextLink>
          <NextLink href="/admin/carriers" className="rounded-xl border border-ink/10 bg-content1 p-4 shadow-sm transition-colors hover:border-ink/30">
            <p className="text-xs font-medium uppercase tracking-wide text-steel">Carrier notes</p>
            <p className="display mt-1 text-2xl font-bold">{noteCount}</p>
            <p className="mt-1 text-xs text-steel">{noteCount ? "From the last 24 h" : "All carriers quoted"}</p>
          </NextLink>
        </div>
      </div>
    </>
  );
}
