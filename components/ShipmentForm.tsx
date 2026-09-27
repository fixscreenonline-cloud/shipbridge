"use client";

import { useRef, useState } from "react";
import NextLink from "next/link";
import { Alert, Button, Chip, Input, Skeleton, Tab, Tabs, addToast } from "@heroui/react";
import { AddressFields, emptyAddress } from "./AddressFields";
import { ArrowRightIcon, BoxIcon, CheckIcon, ClockIcon, SwapIcon, TruckIcon } from "./icons";
import { formatMoney } from "@/lib/pricing";
import type { Address, DimensionUnit, PublicRate, WeightUnit } from "@/lib/types";

type Pkg = { length: string; width: string; height: string; dimension_unit: DimensionUnit; weight: string; weight_unit: WeightUnit };
type Purchased = {
  shipmentNo: string;
  trackingNo: string | null;
  labelUrls: string[];
  serviceName: string;
  price: number;
  currency: string;
};

const emptyPkg: Pkg = { length: "", width: "", height: "", dimension_unit: "in", weight: "", weight_unit: "lb" };

// One-tap box sizes (inches).
const PRESETS = [
  { label: "Small box", l: "8", w: "6", h: "4" },
  { label: "Medium box", l: "12", w: "10", h: "6" },
  { label: "Large box", l: "16", w: "12", h: "8" },
  { label: "Envelope", l: "12", w: "9", h: "1" },
];

// Dev-only sample data. NODE_ENV is inlined at build time, so the button is stripped from production builds.
const isDev = process.env.NODE_ENV === "development";
const sampleFrom: Address = {
  first_name: "Test",
  last_name: "Sender",
  company_name: "ShipBridge Dev",
  phone: "650-555-0100",
  email: "sender@example.com",
  street: "1600 Amphitheatre Pkwy",
  street2: "",
  city: "Mountain View",
  state: "CA",
  zip_code: "94043",
  country: "US",
};
const sampleTo: Address = {
  first_name: "Test",
  last_name: "Receiver",
  company_name: "",
  phone: "212-555-0199",
  email: "receiver@example.com",
  street: "350 5th Ave",
  street2: "Suite 100",
  city: "New York",
  state: "NY",
  zip_code: "10118",
  country: "US",
};
const samplePkg: Pkg = { length: "10", width: "8", height: "4", dimension_unit: "in", weight: "2", weight_unit: "lb" };

// Carrier accent colors for the rate list.
const CARRIER_STYLE: Record<string, string> = {
  USPS: "bg-[#004B87] text-white",
  UPS: "bg-[#351C15] text-[#FFB500]",
  FEDEX: "bg-[#4D148C] text-white",
  DHL: "bg-[#FFCC00] text-[#D40511]",
};
const carrierStyle = (c: string) => CARRIER_STYLE[c.toUpperCase()] ?? "bg-default-200 text-foreground";

const place = (a: Address) => (a.city && a.state ? `${a.city}, ${a.state}` : a.state || "—");

function Section({
  step,
  title,
  icon,
  action,
  children,
}: {
  step: number;
  title: string;
  icon?: React.ReactNode;
  action?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-xl border border-ink/10 bg-content1 p-4 shadow-sm sm:p-6">
      <header className="mb-4 flex items-center justify-between gap-3">
        <h2 className="flex items-center gap-3">
          <span className="grid size-7 place-items-center rounded-full bg-ink text-sm font-bold text-white">{step}</span>
          <span className="display text-lg font-semibold">{title}</span>
          {icon && <span className="text-steel">{icon}</span>}
        </h2>
        {action}
      </header>
      {children}
    </section>
  );
}

