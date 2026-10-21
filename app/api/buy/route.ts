import { NextResponse } from "next/server";
import { BuyRequestSchema } from "@/lib/validation";
import { buyLabel, CarrierApiError, type ShippoTransaction } from "@/lib/shippo";
import { customerShippoKey, usageThisMonth } from "@/lib/customers";
import { addShipment, claimQuote, getDraft, releaseQuote } from "@/lib/db";
import { round2 } from "@/lib/pricing";
import { errorResponse } from "@/lib/http";
import { ownerOf, type Address, type Draft, type Quote, type ShipmentDetails, type ShipmentParty } from "@/lib/types";
import { requireCustomer } from "@/lib/session";
import { BodyError, readJson, safeHttpUrl } from "@/lib/request";

export const runtime = "nodejs";

function party(a: Address): ShipmentParty {
  return {
    name: `${a.first_name} ${a.last_name}`.trim(),
    company: a.company_name ?? "",
    phone: a.phone ?? "",
    street: a.street,
    street2: a.street2 ?? "",
    city: a.city,
    state: a.state,
    zip: a.zip_code,
    country: a.country || "US",
  };
}

/** Everything worth keeping about the booking: the quote, the form inputs (draft) and Shippo's label. */
function details(tx: ShippoTransaction, quote: Quote, draft: Draft | null): ShipmentDetails {
  const p = draft?.package;
  return {
    from: draft ? party(draft.from) : null,
    to: draft ? party(draft.to) : null,
    parcel: p
      ? { length: p.length, width: p.width, height: p.height, weight: p.weight, distanceUnit: p.dimension_unit, massUnit: p.weight_unit }
      : null,
    carrier: quote.carrierCode,
    service: quote.serviceName,
    deliveryDays: quote.deliveryDays,
    trackingUrl: safeHttpUrl(tx.tracking_url_provider),
    labelRate: quote.cost,
    serviceFee: 0,
    insuranceFee: 0,
    publishedRate: null,
    quotedCost: quote.cost,
    flatFee: quote.flatFee,
    labelStatus: tx.status ? tx.status.toLowerCase() : null,
  };
}

export async function POST(req: Request) {
  const auth = await requireCustomer(req); // customers only; the admin doesn't book
  if ("response" in auth) return auth.response;
  const { actor } = auth;
  let raw: unknown;
  try {
    raw = await readJson(req, 2 * 1024);
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: (e as BodyError).status ?? 400 });
  }
  const parsed = BuyRequestSchema.safeParse(raw);
  if (!parsed.success) return NextResponse.json({ error: "Choose a rate first." }, { status: 400 });
  const { rateId } = parsed.data;

  // Reserve the quote so a double-click can't buy two labels.
  const claim = await claimQuote(rateId);
  if ("error" in claim) return NextResponse.json({ error: claim.error }, { status: claim.status });
  const { quote } = claim;

  // A quote can only be bought by whoever fetched it (customers never see each other's rates).
  if (ownerOf(quote) !== actor.ownerId) {
    await releaseQuote(rateId);
    return NextResponse.json({ error: "This rate is no longer available. Get rates again." }, { status: 404 });
  }

  // Monthly limits set by the admin for this customer.
  if (actor.user) {
    const { monthlyLabelLimit, monthlySpendLimit } = actor.user.settings;
    if (monthlyLabelLimit !== null || monthlySpendLimit !== null) {
      const used = await usageThisMonth(actor.ownerId);
      const overLabels = monthlyLabelLimit !== null && used.labels + 1 > monthlyLabelLimit;
      const overSpend = monthlySpendLimit !== null && used.spend + quote.price > monthlySpendLimit;
      if (overLabels || overSpend) {
        await releaseQuote(rateId);
        return NextResponse.json(
          {
            error: overLabels
              ? `Monthly label limit reached (${monthlyLabelLimit}). Contact your provider to raise it.`
              : `This label would go over your monthly spending limit ($${monthlySpendLimit}). Contact your provider.`,
            code: "limit_reached",
          },
          { status: 403 },
        );
      }
    }
  }
  const shippoKey = customerShippoKey(actor.user);

  // TODO (before opening to customers): charge the customer `quote.price` here
  // (e.g. Stripe PaymentIntent) and only continue once payment succeeds.

  try {
    const tx = await buyLabel(shippoKey, rateId, actor.user.settings.labelFileType);
    // The draft holds the form inputs; keep them with the booking so it can be re-quoted later.
    const draft = quote.draftId ? await getDraft(quote.draftId).catch(() => null) : null;

    // Shippo charges the rate amount that was quoted.
    const cost = quote.cost;
    const record = {
      id: crypto.randomUUID(),
      ownerId: actor.ownerId,
      ownerName: actor.user.company || actor.user.name || actor.user.username,
      createdAt: new Date().toISOString(),
      rateId,
      shipmentNo: tx.object_id,
      trackingNo: tx.tracking_number || null,
      carrierCode: quote.carrierCode,
      serviceName: quote.serviceName,
      recipient: quote.recipient,
      cost,
      charged: quote.price,
      profit: round2(quote.price - cost),
      marginPercent: quote.marginPercent,
      currency: quote.currency,
      labelUrls: safeHttpUrl(tx.label_url) ? [safeHttpUrl(tx.label_url)!] : [],
      details: details(tx, quote, draft),
      ...(draft ? { request: { from: draft.from, to: draft.to, package: draft.package, shipDate: draft.shipDate } } : {}),
    };
    await addShipment(record);

    return NextResponse.json({
      shipment: {
        id: record.id,
        shipmentNo: record.shipmentNo,
        trackingNo: record.trackingNo,
        labelUrls: record.labelUrls,
        serviceName: record.serviceName,
        price: record.charged,
        currency: record.currency,
      },
    });
  } catch (err) {
    // Free the rate for another try only when Shippo clearly refused it (4xx / label status ERROR).
    // After a timeout or server error the label may have been bought anyway; retrying could pay twice.
    if (err instanceof CarrierApiError && err.status >= 400 && err.status < 500) {
      await releaseQuote(rateId);
      return errorResponse(err);
    }
    console.error("[buy] outcome unknown for rate", rateId, err);
    return NextResponse.json(
      {
        error:
          "We couldn't confirm the purchase. To avoid paying twice, this rate is now locked. Check your Shippo dashboard for the label before trying again with new rates.",
      },
      { status: 502 },
    );
  }
}
