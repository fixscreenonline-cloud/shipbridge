"use client";

import { useMemo, useState } from "react";
import NextLink from "next/link";
import {
  Button,
  Chip,
  Drawer,
  DrawerBody,
  DrawerContent,
  DrawerFooter,
  DrawerHeader,
  Input,
  Select,
  SelectItem,
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
    "Date", "Customer", "Shipment", "Tracking", "Carrier", "Service", "Recipient",
    "From", "To", "Parcel", "Shippo cost", "Customer paid", "Profit", "Margin %", "Label URL",
  ];
  const addr = (p: ShipmentParty | null | undefined) =>
    p ? [p.name, p.company, p.street, p.street2, `${p.city}, ${p.state} ${p.zip}`].filter(Boolean).join(", ") : "";
  // Text starting with = + - @ (or tab/CR) would run as a formula in Excel/Sheets; prefix ' to keep it text.
  const cell = (v: unknown) => {
    let t = String(v ?? "");
    if (/^[=+\-@\t\r]/.test(t)) t = `'${t}`;
    return `"${t.replace(/"/g, '""')}"`;
  };
  const lines = rows.map((s) => {
    const d = s.details;
    const parcel = d?.parcel
      ? `${d.parcel.length}x${d.parcel.width}x${d.parcel.height} ${d.parcel.distanceUnit ?? "in"} / ${d.parcel.weight} ${d.parcel.massUnit ?? "lb"}`
      : "";
    return [
      s.createdAt, s.ownerName ?? "You", s.shipmentNo, s.trackingNo, d?.carrier ?? s.carrierCode, s.serviceName, s.recipient,
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
          {d?.trackingUrl && /^https?:\/\//i.test(d.trackingUrl) && (
            <Button size="sm" variant="light" as="a" href={d.trackingUrl} target="_blank" rel="noopener">
              Track
            </Button>
          )}
        </div>
      </section>

      <section className="rounded-lg border border-ink/10 p-3">
        <p className="mb-1 text-xs font-medium uppercase tracking-wide text-steel">Money</p>
        <dl className="divide-y divide-dashed divide-ink/15 text-sm">
          {d?.labelRate != null && <Row label="Label rate" value={formatMoney(d.labelRate, s.currency)} />}
          {!!d?.serviceFee && <Row label="Service fee" value={formatMoney(d.serviceFee, s.currency)} />}
          {!!d?.insuranceFee && <Row label="Insurance" value={formatMoney(d.insuranceFee, s.currency)} />}
          <Row label="Your cost (Shippo)" value={formatMoney(s.cost, s.currency)} strong />
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
            {d.parcel.length} × {d.parcel.width} × {d.parcel.height} {d.parcel.distanceUnit ?? "in"} · {d.parcel.weight}{" "}
            {d.parcel.massUnit ?? "lb"}
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

type CustomerTotals = { key: string; name: string; labels: number; charged: number; profit: number; last: string };

const ownerKey = (s: ShipmentRecord) => (s.ownerId && s.ownerId !== "admin" ? s.ownerId : "admin");

export function ShipmentsPanel({
  shipments,
  initialOpenId = null,
  initialQuery = "",
  initialCustomer = "all",
  ownerNames = {},
}: {
  shipments: ShipmentRecord[];
  initialOpenId?: string | null;
  initialQuery?: string;
  /** "all", "admin" (your own bookings) or a customer id. */
  initialCustomer?: string;
  /** ownerId -> "Business (@username)", for searching and showing customers. */
  ownerNames?: Record<string, string>;
}) {
  const [period, setPeriod] = useState<Period>("all");
  const [query, setQuery] = useState(initialQuery);
  const [customer, setCustomerState] = useState(initialCustomer);
  const customerOf = (s: ShipmentRecord) => (ownerKey(s) !== "admin" ? ownerNames[s.ownerId!] ?? s.ownerName ?? "Customer" : "You");
  const [openId, setOpenId] = useState<string | null>(initialOpenId);

  // Keep ?customer= in the address bar so the filtered view can be bookmarked or shared.
  function setCustomer(key: string) {
    setCustomerState(key);
    const url = new URL(window.location.href);
    if (key === "all") url.searchParams.delete("customer");
    else url.searchParams.set("customer", key);
    window.history.replaceState(null, "", url);
  }

  // Everyone who can be filtered on: you, every customer account, and owners of older records.
  const customerOptions = useMemo(() => {
    const names = new Map<string, string>(Object.entries(ownerNames));
    for (const s of shipments) if (ownerKey(s) !== "admin" && !names.has(ownerKey(s))) names.set(ownerKey(s), s.ownerName ?? "Former customer");
    return [
      { key: "all", label: "All customers" },
      ...(shipments.some((s) => ownerKey(s) === "admin") ? [{ key: "admin", label: "You (before customer accounts)" }] : []),
      ...[...names].sort((a, b) => a[1].localeCompare(b[1])).map(([key, label]) => ({ key, label })),
    ];
  }, [shipments, ownerNames]);

  // Period + search, before the customer filter (feeds the per-customer summary).
  const matching = useMemo(() => {
    const q = query.trim().toLowerCase();
    return shipments.filter((s) => {
      if (!inPeriod(s.createdAt, period)) return false;
      if (!q) return true;
      const d = s.details;
      return [customerOf(s), s.recipient, s.trackingNo, s.shipmentNo, s.serviceName, s.carrierCode, d?.from?.name, d?.to?.name, d?.to?.city, d?.to?.zip]
        .some((v) => v?.toLowerCase().includes(q));
    });
  }, [shipments, period, query, ownerNames]);

  const rows = useMemo(() => (customer === "all" ? matching : matching.filter((s) => ownerKey(s) === customer)), [matching, customer]);

  const byCustomer = useMemo(() => {
    const map = new Map<string, CustomerTotals>();
    for (const s of matching) {
      const key = ownerKey(s);
      const t = map.get(key) ?? { key, name: customerOf(s), labels: 0, charged: 0, profit: 0, last: s.createdAt };
      t.labels++;
      t.charged += s.charged;
      t.profit += s.profit;
      if (s.createdAt > t.last) t.last = s.createdAt;
      map.set(key, t);
    }
    return [...map.values()].sort((a, b) => b.profit - a.profit);
  }, [matching, ownerNames]);

  const totals = useMemo(
    () => rows.reduce((t, s) => ({ cost: t.cost + s.cost, charged: t.charged + s.charged, profit: t.profit + s.profit }), { cost: 0, charged: 0, profit: 0 }),
    [rows],
  );
  const open = shipments.find((s) => s.id === openId) ?? null;

  function exportCsv() {
    const blob = new Blob([toCsv(rows)], { type: "text/csv;charset=utf-8" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    const label = customerOptions.find((o) => o.key === customer)?.label ?? customer;
    const who = customer === "all" ? "" : `-${label.replace(/[^a-z0-9]+/gi, "-").replace(/^-|-$/g, "").toLowerCase()}`;
    a.download = `shipbridge-shipments${who}-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(a.href);
  }

  return (
    <section className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <p className="text-sm text-steel">Choose a row to see its details.</p>
        <Tabs aria-label="Period" size="sm" selectedKey={period} onSelectionChange={(k) => setPeriod(k as Period)}>
          <Tab key="all" title="All time" />
          <Tab key="today" title="Today" />
          <Tab key="7d" title="7 days" />
          <Tab key="30d" title="30 days" />
        </Tabs>
      </div>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
        <Stat label="Labels" value={String(rows.length)} />
        <Stat label={customer === "all" ? "Customers paid" : "Paid"} value={formatMoney(totals.charged)} />
        <Stat label="Shippo cost" value={formatMoney(totals.cost)} />
        <Stat label="Profit" value={formatMoney(round2(totals.profit))} tone={totals.profit < 0 ? "danger" : "success"} />
        <Stat label="Avg. markup" value={pct(totals.profit, totals.cost)} />
      </div>

      {customer === "all" && byCustomer.length > 1 && (
        <div className="overflow-x-auto rounded-xl border border-ink/10 bg-content1 shadow-sm">
          <p className="border-b border-ink/10 px-4 py-3 text-sm font-semibold">By customer</p>
          <Table
            aria-label="Totals by customer. Choose one to see only their shipments."
            removeWrapper
            className="min-w-[560px]"
            onRowAction={(key) => setCustomer(String(key))}
          >
            <TableHeader>
              <TableColumn>Customer</TableColumn>
              <TableColumn align="end">Labels</TableColumn>
              <TableColumn align="end">Paid</TableColumn>
              <TableColumn align="end">Your profit</TableColumn>
              <TableColumn>Last booking</TableColumn>
            </TableHeader>
            <TableBody>
              {byCustomer.map((c) => (
                <TableRow key={c.key} className="cursor-pointer hover:bg-default-100">
                  <TableCell className="font-medium">{c.name}</TableCell>
                  <TableCell className="tabular-nums">{c.labels}</TableCell>
                  <TableCell className="tabular-nums">{formatMoney(round2(c.charged))}</TableCell>
                  <TableCell className={`tabular-nums font-medium ${c.profit < 0 ? "text-danger" : "text-success"}`}>
                    {formatMoney(round2(c.profit))}
                  </TableCell>
                  <TableCell className="whitespace-nowrap text-steel">{new Date(c.last).toLocaleDateString()}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      <div className="flex flex-wrap items-center gap-3">
        <Select
          aria-label="Customer"
          size="sm"
          variant="bordered"
          className="max-w-xs"
          selectedKeys={[customer]}
          disallowEmptySelection
          onSelectionChange={(keys) => {
            const k = Array.from(keys)[0];
            if (k) setCustomer(String(k));
          }}
          items={customerOptions}
        >
          {(o) => <SelectItem key={o.key}>{o.label}</SelectItem>}
        </Select>
        {customer !== "all" && customer !== "admin" && ownerNames[customer] && (
          <Button as={NextLink} href={`/admin/users/${encodeURIComponent(customer)}`} size="sm" variant="light">
            Customer settings
          </Button>
        )}
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
          className="min-w-[880px]"
          selectionMode="none"
          onRowAction={(key) => setOpenId(String(key))}
        >
          <TableHeader>
            <TableColumn>Date</TableColumn>
            <TableColumn>Customer</TableColumn>
            <TableColumn>Recipient</TableColumn>
            <TableColumn>Service</TableColumn>
            <TableColumn>Tracking</TableColumn>
            <TableColumn align="end">Cost</TableColumn>
            <TableColumn align="end">Charged</TableColumn>
            <TableColumn align="end">Profit</TableColumn>
            <TableColumn> </TableColumn>
          </TableHeader>
          <TableBody
            emptyContent={
              !shipments.length
                ? "No labels yet. Bought labels will appear here with their profit."
                : customer !== "all" && !matching.some((s) => ownerKey(s) === customer)
                  ? "No labels for this customer in this period."
                  : "No shipments match."
            }
          >
            {rows.map((s) => (
              <TableRow key={s.id} className="cursor-pointer hover:bg-default-100">
                <TableCell className="whitespace-nowrap">{new Date(s.createdAt).toLocaleDateString()}</TableCell>
                <TableCell className="max-w-[12rem] truncate">{customerOf(s)}</TableCell>
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
                  {open.labelUrls.length > 0 && (
                    // Goes through the server for a fresh link (Shippo label links expire).
                    <Button
                      as="a"
                      href={`/api/admin/shipments/${encodeURIComponent(open.id)}/label`}
                      target="_blank"
                      rel="noopener"
                      color="secondary"
                      className="font-semibold"
                    >
                      Open label
                    </Button>
                  )}
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
