import { NextResponse } from "next/server";
import { BuyRequestSchema } from "@/lib/validation";
import { buyLabel, type SSLabel } from "@/lib/shipsaving";
import { addShipment, claimQuote, getDraft, releaseQuote } from "@/lib/db";
import { round2 } from "@/lib/pricing";
import { errorResponse } from "@/lib/http";
import type { Quote, ShipmentDetails, ShipmentParty } from "@/lib/types";

export const runtime = "nodejs";

const str = (v: unknown) => (v == null ? "" : String(v));
const num = (v: unknown) => {
  if (v == null || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};

function party(label: SSLabel, side: "from" | "to"): ShipmentParty | null {
  const get = (f: string) => str((label as Record<string, unknown>)[`${side}_${f}`]);
  if (!get("name") && !get("street")) return null;
  return {
    name: get("name"),
    company: get("company"),
    phone: get("phone"),
    street: get("street"),
    street2: get("street2"),
    city: get("city"),
    state: get("state"),
    zip: get("zip"),
    country: get("country") || "US",
  };
}

/** Everything worth keeping about the booking, taken from ShipSaving's purchase response. */
function details(label: SSLabel, quote: Quote): ShipmentDetails {
  const l = num(label.length), w = num(label.width), h = num(label.height), wt = num(label.weight);
  return {
    from: party(label, "from"),
    to: party(label, "to"),
    parcel: l && w && h && wt ? { length: l, width: w, height: h, weight: wt } : null,
    carrier: quote.carrierCode || str(label.carrier), // same source as the service name
    service: quote.serviceName,
    deliveryDays: str(label.delivery_days) || quote.deliveryDays,
    labelRate: num(label.rate),
    serviceFee: num(label.service_fee) ?? 0,
    insuranceFee: num(label.insurance_fee) ?? 0,
    publishedRate: num(label.published_rate),
    quotedCost: quote.cost,
    flatFee: quote.flatFee,
    labelStatus: str(label.label_status) || null,
  };
}

export async function POST(req: Request) {
  const parsed = BuyRequestSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Choose a rate first." }, { status: 400 });
  const { rateId } = parsed.data;

  // Reserve the quote so a double-click can't buy two labels.
  const claim = await claimQuote(rateId);
  if ("error" in claim) return NextResponse.json({ error: claim.error }, { status: claim.status });
  const { quote } = claim;

  // TODO (before opening to customers): charge the customer `quote.price` here
  // (e.g. Stripe PaymentIntent) and only continue once payment succeeds.

  try {
    const label = await buyLabel(rateId);
    // Keep the form inputs with the booking so it can be re-quoted after the draft is gone.
    const draft = quote.draftId ? await getDraft(quote.draftId).catch(() => null) : null;

    // What ShipSaving actually charged: label rate + service fee + insurance, falling back to the quote.
    const cost =
      typeof label.rate === "number"
        ? round2(label.rate + (label.service_fee ?? 0) + (label.insurance_fee ?? 0))
        : quote.cost;
    const record = {
      id: crypto.randomUUID(),
      createdAt: new Date().toISOString(),
      rateId,
      shipmentNo: String(label.shipment_id),
      trackingNo: label.tracking_code || null,
      carrierCode: quote.carrierCode,
      serviceName: quote.serviceName,
      recipient: quote.recipient,
      cost,
      charged: quote.price,
      profit: round2(quote.price - cost),
      marginPercent: quote.marginPercent,
      currency: quote.currency,
      labelUrls: label.label_url ?? [],
      details: details(label, quote),
      ...(draft ? { request: { from: draft.from, to: draft.to, package: draft.package, shipDate: draft.shipDate } } : {}),
    };
    await addShipment(record);

    return NextResponse.json({
      shipment: {
        shipmentNo: record.shipmentNo,
        trackingNo: record.trackingNo,
        labelUrls: record.labelUrls,
        serviceName: record.serviceName,
        price: record.charged,
        currency: record.currency,
      },
    });
  } catch (err) {
    await releaseQuote(rateId);
    return errorResponse(err);
  }
}
