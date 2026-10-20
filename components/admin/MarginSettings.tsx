"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Button, Input, addToast } from "@heroui/react";
import { applyMargin, formatMoney, round2 } from "@/lib/pricing";
import type { MarginSettings as Settings } from "@/lib/types";

export function MarginSettings({ initial }: { initial: Settings }) {
  const router = useRouter();
  const [saved, setSaved] = useState(initial);
  const [percent, setPercent] = useState(String(initial.percent));
  const [flatFee, setFlatFee] = useState(String(initial.flatFee));
  const [sampleCost, setSampleCost] = useState("10");
  const [saving, setSaving] = useState(false);
  // "Last saved" uses the viewer's time zone, so render it only in the browser.
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  const pct = Number(percent);
  const fee = Number(flatFee);
  const valid = Number.isFinite(pct) && pct >= 0 && pct <= 500 && Number.isFinite(fee) && fee >= 0 && fee <= 100;
  const dirty = pct !== saved.percent || fee !== saved.flatFee;

  const cost = Math.max(Number(sampleCost) || 0, 0);
  const customerPays = valid ? applyMargin(cost, { percent: pct, flatFee: fee }) : cost;
  const youKeep = round2(customerPays - cost);

  async function save() {
    setSaving(true);
    const res = await fetch("/api/admin/settings", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ percent: pct, flatFee: fee }),
    });
    const json = await res.json().catch(() => ({}));
    setSaving(false);
    if (res.status === 401) {
      addToast({ title: "Session ended", description: "Sign in again to save.", color: "warning" });
      router.replace("/admin/login?next=/admin/margin");
      return;
    }
    if (!res.ok) {
      addToast({ title: "Margin not saved", description: json.error, color: "danger" });
      return;
    }
    setSaved(json.settings);
    router.refresh();
    addToast({ title: "Margin saved", description: "New rates use it right away.", color: "success" });
  }

  return (
    <div className="grid items-start gap-8 xl:grid-cols-[1fr_minmax(300px,380px)]">
      <section className="rounded-xl border border-ink/10 bg-content1 p-5 shadow-sm sm:p-6">
        <h2 className="display text-lg font-semibold">Pricing rule</h2>
        <p className="mt-1 text-sm text-steel">
          Customer price = Shippo cost × (1 + margin %) + flat fee, rounded up to the cent.
        </p>
        <div className="mt-5 grid gap-4 sm:grid-cols-2">
          <Input
            type="number"
            label="Margin"
            variant="bordered"
            min={0}
            max={500}
            step="0.1"
            endContent={<span className="text-sm text-steel">%</span>}
            value={percent}
            onValueChange={setPercent}
            isInvalid={!(pct >= 0 && pct <= 500)}
            errorMessage="Use a value from 0 to 500"
            description="Percentage of the Shippo price."
          />
          <Input
            type="number"
            label="Flat fee per label"
            variant="bordered"
            min={0}
            max={100}
            step="0.01"
            startContent={<span className="text-sm text-steel">$</span>}
            value={flatFee}
            onValueChange={setFlatFee}
            isInvalid={!(fee >= 0 && fee <= 100)}
            errorMessage="Use a value from 0 to 100"
            description="Optional. Added after the percentage."
          />
        </div>
        <div className="mt-6 flex flex-wrap items-center gap-4 border-t border-ink/10 pt-5">
          <Button color="primary" className="font-semibold" isDisabled={!valid || !dirty} isLoading={saving} onPress={save}>
            Save margin
          </Button>
          <span className="text-sm text-steel">
            {saved.updatedAt
              ? mounted
                ? `Last saved ${new Date(saved.updatedAt).toLocaleString()}`
                : "Saved"
              : "Using the default margin"}
            {dirty && valid && <span className="ml-2 font-medium text-warning-600">· Unsaved changes</span>}
          </span>
        </div>
      </section>

      {/* Live preview drawn as a shipping label */}
      <figure className="overflow-hidden rounded-xl border-[3px] border-ink bg-white shadow-sm">
        <div className="barcode h-10 border-b-[3px] border-ink" aria-hidden />
        <div className="border-b-[3px] border-ink p-4">
          <label className="flex items-center justify-between gap-3 text-sm">
            <span>If Shippo charges</span>
            <Input
              aria-label="Sample Shippo price"
              type="number"
              size="sm"
              min={0}
              step="0.01"
              className="w-28"
              startContent={<span className="text-xs text-steel">$</span>}
              value={sampleCost}
              onValueChange={setSampleCost}
            />
          </label>
        </div>
        <dl className="divide-y-2 divide-dashed divide-ink/25 px-4 text-sm tabular-nums">
          <div className="flex justify-between py-2">
            <dt>Margin {valid ? `${pct}%` : ""}</dt>
            <dd>+{formatMoney(valid ? round2((cost * pct) / 100) : 0)}</dd>
          </div>
          <div className="flex justify-between py-2">
            <dt>Flat fee</dt>
            <dd>+{formatMoney(valid ? fee : 0)}</dd>
          </div>
        </dl>
        <div className="mt-2 flex items-baseline justify-between bg-ink px-4 py-4 text-white">
          <span className="text-sm">Customer pays</span>
          <span className="display text-3xl font-bold tabular-nums">{formatMoney(customerPays)}</span>
        </div>
        <figcaption className="flex justify-between bg-hivis px-4 py-3 font-semibold text-ink">
          <span>You keep</span>
          <span className="tabular-nums">{formatMoney(youKeep)}</span>
        </figcaption>
      </figure>
    </div>
  );
}
