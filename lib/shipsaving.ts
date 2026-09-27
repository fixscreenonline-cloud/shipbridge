import "server-only";

// ShipSaving Legacy API (v1): https://docs.shipsaving.com/v1/openapi
// Auth is a single API token sent as the `api_token` query parameter.
const API_BASE = (process.env.SHIPSAVING_API_BASE || "https://api.shipsaving.com").replace(/\/$/, "");

export class ShipSavingError extends Error {
  constructor(message: string, public status = 502, public details?: unknown) {
    super(message);
  }
}

// ---------- Request / response types (subset of v1) ----------
export type SSAddress = {
  name: string;
  company?: string;
  email?: string;
  phone?: string;
  street: string;
  street2?: string;
  city: string;
  state: string;
  zip: string;
  country: string;
  residential?: boolean;
};

/** Dimensions in inches, weight in pounds (v1 accepts no other units). */
export type SSParcel = { length: number; width: number; height: number; weight: number };

export type SSRateRequest = {
  from: SSAddress;
  to: SSAddress;
  shipments: SSParcel[];
  ship_date?: string;
};

export type SSRate = {
  shipment_id: string;
  rate_id: string;
  provider: string;
  account_name: string;
  carrier: string;
  service: string;
  service_type: string;
  package: string;
  package_type: string;
  delivery_days: string | number | null;
  published_rate: number | null;
  rate: number | null;
  rebate: number | null;
};

export type SSLabel = {
  shipment_id: number | string;
  tracking_code: string | null;
  label_status: string;
  carrier: string;
  service: string;
  rate: number | null;
  service_fee: number | null;
  insurance_fee: number | null;
  label_url: string[] | null;
  commercial_invoice_url: string | null;
};

// ---------- Generic call ----------
async function call<T>(method: "GET" | "POST", path: string, opts: { query?: Record<string, string>; body?: unknown } = {}) {
  const token = process.env.SHIPSAVING_API_TOKEN;
  if (!token) throw new ShipSavingError("ShipSaving API token is missing. Set SHIPSAVING_API_TOKEN.", 500);

  const url = new URL(`${API_BASE}${path}`);
  url.searchParams.set("api_token", token);
  for (const [k, v] of Object.entries(opts.query ?? {})) url.searchParams.set(k, v);

  const res = await fetch(url, {
    method,
    headers: opts.body ? { "Content-Type": "application/json" } : undefined,
    body: opts.body ? JSON.stringify(opts.body) : undefined,
    cache: "no-store",
  });

  const json = await res.json().catch(() => null);
  if (res.ok) return json as T;

  // Errors come back as { "message": "..." }.
  const message: string | undefined = json?.message ?? json?.msg ?? json?.error;
  if (res.status === 401) throw new ShipSavingError("ShipSaving rejected the API token. Check SHIPSAVING_API_TOKEN.", 502, json);
  if (res.status === 429) throw new ShipSavingError("ShipSaving is rate-limiting requests. Wait a moment and try again.", 429, json);
  throw new ShipSavingError(message || `ShipSaving request failed (HTTP ${res.status}).`, res.status < 500 ? 400 : 502, json);
}

// The spec documents `{ rates: [...] }` for rates and an object for labels, but the
// official Postman examples read a bare array — accept either.
function unwrapList<T>(json: unknown, key: string): T[] {
  if (Array.isArray(json)) return json as T[];
  const inner = (json as Record<string, unknown> | null)?.[key] ?? (json as Record<string, unknown> | null)?.data;
  if (Array.isArray(inner)) return inner as T[];
  throw new ShipSavingError("ShipSaving returned an unexpected rates response.", 502, json);
}

// ---------- Endpoints ----------
/** The live API rejects quotes without `order.warehouse_name`; the carrier token is optional. */
export async function getRates(req: SSRateRequest): Promise<SSRate[]> {
  const { ship_date, ...rest } = req;
  const carrierToken = process.env.SHIPSAVING_CARRIER_TOKEN;
  const warehouse = process.env.SHIPSAVING_WAREHOUSE_NAME?.trim();
  if (!warehouse) {
    throw new ShipSavingError(
      "ShipSaving needs a warehouse name. Set SHIPSAVING_WAREHOUSE_NAME to a warehouse from your ShipSaving account (Warehouses → Name).",
      500,
    );
  }
  const body = {
    ...rest,
    ...(carrierToken ? { carrier: { carrier_token: carrierToken } } : {}),
    order: { warehouse_name: warehouse },
    options: { label_type: process.env.SHIPSAVING_LABEL_TYPE === "png" ? "png" : "pdf", ...(ship_date ? { ship_date } : {}) },
  };
  return unwrapList<SSRate>(await call("POST", "/api/rates/list", { body }), "rates");
}

export async function buyLabel(rateId: string): Promise<SSLabel> {
  const json = await call<SSLabel | SSLabel[]>("GET", "/api/rates/buy", { query: { rate_id: rateId } });
  const label = Array.isArray(json) ? json[0] : json;
  if (!label || typeof label !== "object") throw new ShipSavingError("ShipSaving returned an empty label response.", 502, json);
  return label;
}

export function getBalance() {
  return call<{ balance: string; currency: string }>("GET", "/api/balance");
}
