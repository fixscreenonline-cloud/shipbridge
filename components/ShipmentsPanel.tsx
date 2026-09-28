"use client";

import { useMemo, useState } from "react";
import {
  Button,
  Chip,
  Drawer,
  DrawerBody,
  DrawerContent,
  DrawerFooter,
  DrawerHeader,
  Input,
  Tab,
  Table,
  TableBody,
  TableCell,
  TableColumn,
  TableHeader,
  TableRow,
  Tabs,
  addToast,
} from "@heroui/react";
import { SearchIcon } from "./icons";
import { formatMoney, round2 } from "@/lib/pricing";
import type { ShipmentParty, ShipmentRecord } from "@/lib/types";

type Period = "all" | "today" | "7d" | "30d";
const DAY = 24 * 60 * 60 * 1000;

function inPeriod(iso: string, period: Period) {
  if (period === "all") return true;
  const t = Date.parse(iso);
  if (period === "today") return new Date(t).toDateString() === new Date().toDateString();
  return Date.now() - t <= (period === "7d" ? 7 : 30) * DAY;
}

const pct = (profit: number, cost: number) => (cost > 0 ? `${round2((profit / cost) * 100)}%` : "—");
const dateTime = (iso: string) =>
  new Date(iso).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" });

function toCsv(rows: ShipmentRecord[]) {
  const head = [
    "Date", "Shipment", "Tracking", "Carrier", "Service", "Recipient",
    "From", "To", "Parcel (in/lb)", "ShipSaving cost", "Customer paid", "Profit", "Margin %", "Label URL",
  ];
  const addr = (p: ShipmentParty | null | undefined) =>
    p ? [p.name, p.company, p.street, p.street2, `${p.city}, ${p.state} ${p.zip}`].filter(Boolean).join(", ") : "";
  const cell = (v: unknown) => `"${String(v ?? "").replace(/"/g, '""')}"`;
  const lines = rows.map((s) => {
    const d = s.details;
    const parcel = d?.parcel ? `${d.parcel.length}x${d.parcel.width}x${d.parcel.height} / ${d.parcel.weight}` : "";
    return [
      s.createdAt, s.shipmentNo, s.trackingNo, d?.carrier ?? s.carrierCode, s.serviceName, s.recipient,
      addr(d?.from), addr(d?.to), parcel, s.cost, s.charged, s.profit, s.marginPercent, s.labelUrls[0],
    ].map(cell).join(",");
  });
  return [head.map(cell).join(","), ...lines].join("\r\n");
}

function Stat({ label, value, tone }: { label: string; value: string; tone?: "success" | "danger" }) {
  const color = tone === "success" ? "text-success" : tone === "danger" ? "text-danger" : "";
  return (
    <div className="rounded-xl border border-ink/10 bg-content1 p-4 shadow-sm">
      <p className="text-xs font-medium uppercase tracking-wide text-steel">{label}</p>
      <p className={`display mt-1 text-2xl font-bold tabular-nums ${color}`}>{value}</p>
    </div>
  );
}

function Address({ title, p }: { title: string; p: ShipmentParty | null | undefined }) {
  return (
    <div className="rounded-lg bg-background p-3">
      <p className="mb-1 text-xs font-medium uppercase tracking-wide text-steel">{title}</p>
      {p ? (
        <address className="text-sm not-italic leading-relaxed">
          <strong>{p.name}</strong>
          {p.company && <><br />{p.company}</>}
          <br />
          {p.street}
          {p.street2 && <>, {p.street2}</>}
          <br />
          {p.city}, {p.state} {p.zip}
          {p.phone && <><br /><span className="text-steel">{p.phone}</span></>}
        </address>
      ) : (
        <p className="text-sm text-steel">Not recorded</p>
      )}
    </div>
  );
}

function Row({ label, value, strong }: { label: string; value: React.ReactNode; strong?: boolean }) {
  return (
    <div className={`flex justify-between gap-4 py-1.5 ${strong ? "font-semibold" : ""}`}>
      <dt className={strong ? "" : "text-steel"}>{label}</dt>
      <dd className="text-right tabular-nums">{value}</dd>
    </div>
  );
}

