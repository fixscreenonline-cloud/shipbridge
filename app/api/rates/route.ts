import { NextResponse } from "next/server";
import { createHash } from "crypto";
import { RateRequestSchema } from "@/lib/validation";
import { createShipment, type ShippoAddress } from "@/lib/shippo";
import { customerShippoKey } from "@/lib/customers";
import { saveDraftWithQuotes } from "@/lib/db";
import { applyMargin } from "@/lib/pricing";
import { errorResponse } from "@/lib/http";
import { BodyError, readJson } from "@/lib/request";
import { requireCustomer } from "@/lib/session";
import type { Address, Draft, PublicRate, Quote, ShipmentRequest } from "@/lib/types";

export const runtime = "nodejs";

function toShippoAddress(a: Address): ShippoAddress {
  return {
    name: `${a.first_name} ${a.last_name}`.trim(),
    company: a.company_name,
    email: a.email,
    phone: a.phone,
    street1: a.street,
    street2: a.street2,
    city: a.city,
    state: a.state,
    zip: a.zip_code,
    country: a.country,
  };
}

/** Same addresses + parcel => same id, so re-quoting updates one draft instead of adding another. */
function draftId(req: ShipmentRequest, ownerId: string) {
  const norm = (a: Address) =>
    [a.first_name, a.last_name, a.company_name, a.phone, a.email, a.street, a.street2, a.city, a.state, a.zip_code, a.country]
      .map((v) => (v ?? "").trim().toLowerCase().replace(/\s+/g, " "))
      .join("|");
  const p = req.package;
  // The owner is part of the key: two customers quoting the same addresses get separate drafts.
  const key = [ownerId, norm(req.from), norm(req.to), p.length, p.width, p.height, p.dimension_unit, p.weight, p.weight_unit].join("#");
  return "d_" + createHash("sha256").update(key).digest("hex").slice(0, 24);
}

/** "shippo_colissimo_account" -> "Colissimo", "COURIERSPLEASE_SHIPPO_TIER_1" -> "Couriersplease". */
function carrierFromAccount(text: string) {
  const id = text.match(/carrier account (\S+)/i)?.[1];
  if (!id) return null;
  const name = id
    .replace(/^shippo_/i, "")
    .replace(/_(shippo|account|master|tier_\d+).*$/i, "")
    .replace(/_/g, " ")
    .toLowerCase();
  return name.replace(/\b\w/g, (c) => c.toUpperCase());
}

/**
 * Shippo asks every carrier on the account, including ones that can't serve this shipment
 * (e.g. international carriers for a US parcel), and explains each miss. Merge duplicates and
 * name the carrier where the message allows.
 */
