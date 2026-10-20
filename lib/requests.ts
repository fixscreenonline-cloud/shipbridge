import type { Address, Draft, ShipmentDetails, ShipmentParty, ShipmentRequest } from "./types";

/** Older bookings only have the saved booking copy of the addresses; turn that back into form fields. */
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

/** The form inputs to re-quote a booking, from its saved request or (older records) its details. */
export function bookingRequest(b: { request?: ShipmentRequest | null; details?: ShipmentDetails | null }): ShipmentRequest | null {
  if (b.request) return b.request;
  const d = b.details;
  if (!d?.from || !d.to || !d.parcel) return null;
  return {
    from: partyToAddress(d.from),
    to: partyToAddress(d.to),
    package: {
      length: d.parcel.length,
      width: d.parcel.width,
      height: d.parcel.height,
      weight: d.parcel.weight,
      dimension_unit: d.parcel.distanceUnit ?? "in",
      weight_unit: d.parcel.massUnit ?? "lb",
    },
  };
}

export type CarrierNote = { message: string; carriers: string[]; checks: number; lastSeen: string };

/** Groups the carrier notes saved on recent drafts: one row per message, with how many checks hit it. */
export function collectCarrierNotes(drafts: Draft[]): CarrierNote[] {
  const byMessage = new Map<string, { carriers: Set<string>; checks: number; lastSeen: string }>();
  for (const d of drafts) {
    for (const n of d.carrierNotes ?? []) {
      const row = byMessage.get(n.message) ?? { carriers: new Set<string>(), checks: 0, lastSeen: d.updatedAt };
      if (n.carrier && n.carrier !== "Some carriers") n.carrier.split(", ").forEach((c) => row.carriers.add(c));
      row.checks += 1;
      if (d.updatedAt > row.lastSeen) row.lastSeen = d.updatedAt;
      byMessage.set(n.message, row);
    }
  }
  return [...byMessage]
    .map(([message, r]) => ({ message, carriers: [...r.carriers].sort(), checks: r.checks, lastSeen: r.lastSeen }))
    .sort((a, b) => b.checks - a.checks);
}