function Details({ s }: { s: ShipmentRecord }) {
  const d = s.details;
  const copy = (text: string) =>
    navigator.clipboard
      ?.writeText(text)
      .then(() => addToast({ title: "Copied", description: text, color: "success" }))
      .catch(() => undefined);

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center gap-2">
        <Chip variant="flat" color="primary">{d?.carrier ?? s.carrierCode}</Chip>
        {d?.labelStatus && <Chip variant="flat" color="success">{d.labelStatus}</Chip>}
        {d?.deliveryDays && <Chip variant="flat">{d.deliveryDays} days</Chip>}
      </div>

      <section>
        <p className="mb-1 text-xs font-medium uppercase tracking-wide text-steel">Tracking number</p>
        <div className="flex items-center gap-2">
          <span className="font-mono text-base font-semibold">{s.trackingNo ?? "Not provided"}</span>
          {s.trackingNo && (
            <Button size="sm" variant="light" onPress={() => copy(s.trackingNo!)}>
              Copy
            </Button>
          )}
        </div>
      </section>

      <section className="rounded-lg border border-ink/10 p-3">
        <p className="mb-1 text-xs font-medium uppercase tracking-wide text-steel">Money</p>
        <dl className="divide-y divide-dashed divide-ink/15 text-sm">
          {d?.labelRate != null && <Row label="Label rate" value={formatMoney(d.labelRate, s.currency)} />}
          {!!d?.serviceFee && <Row label="ShipSaving service fee" value={formatMoney(d.serviceFee, s.currency)} />}
          {!!d?.insuranceFee && <Row label="Insurance" value={formatMoney(d.insuranceFee, s.currency)} />}
          <Row label="Your cost (ShipSaving)" value={formatMoney(s.cost, s.currency)} strong />
          <Row
            label={`Margin ${s.marginPercent}%${d?.flatFee ? ` + ${formatMoney(d.flatFee, s.currency)} fee` : ""}`}
            value={`+${formatMoney(round2(s.charged - (d?.quotedCost ?? s.cost)), s.currency)}`}
          />
          <Row label="Customer paid" value={formatMoney(s.charged, s.currency)} strong />
          <Row
            label="Your profit"
            value={<span className={s.profit < 0 ? "text-danger" : "text-success"}>{formatMoney(s.profit, s.currency)}</span>}
            strong
          />
          {d?.publishedRate != null && (
            <Row label="Carrier list price" value={<span className="text-steel">{formatMoney(d.publishedRate, s.currency)}</span>} />
          )}
        </dl>
      </section>

      <div className="grid gap-3 sm:grid-cols-2">
        <Address title="From" p={d?.from} />
        <Address title="To" p={d?.to} />
      </div>

      <section className="rounded-lg bg-background p-3 text-sm">
        <p className="mb-1 text-xs font-medium uppercase tracking-wide text-steel">Parcel</p>
        {d?.parcel ? (
          <p>
            {d.parcel.length} × {d.parcel.width} × {d.parcel.height} in · {d.parcel.weight} lb
          </p>
        ) : (
          <p className="text-steel">Not recorded</p>
        )}
      </section>

      <dl className="text-sm">
        <Row label="Booked" value={dateTime(s.createdAt)} />
        <Row label="Shipment number" value={s.shipmentNo} />
        <Row label="Rate ID" value={<span className="break-all font-mono text-xs">{s.rateId}</span>} />
      </dl>

      {!d && (
        <p className="text-xs text-steel">
          This label was bought before booking details were recorded, so addresses and parcel aren&apos;t available.
        </p>
      )}
    </div>
  );
}

