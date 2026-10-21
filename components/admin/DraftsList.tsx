"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Button, addToast } from "@heroui/react";
import { ArrowRightIcon, BoxIcon } from "../icons";
import { formatMoney } from "@/lib/pricing";
import type { Draft } from "@/lib/types";

const HOUR = 60 * 60 * 1000;

/** A customer's recent price checks: viewable and deletable by the admin, reused only by the customer. */
export function DraftsList({ drafts }: { drafts: Draft[] }) {
  const router = useRouter();
  const [items, setItems] = useState(drafts);
  const [deleting, setDeleting] = useState<string | null>(null);
  const [now, setNow] = useState<number | null>(null); // relative times use the viewer's clock
  useEffect(() => setNow(Date.now()), []);
  useEffect(() => setItems(drafts), [drafts]);

  async function remove(id: string) {
    setDeleting(id);
    const res = await fetch(`/api/admin/drafts/${encodeURIComponent(id)}`, { method: "DELETE" }).catch(() => null);
    setDeleting(null);
    if (!res?.ok) return addToast({ title: "Draft not deleted", color: "danger" });
    setItems((list) => list.filter((d) => d.id !== id));
    router.refresh();
  }

  if (!items.length) {
    return (
      <div className="rounded-xl border border-ink/10 bg-content1 p-10 text-center shadow-sm">
        <p className="display text-lg font-semibold">No drafts right now</p>
        <p className="mt-1 text-sm text-steel">Price checks are kept here for 24 hours.</p>
      </div>
    );
  }

  return (
    <ul className="grid gap-4 md:grid-cols-2">
      {items.map((d) => {
        const p = d.package;
        const quotedMin = now !== null ? Math.max(0, Math.round((now - Date.parse(d.updatedAt)) / 60000)) : null;
        const leftH = now !== null ? Math.max(0, Math.ceil((Date.parse(d.updatedAt) + 24 * HOUR - now) / HOUR)) : null;
        return (
          <li key={d.id} className="flex flex-col rounded-xl border border-ink/10 bg-content1 p-5 shadow-sm">
            <div className="flex items-start justify-between gap-3">
              <p className="flex flex-wrap items-center gap-1.5 font-semibold">
                {d.from.city}, {d.from.state} <ArrowRightIcon className="size-3.5 text-steel" /> {d.to.city}, {d.to.state}
              </p>
              {d.lowestPrice != null && (
                <span className="shrink-0 rounded-full bg-hivis/15 px-2.5 py-1 text-xs font-semibold tabular-nums">
                  from {formatMoney(d.lowestPrice, d.currency)}
                </span>
              )}
            </div>
            <p className="mt-1 text-sm text-steel">
              {d.from.first_name} {d.from.last_name} → {d.to.first_name} {d.to.last_name}
            </p>
            <p className="mt-3 flex items-center gap-2 text-sm">
              <BoxIcon className="size-4 text-steel" />
              {p.length} × {p.width} × {p.height} {p.dimension_unit} · {p.weight} {p.weight_unit}
            </p>
            <p className="mt-1 text-xs text-steel">
              {d.rateCount} rate{d.rateCount === 1 ? "" : "s"}
              {quotedMin !== null && ` · quoted ${quotedMin < 60 ? `${quotedMin} min` : `${Math.round(quotedMin / 60)} h`} ago`}
              {leftH !== null && ` · deleted in ${leftH} h`}
              {d.carrierNotes?.length ? ` · ${d.carrierNotes.length} carrier note${d.carrierNotes.length === 1 ? "" : "s"}` : ""}
            </p>
            <div className="mt-4 flex justify-end gap-2 border-t border-ink/10 pt-4">
              <Button size="sm" variant="light" color="danger" isLoading={deleting === d.id} onPress={() => remove(d.id)}>
                Delete
              </Button>
            </div>
          </li>
        );
      })}
    </ul>
  );
}
