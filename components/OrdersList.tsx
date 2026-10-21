"use client";

import { useEffect, useMemo, useState } from "react";
import NextLink from "next/link";
import { Button, Input, addToast } from "@heroui/react";
import { CarrierBadge } from "./CarrierBadge";
import { ArrowRightIcon, PlusIcon, PrinterIcon, SearchIcon } from "./icons";
import { printLabel } from "./printLabel";
import { formatMoney } from "@/lib/pricing";

/** What a customer sees about one of their bookings (no cost/fee split). */
export type OrderRow = {
  id: string;
  createdAt: string;
  serviceName: string;
  carrier: string;
  trackingNo: string | null;
  trackingUrl: string | null;
  price: number;
  currency: string;
  from: string;
  to: string;
  parcel: string | null;
  canShipAgain: boolean;
  hasLabel: boolean;
};

export function OrdersList({ orders, month }: { orders: OrderRow[]; month: { labels: number; spend: number } }) {
  const [query, setQuery] = useState("");
  const [printing, setPrinting] = useState<string | null>(null);
  const [mounted, setMounted] = useState(false); // dates use the viewer's time zone
  useEffect(() => setMounted(true), []);

  const rows = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return orders;
    return orders.filter((o) => [o.to, o.from, o.trackingNo, o.serviceName, o.carrier].some((v) => v?.toLowerCase().includes(q)));
  }, [orders, query]);

  const copy = (text: string) =>
    navigator.clipboard
      ?.writeText(text)
      .then(() => addToast({ title: "Tracking number copied", color: "success" }))
      .catch(() => undefined);

  if (orders.length === 0) {
    return (
      <div className="rounded-xl border border-ink/10 bg-content1 p-10 text-center shadow-sm">
        <p className="display text-lg font-semibold">No orders yet</p>
        <p className="mt-1 text-sm text-steel">Labels you buy will appear here, ready to reprint or track.</p>
        <Button as={NextLink} href="/" color="primary" className="mt-5 font-semibold" startContent={<PlusIcon />}>
          New shipment
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Input
          aria-label="Search orders"
          size="sm"
          variant="bordered"
          className="max-w-sm"
          placeholder="Search name, city, tracking"
          startContent={<SearchIcon className="size-4 text-steel" />}
          isClearable
          value={query}
          onValueChange={setQuery}
        />
        <p className="text-sm text-steel">
          This month: <strong className="text-foreground">{month.labels}</strong> {month.labels === 1 ? "label" : "labels"} · <strong className="text-foreground">{formatMoney(month.spend)}</strong>
        </p>
      </div>

      <ul className="grid gap-3">
        {rows.map((o) => (
          <li key={o.id} className="rounded-xl border border-ink/10 bg-content1 p-4 shadow-sm">
            <div className="flex flex-wrap items-start gap-4">
              <CarrierBadge carrier={o.carrier} />
              <div className="min-w-0 flex-1">
                <p className="flex flex-wrap items-center gap-x-2 font-semibold">
                  {o.serviceName}
                  <span className="text-sm font-normal text-steel">{mounted ? new Date(o.createdAt).toLocaleDateString(undefined, { dateStyle: "medium" }) : ""}</span>
                </p>
                <p className="mt-0.5 flex flex-wrap items-center gap-1.5 text-sm text-steel">
                  {o.from} <ArrowRightIcon className="size-3.5" /> <span className="text-foreground">{o.to}</span>
                </p>
                <p className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-steel">
                  {o.trackingNo && (
                    <button type="button" className="font-mono text-foreground hover:underline" onClick={() => copy(o.trackingNo!)} title="Copy tracking number">
                      {o.trackingNo}
                    </button>
                  )}
                  {o.parcel && <span>{o.parcel}</span>}
                </p>
              </div>
              <span className="display text-lg font-bold tabular-nums">{formatMoney(o.price, o.currency)}</span>
            </div>
            <div className="mt-3 flex flex-wrap justify-end gap-2 border-t border-ink/10 pt-3">
              {o.trackingUrl && (
                <Button as="a" href={o.trackingUrl} target="_blank" rel="noopener" size="sm" variant="light">
                  Track
                </Button>
              )}
              {o.canShipAgain && (
                <Button as={NextLink} href={`/?booking=${encodeURIComponent(o.id)}`} size="sm" variant="bordered">
                  Ship again
                </Button>
              )}
              {o.hasLabel && (
                <Button
                  size="sm"
                  color="secondary"
                  className="font-semibold"
                  isLoading={printing === o.id}
                  startContent={printing !== o.id && <PrinterIcon className="size-4" />}
                  onPress={() => {
                    setPrinting(o.id);
                    printLabel(o.id, () => setPrinting(null));
                  }}
                >
                  Print label
                </Button>
              )}
            </div>
          </li>
        ))}
        {rows.length === 0 && <li className="py-8 text-center text-sm text-steel">No orders match.</li>}
      </ul>
    </div>
  );
}
