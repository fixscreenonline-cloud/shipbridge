import { NextResponse } from "next/server";
import { BuyRequestSchema } from "@/lib/validation";
import { buyLabel } from "@/lib/shipsaving";
import { addShipment, claimQuote, releaseQuote } from "@/lib/db";
import { round2 } from "@/lib/pricing";
import { errorResponse } from "@/lib/http";

export const runtime = "nodejs";

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