export function ShipmentForm() {
  const [from, setFrom] = useState<Address>(emptyAddress);
  const [to, setTo] = useState<Address>(emptyAddress);
  const [pkg, setPkg] = useState<Pkg>(emptyPkg);
  const [shipDate, setShipDate] = useState("");

  const [rates, setRates] = useState<PublicRate[] | null>(null);
  const [carrierErrors, setCarrierErrors] = useState<{ carrier: string; message: string }[]>([]);
  const [selected, setSelected] = useState<string | null>(null);
  const [loadingRates, setLoadingRates] = useState(false);
  const [buying, setBuying] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [needsLogin, setNeedsLogin] = useState(false);
  const [purchased, setPurchased] = useState<Purchased | null>(null);
  const ratesRef = useRef<HTMLElement>(null);

  // Any edit invalidates the current rates.
  const touch = <T,>(setter: (v: T) => void) => (v: T) => {
    setter(v);
    if (rates) {
      setRates(null);
      setSelected(null);
    }
  };
  const setPkgField = (patch: Partial<Pkg>) => touch(setPkg)({ ...pkg, ...patch });

  async function fetchRates(e: React.FormEvent) {
    e.preventDefault();
    // Dropdown-only fields can't use native "required" checks reliably, so check them here.
    const missing = [
      !from.state && "Ship from: state",
      !from.city && "Ship from: city",
      !to.state && "Ship to: state",
      !to.city && "Ship to: city",
    ].filter(Boolean);
    if (missing.length) {
      setError(`Choose ${missing.join(", ")} from the list.`);
      return;
    }

    setLoadingRates(true);
    setError(null);
    setNeedsLogin(false);
    setRates(null);
    setSelected(null);
    // When the rates panel sits below the form (phones, iPad portrait), bring it into view.
    if (window.matchMedia("(max-width: 1023px)").matches) {
      requestAnimationFrame(() => ratesRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }));
    }
    try {
      const res = await fetch("/api/rates", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ from, to, package: pkg, shipDate }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Could not get rates.");
      setRates(json.rates);
      setCarrierErrors(json.carrierErrors ?? []);
      if (json.rates.length) setSelected(json.rates[0].rateId);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoadingRates(false);
    }
  }

  async function buy() {
    if (!selected) return;
    setBuying(true);
    setError(null);
    try {
      const res = await fetch("/api/buy", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ rateId: selected }),
      });
      const json = await res.json();
      if (res.status === 401) {
        setNeedsLogin(true);
        return;
      }
      if (!res.ok) throw new Error(json.error ?? "Could not buy the label.");
      setPurchased(json.shipment);
      addToast({ title: "Label bought", description: `Shipment ${json.shipment.shipmentNo}`, color: "success" });
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBuying(false);
    }
  }

  function fillSample() {
    setFrom(sampleFrom);
    setTo(sampleTo);
    setPkg(samplePkg);
    setRates(null);
    setSelected(null);
    setError(null);
  }

  function swap() {
    const f = from;
    touch(setFrom)(to);
    setTo(f);
  }

  function reset() {
    setTo(emptyAddress());
    setPkg(emptyPkg);
    setRates(null);
    setSelected(null);
    setPurchased(null);
    setError(null);
  }

  if (purchased) {
    return (
      <section className="mx-auto max-w-xl overflow-hidden rounded-xl border border-ink/10 bg-content1 shadow-sm">
        <div className="barcode h-3" aria-hidden />
        <div className="p-6 sm:p-8">
          <span className="grid size-12 place-items-center rounded-full bg-success text-white">
            <CheckIcon className="size-6" />
          </span>
          <h1 className="display mt-4 text-3xl font-bold">Label ready</h1>
          <p className="mt-1 text-steel">
            {purchased.serviceName} · {formatMoney(purchased.price, purchased.currency)}
          </p>
          <dl className="mt-6 grid grid-cols-[auto_1fr] gap-x-6 gap-y-3 rounded-lg bg-background p-4 text-sm">
            <dt className="text-steel">Shipment number</dt>
            <dd className="font-medium">{purchased.shipmentNo}</dd>
            <dt className="text-steel">Tracking number</dt>
            <dd className="font-mono font-medium">{purchased.trackingNo ?? "Not provided yet"}</dd>
          </dl>
          <div className="mt-8 flex flex-wrap gap-3">
            {purchased.labelUrls.map((url, i) => (
              <Button key={url} as="a" href={url} target="_blank" rel="noopener" color="secondary" size="lg" className="font-semibold">
                {purchased.labelUrls.length > 1 ? `Open label ${i + 1}` : "Open label"}
              </Button>
            ))}
            <Button variant="bordered" size="lg" onPress={reset}>
              Create another shipment
            </Button>
          </div>
        </div>
      </section>
    );
  }

  const selectedRate = rates?.find((r) => r.rateId === selected);
  const fastestId = rates?.length
    ? [...rates]
        .filter((r) => r.deliveryDays && !Number.isNaN(Number(r.deliveryDays)))
        .sort((a, b) => Number(a.deliveryDays) - Number(b.deliveryDays) || a.price - b.price)[0]?.rateId
    : undefined;
  const hasRoute = from.state && to.state;
  const unitProps = { size: "sm" as const, radius: "sm" as const, "aria-label": "Unit", isDisabled: loadingRates };

  return (
    <div className="grid gap-8 lg:grid-cols-[1fr_380px]">
      <form onSubmit={fetchRates} className="space-y-6">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <h1 className="display text-3xl font-bold sm:text-4xl">New shipment</h1>
            <p className="mt-2 max-w-prose text-steel">Enter both addresses and the parcel, then compare carrier prices. US only.</p>
          </div>
          {isDev && (
            <Button size="sm" variant="flat" color="warning" onPress={fillSample} isDisabled={loadingRates}>
              Fill sample data (dev only)
            </Button>
          )}
        </div>

        <div className="@container">
          <div className="grid gap-6 @2xl:grid-cols-2">
            <Section step={1} title="Ship from">
              <AddressFields value={from} onChange={touch(setFrom)} disabled={loadingRates} />
            </Section>
            <Section
              step={2}
              title="Ship to"
              action={
                <Button size="sm" variant="light" onPress={swap} isDisabled={loadingRates} startContent={<SwapIcon />}>
                  Swap
                </Button>
              }
            >
              <AddressFields value={to} onChange={touch(setTo)} disabled={loadingRates} />
            </Section>
          </div>
        </div>

        <Section step={3} title="Parcel" icon={<BoxIcon />}>
          <div className="mb-4 flex flex-wrap gap-2">
            {PRESETS.map((p) => {
              const active = pkg.dimension_unit === "in" && pkg.length === p.l && pkg.width === p.w && pkg.height === p.h;
              return (
                <Chip
                  key={p.label}
                  as="button"
                  type="button"
                  variant={active ? "solid" : "bordered"}
                  color={active ? "primary" : "default"}
                  className="cursor-pointer"
                  onClick={() => setPkgField({ length: p.l, width: p.w, height: p.h, dimension_unit: "in" })}
                >
                  {p.label} · {p.l}×{p.w}×{p.h} in
                </Chip>
              );
            })}
          </div>

          <div className="space-y-4">
            <div>
              <div className="mb-2 flex items-center justify-between">
                <span className="text-sm font-medium">Dimensions</span>
                <Tabs
                  {...unitProps}
                  selectedKey={pkg.dimension_unit}
                  onSelectionChange={(k) => setPkgField({ dimension_unit: k as DimensionUnit })}
                >
                  <Tab key="in" title="in" />
                  <Tab key="cm" title="cm" />
                </Tabs>
              </div>
              <div className="grid grid-cols-3 gap-3">
                {(["length", "width", "height"] as const).map((k) => (
                  <Input
                    key={k}
                    variant="bordered"
                    size="sm"
                    type="number"
                    min={0}
                    step="any"
                    inputMode="decimal"
                    isRequired
                    isDisabled={loadingRates}
                    label={k[0].toUpperCase() + k.slice(1)}
                    endContent={<span className="text-xs text-steel">{pkg.dimension_unit}</span>}
                    value={pkg[k]}
                    onValueChange={(v) => setPkgField({ [k]: v })}
                  />
                ))}
              </div>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <div className="mb-2 flex items-center justify-between">
                  <span className="text-sm font-medium">Weight</span>
                  <Tabs {...unitProps} selectedKey={pkg.weight_unit} onSelectionChange={(k) => setPkgField({ weight_unit: k as WeightUnit })}>
                    <Tab key="lb" title="lb" />
                    <Tab key="oz" title="oz" />
                  </Tabs>
                </div>
                <Input
                  variant="bordered"
                  size="sm"
                  type="number"
                  min={0}
                  step="any"
                  inputMode="decimal"
                  isRequired
                  isDisabled={loadingRates}
                  label="Weight"
                  endContent={<span className="text-xs text-steel">{pkg.weight_unit}</span>}
                  value={pkg.weight}
                  onValueChange={(v) => setPkgField({ weight: v })}
                />
              </div>
              <div>
                <div className="mb-2 flex h-8 items-center">
                  <span className="text-sm font-medium">Ship date</span>
                </div>
                <Input
                  variant="bordered"
                  size="sm"
                  type="date"
                  label="Optional"
                  isDisabled={loadingRates}
                  value={shipDate}
                  onValueChange={touch(setShipDate)}
                />
              </div>
            </div>
          </div>
        </Section>

        <div className="flex flex-col-reverse gap-3 sm:flex-row sm:items-center sm:justify-between">
          <p className="flex items-center gap-2 text-sm text-steel">
            {hasRoute ? (
              <>
                <span className="font-medium text-foreground">{place(from)}</span>
                <ArrowRightIcon />
                <span className="font-medium text-foreground">{place(to)}</span>
              </>
            ) : (
              "Choose both addresses to see your route."
            )}
          </p>
          <Button
            type="submit"
            color="primary"
            size="lg"
            isLoading={loadingRates}
            className="font-semibold sm:min-w-44"
            endContent={!loadingRates && <ArrowRightIcon />}
          >
            {loadingRates ? "Getting rates" : "Get rates"}
          </Button>
        </div>
      </form>

      <aside ref={ratesRef} className="scroll-mt-4 lg:sticky lg:top-6 lg:self-start">
        <div className="overflow-hidden rounded-xl border border-ink/10 bg-content1 shadow-sm">
          <div className="flex items-center justify-between gap-3 bg-ink px-5 py-4 text-white">
            <h2 className="display flex items-center gap-2 text-lg font-semibold">
              <TruckIcon className="size-5" /> Rates
            </h2>
            {rates && rates.length > 0 && <span className="text-sm text-white/70">{rates.length} options</span>}
          </div>

          <div className="p-5">
            {error && <Alert color="danger" className="mb-4" title={error} />}
            {needsLogin && (
              <Alert
                color="warning"
                className="mb-4"
                title="Sign in to buy labels"
                description={
                  <NextLink href="/admin/login?next=/" className="underline">
                    Go to sign in
                  </NextLink>
                }
              />
            )}

            {loadingRates && (
              <ul className="space-y-2" aria-label="Loading rates">
                {[0, 1, 2].map((i) => (
                  <li key={i} className="flex items-center gap-3 rounded-lg border border-default-200 p-3">
                    <Skeleton className="h-8 w-12 rounded-md" />
                    <div className="flex-1 space-y-2">
                      <Skeleton className="h-3 w-3/4 rounded" />
                      <Skeleton className="h-3 w-1/3 rounded" />
                    </div>
                    <Skeleton className="h-5 w-14 rounded" />
                  </li>
                ))}
              </ul>
            )}

            {!rates && !loadingRates && !error && (
              <div className="py-6 text-center">
                <span className="mx-auto grid size-12 place-items-center rounded-full bg-background text-steel">
                  <TruckIcon className="size-6" />
                </span>
                <p className="mt-3 text-sm text-steel">Fill in the form and choose Get rates to compare prices here.</p>
              </div>
            )}

            {rates && rates.length === 0 && (
              <p className="text-sm text-steel">
                No carrier returned a price for this parcel. Check the addresses and dimensions, then try again.
              </p>
            )}

            {rates && rates.length > 0 && (
              <ul className="max-h-[60vh] space-y-2 overflow-y-auto pr-1" role="radiogroup" aria-label="Shipping rates">
                {rates.map((r, i) => {
                  const isSel = r.rateId === selected;
                  return (
                    <li key={r.rateId}>
                      <button
                        type="button"
                        role="radio"
                        aria-checked={isSel}
                        onClick={() => setSelected(r.rateId)}
                        className={`flex w-full items-center gap-3 rounded-lg border-2 p-3 text-left outline-none transition-colors focus-visible:ring-2 focus-visible:ring-hivis ${
                          isSel ? "border-hivis bg-hivis/10" : "border-default-200 hover:border-default-400"
                        }`}
                      >
                        <span
                          className={`grid h-8 w-12 shrink-0 place-items-center rounded-md text-[11px] font-bold tracking-wide ${carrierStyle(r.carrierCode)}`}
                        >
                          {r.carrierCode.toUpperCase() === "FEDEX" ? "FedEx" : r.carrierCode}
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="block font-medium leading-snug">{r.serviceName}</span>
                          <span className="mt-1 flex flex-wrap items-center gap-2 text-xs text-steel">
                            {r.deliveryDays && (
                              <span className="flex items-center gap-1">
                                <ClockIcon /> {r.deliveryDays} {r.deliveryDays === "1" ? "day" : "days"}
                              </span>
                            )}
                            {i === 0 && (
                              <Chip size="sm" variant="flat" color="success" className="h-5">
                                Cheapest
                              </Chip>
                            )}
                            {r.rateId === fastestId && i !== 0 && (
                              <Chip size="sm" variant="flat" color="primary" className="h-5">
                                Fastest
                              </Chip>
                            )}
                          </span>
                        </span>
                        <span className="display text-lg font-bold tabular-nums">{formatMoney(r.price, r.currency)}</span>
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}

            {carrierErrors.length > 0 && (
              <details className="mt-4 text-xs text-steel">
                <summary className="cursor-pointer">{carrierErrors.length} carrier(s) couldn&apos;t quote</summary>
                <ul className="mt-2 space-y-1">
                  {carrierErrors.map((e, i) => (
                    <li key={i}>
                      <strong>{e.carrier}:</strong> {e.message}
                    </li>
                  ))}
                </ul>
              </details>
            )}

            {selectedRate && (
              <div className="mt-5 border-t border-dashed border-ink/20 pt-4">
                <div className="mb-3 flex items-baseline justify-between text-sm">
                  <span className="text-steel">Total</span>
                  <span className="display text-2xl font-bold tabular-nums">{formatMoney(selectedRate.price, selectedRate.currency)}</span>
                </div>
                <Button color="secondary" size="lg" fullWidth className="font-semibold" isLoading={buying} onPress={buy}>
                  {buying ? "Buying label" : "Buy label"}
                </Button>
              </div>
            )}
          </div>
        </div>
      </aside>
    </div>
  );
}