function carrierNotes(messages: { source?: string; text?: string }[]) {
  const byText = new Map<string, Set<string>>();
  for (const m of messages) {
    if (!m.text) continue;
    const carrier = carrierFromAccount(m.text) ?? (m.source && !/^shippo/i.test(m.source) ? m.source : null);
    const text = m.text.replace(/carrier account \S+ doesn't/i, "Doesn't");
    if (!byText.has(text)) byText.set(text, new Set());
    if (carrier) byText.get(text)!.add(carrier);
  }
  return [...byText].map(([message, carriers]) => ({
    carrier: carriers.size ? [...carriers].join(", ") : "Some carriers",
    message,
  }));
}

/** "Priority Mail" from USPS -> "USPS Priority Mail"; names that already include the carrier stay as-is. */
function serviceLabel(provider: string, name: string | undefined) {
  if (!name) return provider;
  return name.toLowerCase().startsWith(provider.toLowerCase()) ? name : `${provider} ${name}`;
}

export async function POST(req: Request) {
  // Only signed-in customers get rates (the admin doesn't book).
  const auth = await requireCustomer(req);
  if ("response" in auth) return auth.response;
  const { actor } = auth;
  let raw: unknown;
  try {
    raw = await readJson(req, 16 * 1024);
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: (e as BodyError).status ?? 400 });
  }
  const parsed = RateRequestSchema.safeParse(raw);
  if (!parsed.success) {
    const first = parsed.error.issues[0];
    return NextResponse.json(
      { error: first ? `${first.path.join(" › ")}: ${first.message}` : "Check the form fields." },
      { status: 400 },
    );
  }
  const { from, to, package: pkg, shipDate } = parsed.data;

  try {
    // Customers rate on their own Shippo account.
    const shippoKey = customerShippoKey(actor.user);
    if (!shippoKey) {
      return NextResponse.json({ error: "Add your Shippo API key in Settings to get rates.", code: "no_shippo_key" }, { status: 400 });
    }

    // Shippo accepts inches/cm and pounds/ounces directly.
    const shipment = await createShipment(shippoKey, {
      address_from: toShippoAddress(from),
      address_to: toShippoAddress(to),
      parcels: [
        {
          length: String(pkg.length),
          width: String(pkg.width),
          height: String(pkg.height),
          distance_unit: pkg.dimension_unit,
          weight: String(pkg.weight),
          mass_unit: pkg.weight_unit,
        },
      ],
      ...(shipDate ? { shipment_date: `${shipDate}T12:00:00Z` } : {}),
    });

    // Pricing: the customer pays their Shippo price plus the fee you set for them.
    const pricing = { percent: actor.user.settings.feePercent, flatFee: actor.user.settings.feeFlat };
    // Carrier names are compared without spaces/case ("DHL Express" = "DHLExpress").
    const carrierKey = (c: string) => c.toUpperCase().replace(/[^A-Z0-9]/g, "");
    const allowed = actor.user.settings.allowedCarriers.map(carrierKey);
    const createdAt = new Date().toISOString();
    const request: ShipmentRequest = { from, to, package: pkg, ...(shipDate ? { shipDate } : {}) };
    const id = draftId(request, actor.ownerId);

    const quotes: Quote[] = (shipment.rates ?? [])
      .filter((r) => r.object_id && Number(r.amount) > 0)
      .filter((r) => allowed.length === 0 || allowed.includes(carrierKey(r.provider)))
      .map((r) => ({
        rateId: r.object_id,
        draftId: id,
        ownerId: actor.ownerId,
        carrierCode: r.provider,
        serviceName: serviceLabel(r.provider, r.servicelevel?.name),
        serviceLevel: r.servicelevel?.token ?? "",
        deliveryDays: r.estimated_days != null ? String(r.estimated_days) : null,
        currency: r.currency || "USD",
        cost: Number(r.amount),
        recipient: `${to.first_name} ${to.last_name}, ${to.city} ${to.state}`,
        price: applyMargin(Number(r.amount), pricing),
        marginPercent: pricing.percent,
        flatFee: pricing.flatFee,
        createdAt,
        usedAt: null,
      }));

    const draft: Draft = {
      ...request,
      id,
      ownerId: actor.ownerId,
      createdAt,
      updatedAt: createdAt,
      rateCount: quotes.length,
      lowestPrice: quotes.length ? Math.min(...quotes.map((q) => q.price)) : null,
      carrierNotes: carrierNotes(shipment.messages ?? []),
      currency: "USD",
    };
    await saveDraftWithQuotes(draft, quotes);

    // Strip cost/margin before sending to the browser.
    const rates: PublicRate[] = quotes
      .map(({ rateId, carrierCode, serviceName, serviceLevel, deliveryDays, price, currency }) => ({
        rateId,
        carrierCode,
        serviceName,
        serviceLevel,
        deliveryDays,
        price,
        currency,
      }))
      .sort((a, b) => a.price - b.price);

    // Notes about carriers that couldn't quote are saved with the draft and shown in /admin only.
    return NextResponse.json({ rates });
  } catch (err) {
    return errorResponse(err);
  }
}