export function ShipmentsPanel({ shipments }: { shipments: ShipmentRecord[] }) {
  const [period, setPeriod] = useState<Period>("all");
  const [query, setQuery] = useState("");
  const [openId, setOpenId] = useState<string | null>(null);

  const rows = useMemo(() => {
    const q = query.trim().toLowerCase();
    return shipments.filter((s) => {
      if (!inPeriod(s.createdAt, period)) return false;
      if (!q) return true;
      const d = s.details;
      return [s.recipient, s.trackingNo, s.shipmentNo, s.serviceName, s.carrierCode, d?.from?.name, d?.to?.name, d?.to?.city, d?.to?.zip]
        .some((v) => v?.toLowerCase().includes(q));
    });
  }, [shipments, period, query]);

  const totals = useMemo(
    () => rows.reduce((t, s) => ({ cost: t.cost + s.cost, charged: t.charged + s.charged, profit: t.profit + s.profit }), { cost: 0, charged: 0, profit: 0 }),
    [rows],
  );
  const open = shipments.find((s) => s.id === openId) ?? null;

  function exportCsv() {
    const blob = new Blob([toCsv(rows)], { type: "text/csv;charset=utf-8" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `shipbridge-shipments-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(a.href);
  }

  return (
    <section className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <h2 className="display text-2xl font-bold">Shipments</h2>
        <Tabs aria-label="Period" size="sm" selectedKey={period} onSelectionChange={(k) => setPeriod(k as Period)}>
          <Tab key="all" title="All time" />
          <Tab key="today" title="Today" />
          <Tab key="7d" title="7 days" />
          <Tab key="30d" title="30 days" />
        </Tabs>
      </div>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
        <Stat label="Labels" value={String(rows.length)} />
        <Stat label="Customers paid" value={formatMoney(totals.charged)} />
        <Stat label="ShipSaving cost" value={formatMoney(totals.cost)} />
        <Stat label="Profit" value={formatMoney(round2(totals.profit))} tone={totals.profit < 0 ? "danger" : "success"} />
        <Stat label="Avg. markup" value={pct(totals.profit, totals.cost)} />
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <Input
          aria-label="Search shipments"
          size="sm"
          variant="bordered"
          className="max-w-sm"
          placeholder="Search name, tracking, city, ZIP"
          startContent={<SearchIcon className="size-4 text-steel" />}
          isClearable
          value={query}
          onValueChange={setQuery}
        />
        <Button size="sm" variant="bordered" onPress={exportCsv} isDisabled={!rows.length}>
          Export CSV
        </Button>
      </div>

      {/* Scrolls sideways on narrow screens (phones, iPad portrait) instead of squashing columns */}
      <div className="overflow-x-auto rounded-xl border border-ink/10 bg-content1 shadow-sm [-webkit-overflow-scrolling:touch]">
        <Table
          aria-label="Shipments. Choose a row to see its details."
          removeWrapper
          className="min-w-[760px]"
          selectionMode="none"
          onRowAction={(key) => setOpenId(String(key))}
        >
          <TableHeader>
            <TableColumn>Date</TableColumn>
            <TableColumn>Recipient</TableColumn>
            <TableColumn>Service</TableColumn>
            <TableColumn>Tracking</TableColumn>
            <TableColumn align="end">Cost</TableColumn>
            <TableColumn align="end">Charged</TableColumn>
            <TableColumn align="end">Profit</TableColumn>
            <TableColumn> </TableColumn>
          </TableHeader>
          <TableBody
            emptyContent={shipments.length ? "No shipments match." : "No labels yet. Bought labels will appear here with their profit."}
          >
            {rows.map((s) => (
              <TableRow key={s.id} className="cursor-pointer hover:bg-default-100">
                <TableCell className="whitespace-nowrap">{new Date(s.createdAt).toLocaleDateString()}</TableCell>
                <TableCell>{s.recipient}</TableCell>
                <TableCell>{s.serviceName}</TableCell>
                <TableCell className="font-mono text-xs">{s.trackingNo ?? s.shipmentNo}</TableCell>
                <TableCell className="tabular-nums">{formatMoney(s.cost, s.currency)}</TableCell>
                <TableCell className="tabular-nums">{formatMoney(s.charged, s.currency)}</TableCell>
                <TableCell className={`tabular-nums font-medium ${s.profit < 0 ? "text-danger" : "text-success"}`}>
                  {formatMoney(s.profit, s.currency)}
                </TableCell>
                <TableCell>
                  <span className="text-sm font-medium text-primary underline-offset-2 hover:underline">Details</span>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      <Drawer isOpen={!!open} onOpenChange={(isOpen) => !isOpen && setOpenId(null)} size="lg">
        <DrawerContent>
          {(close) =>
            open && (
              <>
                <DrawerHeader className="flex flex-col gap-1">
                  <span className="display text-xl font-bold">{open.serviceName}</span>
                  <span className="text-sm font-normal text-steel">
                    {open.recipient} · {dateTime(open.createdAt)}
                  </span>
                </DrawerHeader>
                <DrawerBody>
                  <Details s={open} />
                </DrawerBody>
                <DrawerFooter className="flex-wrap">
                  {open.labelUrls.map((url, i) => (
                    <Button key={url} as="a" href={url} target="_blank" rel="noopener" color="secondary" className="font-semibold">
                      {open.labelUrls.length > 1 ? `Open label ${i + 1}` : "Open label"}
                    </Button>
                  ))}
                  <Button variant="light" onPress={close}>
                    Close
                  </Button>
                </DrawerFooter>
              </>
            )
          }
        </DrawerContent>
      </Drawer>
    </section>
  );
}
