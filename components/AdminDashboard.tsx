"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  Button,
  Input,
  Link,
  Table,
  TableBody,
  TableCell,
  TableColumn,
  TableHeader,
  TableRow,
  addToast,
} from "@heroui/react";
import { applyMargin, formatMoney, round2 } from "@/lib/pricing";
import type { MarginSettings, ShipmentRecord } from "@/lib/types";

type Props = { initialSettings: MarginSettings; initialShipments: ShipmentRecord[] };

export function AdminDashboard({ initialSettings, initialShipments }: Props) {
  const router = useRouter();
  const [saved, setSaved] = useState(initialSettings);
  const [percent, setPercent] = useState(String(initialSettings.percent));
  const [flatFee, setFlatFee] = useState(String(initialSettings.flatFee));
  const [sampleCost, setSampleCost] = useState("10");
  const [saving, setSaving] = useState(false);

  const pct = Number(percent);
  const fee = Number(flatFee);
  const valid = Number.isFinite(pct) && pct >= 0 && pct <= 500 && Number.isFinite(fee) && fee >= 0 && fee <= 100;
  const dirty = pct !== saved.percent || fee !== saved.flatFee;

  const cost = Math.max(Number(sampleCost) || 0, 0);
  const customerPays = valid ? applyMargin(cost, { percent: pct, flatFee: fee }) : cost;
  const youKeep = round2(customerPays - cost);

  const totals = useMemo(
    () =>
      initialShipments.reduce(
        (t, s) => ({ cost: t.cost + s.cost, charged: t.charged + s.charged, profit: t.profit + s.profit }),
        { cost: 0, charged: 0, profit: 0 },
      ),
    [initialShipments],
  );

  async function save() {
    setSaving(true);
    const res = await fetch("/api/admin/settings", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ percent: pct, flatFee: fee }),
    });
    const json = await res.json().catch(() => ({}));
    setSaving(false);
    if (!res.ok) {
      addToast({ title: "Margin not saved", description: json.error, color: "danger" });
      return;
    }
    setSaved(json.settings);
    addToast({ title: "Margin saved", description: "New rates will use it right away.", color: "success" });
  }

  async function logout() {
    await fetch("/api/admin/logout", { method: "POST" });
    router.replace("/admin/login");
    router.refresh();
  }

  return (
    <div className="space-y-14">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="display text-3xl font-bold sm:text-4xl">Profit margin</h1>
          <p className="mt-2 max-w-prose text-steel">
            Added on top of every ShipSaving rate. Customers only see the final price.
          </p>
        </div>
        <Button variant="light" onPress={logout}>
          Sign out
        </Button>
      </div>

      <section className="grid items-start gap-10 md:grid-cols-[1fr_minmax(300px,380px)]">
        <div className="space-y-5">
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
            description="Percentage of the ShipSaving price."
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
          <div className="flex items-center gap-4">
            <Button color="primary" className="font-semibold" isDisabled={!valid || !dirty} isLoading={saving} onPress={save}>
              Save margin
            </Button>
            <span className="text-sm text-steel">
              {saved.updatedAt ? `Last saved ${new Date(saved.updatedAt).toLocaleString()}` : "Using the default margin"}
            </span>
          </div>
        </div>

        {/* Live preview drawn as a shipping label */}
        <figure className="rounded-sm border-[3px] border-ink bg-white">
          <div className="barcode h-10 border-b-[3px] border-ink" aria-hidden />
          <div className="border-b-[3px] border-ink p-4">
            <label className="flex items-center justify-between gap-3 text-sm">
              <span>If ShipSaving charges</span>
              <Input
                aria-label="Sample ShipSaving price"
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
      </section>

      <section className="space-y-5">
        <div className="flex flex-wrap items-baseline justify-between gap-4">
          <h2 className="display text-2xl font-bold">Shipments</h2>
          <p className="text-sm text-steel">
            {initialShipments.length} labels. Cost {formatMoney(totals.cost)}, charged {formatMoney(totals.charged)},{" "}
            <strong className="text-success">profit {formatMoney(totals.profit)}</strong>
          </p>
        </div>

        {/* Scrolls sideways on narrow screens (phones, iPad portrait) instead of squashing columns */}
        <div className="overflow-x-auto rounded-md border-2 border-ink/10 bg-content1 [-webkit-overflow-scrolling:touch]">
          <Table aria-label="Shipments" removeWrapper className="min-w-[760px]">
            <TableHeader>
              <TableColumn>Date</TableColumn>
              <TableColumn>Recipient</TableColumn>
              <TableColumn>Service</TableColumn>
              <TableColumn>Tracking</TableColumn>
              <TableColumn align="end">Cost</TableColumn>
              <TableColumn align="end">Charged</TableColumn>
              <TableColumn align="end">Profit</TableColumn>
              <TableColumn>Label</TableColumn>
            </TableHeader>
            <TableBody emptyContent="No labels yet. Bought labels will appear here with their profit.">
              {initialShipments.map((s) => (
                <TableRow key={s.id}>
                  <TableCell className="whitespace-nowrap">{new Date(s.createdAt).toLocaleDateString()}</TableCell>
                  <TableCell>{s.recipient}</TableCell>
                  <TableCell>{s.serviceName}</TableCell>
                  <TableCell>{s.trackingNo ?? s.shipmentNo}</TableCell>
                  <TableCell className="tabular-nums">{formatMoney(s.cost, s.currency)}</TableCell>
                  <TableCell className="tabular-nums">{formatMoney(s.charged, s.currency)}</TableCell>
                  <TableCell className={`tabular-nums font-medium ${s.profit < 0 ? "text-danger" : "text-success"}`}>
                    {formatMoney(s.profit, s.currency)}
                  </TableCell>
                  <TableCell>
                    {s.labelUrls[0] ? (
                      <Link href={s.labelUrls[0]} isExternal size="sm">
                        Open
                      </Link>
                    ) : (
                      "None"
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </section>
    </div>
  );
}
