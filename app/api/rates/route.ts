import { NextResponse } from "next/server";
import { RateRequestSchema } from "@/lib/validation";
import { getRates, type SSAddress } from "@/lib/shipsaving";
import { getSettings, saveQuotes } from "@/lib/db";
import { applyMargin, round2 } from "@/lib/pricing";
import { errorResponse } from "@/lib/http";
import type { Address, PublicRate, Quote } from "@/lib/types";

export const runtime = "nodejs";

function toSSAddress(a: Address): SSAddress {
  return {
    name: `${a.first_name} ${a.last_name}`.trim(),
    company: a.company_name,
    email: a.email,
    phone: a.phone,
    street: a.street,
    street2: a.street2,
    city: a.city,
    state: a.state,
    zip: a.zip_code,
    country: a.country,
  };
}

// "USPS_GROUND_ADVANTAGE" -> "USPS Ground Advantage"
const SPECIAL_WORDS: Record<string, string> = { USPS: "USPS", UPS: "UPS", DHL: "DHL", FEDEX: "FedEx" };
function serviceLabel(code: string) {
  return code
    .split(/[_\s]+/)
    .filter(Boolean)
    .map((w) => SPECIAL_WORDS[w.toUpperCase()] ?? w[0].toUpperCase() + w.slice(1).toLowerCase())
    .join(" ");
}

export async function POST(req: Request) {
  const parsed = RateRequestSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    const first = parsed.error.issues[0];
    return NextResponse.json(
      { error: first ? `${first.path.join(" › ")}: ${first.message}` : "Check the form fields." },
      { status: 400 },
    );
  }
  const { from, to, package: pkg, shipDate } = parsed.data;

  try {
    // v1 only accepts inches and pounds.
    const toIn = (n: number) => round2(pkg.dimension_unit === "cm" ? n / 2.54 : n);
    const weightLb = pkg.weight_unit === "oz" ? pkg.weight / 16 : pkg.weight;

    const ssRates = await getRates({
      from: toSSAddress(from),
      to: toSSAddress(to),
      shipments: [
        {
          length: toIn(pkg.length),
          width: toIn(pkg.width),
          height: toIn(pkg.height),
          weight: Math.max(round2(weightLb), 0.01),
        },
      ],
      ...(shipDate ? { ship_date: `${shipDate}T09:00:00+00:00` } : {}),
    });

    const settings = await getSettings();
    const createdAt = new Date().toISOString();

    const quotes: Quote[] = ssRates
      .filter((r) => typeof r.rate === "number" && r.rate > 0 && r.rate_id)
      .map((r) => ({
        rateId: r.rate_id,
        carrierCode: r.carrier,
        serviceName: serviceLabel(r.service || r.service_type),
        serviceLevel: r.service_type,
        deliveryDays: r.delivery_days != null && r.delivery_days !== "" ? String(r.delivery_days) : null,
        currency: "USD",
        cost: r.rate as number,
        recipient: `${to.first_name} ${to.last_name}, ${to.city} ${to.state}`,
        price: applyMargin(r.rate as number, settings),
        marginPercent: settings.percent,
        flatFee: settings.flatFee,
        createdAt,
        usedAt: null,
      }));

    await saveQuotes(quotes);

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

    // v1 doesn't report per-carrier failures; the field stays for the UI.
    return NextResponse.json({ rates, carrierErrors: [] });
  } catch (err) {
    return errorResponse(err);
  }
}
