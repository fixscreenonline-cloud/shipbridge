"use client";

import { useEffect, useMemo, useState } from "react";
import NextLink from "next/link";
import { Button } from "@heroui/react";
import { CarrierBadge } from "../CarrierBadge";
import { ArrowRightIcon, PlusIcon } from "../icons";
import { PageHeader } from "./PageHeader";
import { formatMoney, round2 } from "@/lib/pricing";
import type { Draft, MarginSettings, ShipmentRecord } from "@/lib/types";

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

const viewAll = (href: string, label = "View all") => (
  <NextLink href={href} className="flex items-center gap-1 text-sm font-medium text-steel hover:text-foreground">
    {label} <ArrowRightIcon className="size-3.5" />
  </NextLink>
);

export function Overview({
  shipments,
  drafts,
  settings,
  noteCount,
}: {
  shipments: ShipmentRecord[];
  drafts: Draft[];
  settings: MarginSettings;
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

  const money = (n: number | undefined) => (n === undefined ? "—" : formatMoney(round2(n)));
  const markup = stats && stats.all.cost > 0 ? `${round2((stats.all.profit / stats.all.cost) * 100)}%` : "—";

  return (
    <>
      <PageHeader
        title="Overview"
        description="How ShipBridge is doing, and shortcuts to what you do most."
        actions={
          <Button as={NextLink} href="/admin/ship" color="secondary" className="font-semibold" startContent={<PlusIcon />}>
            New shipment
          </Button>
        }
      />

      <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
        <Stat label="Profit today" value={money(stats?.today.profit)} sub={stats ? `${stats.today.labels} label${stats.today.labels === 1 ? "" : "s"}` : undefined} accent />
        <Stat label="Profit · 7 days" value={money(stats?.week.profit)} sub={stats ? `${stats.week.labels} labels` : undefined} />
        <Stat label="Customers paid · 7 days" value={money(stats?.week.charged)} sub={stats ? `Shippo cost ${money(stats.week.cost)}` : undefined} />
        <Stat label="Avg. markup" value={markup} sub={`Margin set to ${settings.percent}%${settings.flatFee ? ` + ${formatMoney(settings.flatFee)}` : ""}`} />
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

      <div className="mt-8 grid items-start gap-6 xl:grid-cols-[1.4fr_1fr]">
        <Card title="Latest bookings" action={shipments.length > 0 && viewAll("/admin/shipments")}>
          {shipments.length === 0 ? (
            <p className="px-3 py-8 text-center text-sm text-steel">
              No labels yet.{" "}
              <NextLink href="/admin/ship" className="font-medium text-foreground underline">
                Create your first shipment
              </NextLink>
              .
            </p>
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
                        {s.recipient}
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

        <div className="space-y-6">
          <Card title="Drafts · last 24 h" action={drafts.length > 0 && viewAll("/admin/drafts")}>
            {drafts.length === 0 ? (
              <p className="px-3 py-6 text-center text-sm text-steel">No price checks in the last 24 hours.</p>
            ) : (
              <ul>
                {drafts.slice(0, 4).map((d) => (
                  <li key={d.id} className="flex items-center gap-3 rounded-lg px-3 py-2.5 hover:bg-default-100">
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-medium">
                        {d.from.city}, {d.from.state} → {d.to.city}, {d.to.state}
                      </span>
                      <span className="block truncate text-xs text-steel">
                        {d.lowestPrice != null ? `from ${formatMoney(d.lowestPrice, d.currency)}` : "no rates"}
                        {now !== null && ` · ${ago(d.updatedAt, now)}`}
                      </span>
                    </span>
                    <Button as={NextLink} href={`/admin/ship?draft=${encodeURIComponent(d.id)}`} size="sm" variant="bordered" className="font-medium">
                      Use
                    </Button>
                  </li>
                ))}
              </ul>
            )}
          </Card>

          <div className="grid grid-cols-2 gap-3">
            <NextLink
              href="/admin/margin"
              className="rounded-xl border border-ink/10 bg-content1 p-4 shadow-sm transition-colors hover:border-ink/30"
            >
              <p className="text-xs font-medium uppercase tracking-wide text-steel">Margin</p>
              <p className="display mt-1 text-2xl font-bold">{settings.percent}%</p>
              <p className="mt-1 text-xs text-steel">{settings.flatFee ? `+ ${formatMoney(settings.flatFee)} per label` : "No flat fee"}</p>
            </NextLink>
            <NextLink
              href="/admin/carriers"
              className="rounded-xl border border-ink/10 bg-content1 p-4 shadow-sm transition-colors hover:border-ink/30"
            >
              <p className="text-xs font-medium uppercase tracking-wide text-steel">Carrier notes</p>
              <p className="display mt-1 text-2xl font-bold">{noteCount}</p>
              <p className="mt-1 text-xs text-steel">{noteCount ? "From the last 24 h" : "All carriers quoted"}</p>
            </NextLink>
          </div>
        </div>
      </div>
    </>
  );
}
