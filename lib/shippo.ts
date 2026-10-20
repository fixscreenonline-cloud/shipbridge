import "server-only";

// Shippo REST API: https://docs.goshippo.com/
// Auth is an API key in the header `Authorization: ShippoToken <key>`.
// Test keys (shippo_test_…) are free and return sample labels; live keys (shippo_live_…) buy real labels.
const API_BASE = (process.env.SHIPPO_API_BASE || "https://api.goshippo.com").replace(/\/$/, "");

export class CarrierApiError extends Error {
  constructor(message: string, public status = 502, public details?: unknown) {
    super(message);
  }
}

// ---------- Request / response types (subset of the Shippo API) ----------
export type ShippoAddress = {
  name: string;
  company?: string;
  street1: string;
  street2?: string;
  city: string;
  state: string;
  zip: string;
  country: string;
  phone?: string;
  email?: string;
};

export type ShippoParcel = {
  length: string;
  width: string;
  height: string;
  distance_unit: "in" | "cm";
  weight: string;
  mass_unit: "lb" | "oz";
};

type ShippoMessage = { source?: string; code?: string; text?: string };

export type ShippoRate = {
  object_id: string;
  amount: string;
  currency: string;
  provider: string;
  servicelevel: { name?: string; token?: string };
  estimated_days: number | null;
  duration_terms?: string | null;
  attributes?: string[];
};

export type ShippoShipment = {
  object_id: string;
  status: string;
  rates: ShippoRate[];
  messages?: ShippoMessage[];
};

export type ShippoTransaction = {
  object_id: string;
  status: "SUCCESS" | "ERROR" | "QUEUED" | "WAITING" | string;
  rate: string;
  tracking_number: string | null;
  tracking_url_provider: string | null;
  label_url: string | null;
  commercial_invoice_url: string | null;
  eta: string | null;
  messages?: ShippoMessage[];
  test?: boolean;
};

// ---------- Generic call ----------
/** Shippo errors come as { detail: "..." } or { field: ["msg", ...] } (possibly nested). */
function errorText(json: unknown): string | undefined {
  if (!json || typeof json !== "object") return undefined;
  const o = json as Record<string, unknown>;
  if (typeof o.detail === "string") return o.detail;
  const parts: string[] = [];
  const walk = (v: unknown, key: string) => {
    if (typeof v === "string") parts.push(key && key !== "__all__" && key !== "non_field_errors" ? `${key}: ${v}` : v);
    else if (Array.isArray(v)) v.forEach((x) => walk(x, key));
    else if (v && typeof v === "object") for (const [k, x] of Object.entries(v)) walk(x, k);
  };
  walk(json, "");
  return parts.slice(0, 3).join("; ") || undefined;
}

async function call<T>(method: "GET" | "POST", path: string, body?: unknown): Promise<T> {
  const token = process.env.SHIPPO_API_TOKEN;
  if (!token) throw new CarrierApiError("Shippo API key is missing. Set SHIPPO_API_TOKEN.", 500);

  const res = await fetch(`${API_BASE}${path}`, {
    method,
    headers: {
      Authorization: `ShippoToken ${token}`,
      ...(body ? { "Content-Type": "application/json" } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
    cache: "no-store",
    // Don't hang forever on a stuck connection.
    signal: AbortSignal.timeout(20_000),
  });

  const json = await res.json().catch(() => null);
  if (res.ok) return json as T;

  const message = errorText(json);
  if (res.status === 401) throw new CarrierApiError(`Shippo rejected the API key: ${message || "check SHIPPO_API_TOKEN"}.`, 502, json);
  if (res.status === 429) throw new CarrierApiError("Shippo is rate-limiting requests. Wait a moment and try again.", 429, json);
  throw new CarrierApiError(message || `Shippo request failed (HTTP ${res.status}).`, res.status < 500 ? 400 : 502, json);
}

const messagesText = (m?: ShippoMessage[]) =>
  (m ?? [])
    .map((x) => x.text)
    .filter(Boolean)
    .join(" ");

// ---------- Endpoints ----------
/** Creates a shipment and returns it with its rates (synchronously). */
export function createShipment(input: {
  address_from: ShippoAddress;
  address_to: ShippoAddress;
  parcels: ShippoParcel[];
  shipment_date?: string;
}) {
  return call<ShippoShipment>("POST", "/shipments/", { ...input, async: false });
}

/** Buys the label for a rate. Throws with Shippo's reason if the purchase didn't succeed. */
export async function buyLabel(rateId: string): Promise<ShippoTransaction> {
  const tx = await call<ShippoTransaction>("POST", "/transactions/", {
    rate: rateId,
    label_file_type: process.env.SHIPPO_LABEL_FILE_TYPE || "PDF_4x6",
    async: false,
  });
  if (tx.status !== "SUCCESS") {
    const reason = messagesText(tx.messages) || `Label status: ${tx.status}`;
    throw new CarrierApiError(`Shippo couldn't create the label. ${reason}`, 400, tx);
  }
  return tx;
}

/** Fetches a transaction again; its label_url is a signed link that expires, so get a fresh one. */
export function getTransaction(id: string) {
  return call<ShippoTransaction>("GET", `/transactions/${encodeURIComponent(id)}`);
}
