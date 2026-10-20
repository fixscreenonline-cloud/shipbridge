import { ArrowRightIcon, CheckIcon, ClockIcon } from "./icons";

const CARRIERS = [
  { name: "USPS", className: "bg-[#004B87] text-white" },
  { name: "UPS", className: "bg-[#351C15] text-[#FFB500]" },
  { name: "FedEx", className: "bg-[#4D148C] text-white" },
  { name: "DHL", className: "bg-[#FFCC00] text-[#D40511]" },
];

const POINTS = ["Live rates from major carriers", "Cheapest and fastest highlighted", "Labels and tracking in one place"];

/** Decorative rate card (not interactive, no prices). */
function RatePreview() {
  const rows = [
    { c: CARRIERS[0], service: "Ground Advantage", days: "2–5 days", tag: "Cheapest" },
    { c: CARRIERS[0], service: "Priority Mail", days: "1–3 days" },
    { c: CARRIERS[1], service: "UPS Ground", days: "3 days" },
    { c: CARRIERS[2], service: "FedEx 2Day", days: "2 days", tag: "Fastest" },
  ];
  return (
    <div aria-hidden className="w-full max-w-sm -rotate-[1.5deg] select-none rounded-2xl bg-white/95 p-4 text-ink shadow-2xl ring-1 ring-black/5">
      <div className="mb-4 flex items-center justify-between gap-3">
        <div className="barcode h-6 flex-1 rounded-sm opacity-80" />
        <span className="rounded bg-background px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-steel">Example</span>
      </div>
      <p className="flex items-center gap-2 text-sm font-semibold">
        Austin, TX <ArrowRightIcon className="size-3.5 text-steel" /> New York, NY
      </p>
      <p className="text-xs text-steel">12 × 10 × 6 in · 2 lb</p>
      <ul className="mt-3 space-y-2">
        {rows.map((r, i) => (
          <li key={r.service} className={`flex items-center gap-3 rounded-lg border-2 p-2.5 ${i === 0 ? "border-hivis bg-hivis/10" : "border-default-200"}`}>
            <span className={`grid h-7 w-11 place-items-center rounded-md text-[10px] font-bold ${r.c.className}`}>{r.c.name}</span>
            <span className="min-w-0 flex-1">
              <span className="block truncate text-sm font-medium">{r.service}</span>
              <span className="flex items-center gap-1 text-[11px] text-steel">
                <ClockIcon className="size-3" /> {r.days}
                {r.tag && <span className="ml-1 rounded bg-success-50 px-1.5 text-success-700">{r.tag}</span>}
              </span>
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

/** Left side of the sign-in screen. */
export function LoginHero() {
  return (
    <div>
      <p className="inline-flex items-center gap-2 rounded-full bg-white/10 px-3 py-1 text-xs font-medium text-white/80 ring-1 ring-white/15">
        <span className="size-1.5 rounded-full bg-hivis" /> US domestic shipping
      </p>
      <h2 className="display mt-5 text-4xl font-bold leading-[1.05] sm:text-5xl">
        Ship for less.
        <br />
        <span className="text-hivis">Compare every carrier</span> in seconds.
      </h2>
      <ul className="mt-6 space-y-2 text-sm">
        {POINTS.map((p) => (
          <li key={p} className="flex items-center gap-2 text-white/90">
            <span className="grid size-5 place-items-center rounded-full bg-hivis text-ink">
              <CheckIcon className="size-3" />
            </span>
            {p}
          </li>
        ))}
      </ul>
      <div className="mt-6 flex items-center gap-1.5" aria-label="Carriers">
        {CARRIERS.map((c) => (
          <span key={c.name} className={`grid h-7 min-w-11 place-items-center rounded-md px-1.5 text-[10px] font-bold ${c.className}`}>
            {c.name}
          </span>
        ))}
      </div>
      <div className="mt-10 hidden xl:block">
        <RatePreview />
      </div>
    </div>
  );
}
