// Carrier accent colors, shared by rate lists and admin pages.
const STYLE: Record<string, string> = {
  USPS: "bg-[#004B87] text-white",
  UPS: "bg-[#351C15] text-[#FFB500]",
  FEDEX: "bg-[#4D148C] text-white",
  DHL: "bg-[#FFCC00] text-[#D40511]",
  DHL_EXPRESS: "bg-[#FFCC00] text-[#D40511]",
};

export function CarrierBadge({ carrier, className = "" }: { carrier: string; className?: string }) {
  const key = carrier.toUpperCase().replace(/\s+/g, "_");
  const label = key === "FEDEX" ? "FedEx" : carrier.length > 6 ? carrier.slice(0, 5) : carrier;
  return (
    <span
      className={`grid h-8 w-12 shrink-0 place-items-center rounded-md text-[11px] font-bold tracking-wide ${STYLE[key] ?? "bg-default-200 text-foreground"} ${className}`}
      title={carrier}
    >
      {label}
    </span>
  );
}
