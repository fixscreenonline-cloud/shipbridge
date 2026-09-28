"use client";

import { useCallback, useEffect, useState } from "react";
import { Button, Chip, Tab, Tabs, addToast } from "@heroui/react";
import { ArrowRightIcon } from "./icons";
import { formatMoney } from "@/lib/pricing";
import type { Address, Draft, ShipmentDetails, ShipmentParty, ShipmentRequest } from "@/lib/types";

type Booking = {
  id: string;
  createdAt: string;
  serviceName: string;
  carrierCode: string;
  charged: number;
  currency: string;
  trackingNo: string | null;
  request: ShipmentRequest | null;
  details: ShipmentDetails | null;
};

/** Older bookings only have ShipSaving's copy of the addresses; turn that back into form fields. */
function partyToAddress(p: ShipmentParty): Address {
  const [first = "", ...rest] = p.name.trim().split(/\s+/);
  return {
    first_name: first,
    last_name: rest.join(" "),
    company_name: p.company,
    phone: p.phone,
    email: "",
    street: p.street,
    street2: p.street2,
    city: p.city,
    state: p.state,
    zip_code: p.zip,
    country: p.country || "US",
  };
}

function bookingRequest(b: Booking): ShipmentRequest | null {
  if (b.request) return b.request;
  const d = b.details;
  if (!d?.from || !d.to || !d.parcel) return null;
  return {
    from: partyToAddress(d.from),
    to: partyToAddress(d.to),
    package: { ...d.parcel, dimension_unit: "in", weight_unit: "lb" },
  };
}

const rtf = new Intl.RelativeTimeFormat(undefined, { numeric: "auto" });
function ago(iso: string) {
  const min = Math.round((Date.now() - Date.parse(iso)) / 60000);
  if (min < 60) return rtf.format(-min, "minute");
  const h = Math.round(min / 60);
  if (h < 48) return rtf.format(-h, "hour");
  return new Date(iso).toLocaleDateString();
}

const place = (a: Address) => `${a.city}, ${a.state}`;
const name = (a: Address) => `${a.first_name} ${a.last_name}`.trim();
const parcel = (r: ShipmentRequest) =>
  `${r.package.length}×${r.package.width}×${r.package.height} ${r.package.dimension_unit} · ${r.package.weight} ${r.package.weight_unit}`;

function Item({
  req,
  meta,
  onUse,
  onDelete,
}: {
  req: ShipmentRequest;
  meta: React.ReactNode;
  onUse: () => void;
  onDelete?: () => void;
}) {
  return (
    <li className="flex flex-wrap items-center gap-3 rounded-lg border border-default-200 p-3">
      <div className="min-w-0 flex-1">
        <p className="flex flex-wrap items-center gap-1.5 font-medium">
          {place(req.from)} <ArrowRightIcon className="size-3.5 text-steel" /> {place(req.to)}
        </p>
        <p className="mt-0.5 text-xs text-steel">
          {name(req.from)} → {name(req.to)} · {parcel(req)}
        </p>
        <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-steel">{meta}</div>
      </div>
      <div className="flex gap-1">
        {onDelete && (
          <Button size="sm" variant="light" color="danger" onPress={onDelete}>
            Delete
          </Button>
        )}
        <Button size="sm" color="primary" variant="flat" className="font-semibold" onPress={onUse}>
          Use
        </Button>
      </div>
    </li>
  );
}

/**
 * Drafts (price checks from the last 24 hours) and recent bookings, with a button to refill the form.
 * Admin only: the data comes from /api/admin/recent, so for everyone else this renders nothing.
 */
export function RecentPanel({ refreshKey, onUse }: { refreshKey: number; onUse: (req: ShipmentRequest, what: string) => void }) {
  const [data, setData] = useState<{ drafts: Draft[]; bookings: Booking[] } | null>(null);
  const [open, setOpen] = useState(true);
  const [tab, setTab] = useState<"drafts" | "bookings">("drafts");

  const load = useCallback(async () => {
    const res = await fetch("/api/admin/recent", { cache: "no-store" }).catch(() => null);
    if (!res?.ok) return setData(null); // not signed in, or storage unavailable
    setData(await res.json());
  }, []);

  useEffect(() => {
    load();
  }, [load, refreshKey]);

  async function remove(id: string) {
    const res = await fetch(`/api/admin/drafts/${encodeURIComponent(id)}`, { method: "DELETE" }).catch(() => null);
    if (!res?.ok) return addToast({ title: "Draft not deleted", color: "danger" });
    setData((d) => d && { ...d, drafts: d.drafts.filter((x) => x.id !== id) });
  }

  if (!data || (!data.drafts.length && !data.bookings.length)) return null;
  const bookings = data.bookings.map((b) => ({ b, req: bookingRequest(b) })).filter((x) => x.req);

  return (
    <section className="rounded-xl border border-ink/10 bg-content1 shadow-sm">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left outline-none focus-visible:ring-2 focus-visible:ring-hivis sm:px-6"
      >
        <span className="display text-lg font-semibold">Recent</span>
        <span className="text-sm text-steel">
          {data.drafts.length} draft{data.drafts.length === 1 ? "" : "s"} · {bookings.length} booking{bookings.length === 1 ? "" : "s"}{" "}
          <span aria-hidden>{open ? "▴" : "▾"}</span>
        </span>
      </button>

      {open && (
        <div className="border-t border-ink/10 px-4 pb-4 pt-3 sm:px-6">
          <Tabs size="sm" aria-label="Recent" selectedKey={tab} onSelectionChange={(k) => setTab(k as typeof tab)}>
            <Tab key="drafts" title={`Drafts · last 24h (${data.drafts.length})`} />
            <Tab key="bookings" title={`Bookings (${bookings.length})`} />
          </Tabs>

          <ul className="mt-3 max-h-80 space-y-2 overflow-y-auto pr-1">
            {tab === "drafts" &&
              (data.drafts.length ? (
                data.drafts.map((d) => (
                  <Item
                    key={d.id}
                    req={d}
                    onUse={() => onUse(d, "draft")}
                    onDelete={() => remove(d.id)}
                    meta={
                      <>
                        <span>Quoted {ago(d.updatedAt)}</span>
                        {d.lowestPrice != null && <Chip size="sm" variant="flat">from {formatMoney(d.lowestPrice, d.currency)}</Chip>}
                        {d.shipDate && <span>Ship date {d.shipDate}</span>}
                      </>
                    }
                  />
                ))
              ) : (
                <li className="py-4 text-center text-sm text-steel">No drafts in the last 24 hours.</li>
              ))}

            {tab === "bookings" &&
              (bookings.length ? (
                bookings.map(({ b, req }) => (
                  <Item
                    key={b.id}
                    req={req!}
                    onUse={() => onUse(req!, "booking")}
                    meta={
                      <>
                        <span>Booked {ago(b.createdAt)}</span>
                        <Chip size="sm" variant="flat" color="success">
                          {b.serviceName} · {formatMoney(b.charged, b.currency)}
                        </Chip>
                        {b.trackingNo && <span className="font-mono">{b.trackingNo}</span>}
                      </>
                    }
                  />
                ))
              ) : (
                <li className="py-4 text-center text-sm text-steel">No bookings yet.</li>
              ))}
          </ul>
          <p className="mt-3 text-xs text-steel">
            Use fills the form; then choose Get rates for fresh prices. Drafts and unbought quotes are deleted after 24 hours.
          </p>
        </div>
      )}
    </section>
  );
}
