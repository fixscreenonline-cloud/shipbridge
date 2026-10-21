export type Address = {
  first_name: string;
  last_name: string;
  company_name?: string;
  phone: string;
  email?: string;
  street: string;
  street2?: string;
  city: string;
  state: string;
  zip_code: string;
  country: string;
};

export type DimensionUnit = "in" | "cm";
export type WeightUnit = "oz" | "lb";

export type PackageInput = {
  length: number;
  width: number;
  height: number;
  dimension_unit: DimensionUnit;
  weight: number;
  weight_unit: WeightUnit;
};

export type MarginSettings = {
  /** Percentage added on top of the carrier (Shippo) price, e.g. 15 = +15% */
  percent: number;
  /** Fixed amount added per label, in USD */
  flatFee: number;
  updatedAt: string | null;
};

/** A rate as shown to the customer. Never includes your cost. */
export type PublicRate = {
  rateId: string;
  carrierCode: string;
  serviceName: string;
  serviceLevel: string;
  deliveryDays: string | null;
  price: number;
  currency: string;
};

/** Server-side record of a quoted rate: what it costs you and what you charge. */
export type Quote = PublicRate & {
  /** The draft (form inputs) this quote was fetched for. */
  draftId?: string;
  /** Who fetched it: a customer user id, or "admin". Missing on older records (= admin). */
  ownerId?: string;
  cost: number;
  recipient: string;
  marginPercent: number;
  flatFee: number;
  createdAt: string;
  usedAt: string | null;
};

export type ShipmentRecord = {
  id: string;
  /** Who bought it: a customer user id, or "admin". Missing on older records (= admin). */
  ownerId?: string;
  /** Customer's display name at the time of booking (for admin lists). */
  ownerName?: string;
  createdAt: string;
  rateId: string;
  shipmentNo: string;
  trackingNo: string | null;
  carrierCode: string;
  serviceName: string;
  recipient: string;
  cost: number;
  charged: number;
  profit: number;
  marginPercent: number;
  currency: string;
  labelUrls: string[];
  /** Full booking details, saved at purchase. Missing on older records. */
  details?: ShipmentDetails;
  /** The form inputs used to quote this label, so it can be re-quoted. Missing on older records. */
  request?: ShipmentRequest;
};

export type ShipmentParty = {
  name: string;
  company: string;
  phone: string;
  street: string;
  street2: string;
  city: string;
  state: string;
  zip: string;
  country: string;
};

export type ShipmentDetails = {
  from: ShipmentParty | null;
  to: ShipmentParty | null;
  /** Units default to in / lb on records saved before units were stored. */
  parcel: {
    length: number;
    width: number;
    height: number;
    weight: number;
    distanceUnit?: DimensionUnit;
    massUnit?: WeightUnit;
  } | null;
  carrier: string;
  service: string;
  deliveryDays: string | null;
  /** Carrier tracking page, when the carrier provides one. */
  trackingUrl?: string | null;
  /** Cost breakdown as charged by the shipping provider. */
  labelRate: number | null;
  serviceFee: number;
  insuranceFee: number;
  /** Carrier's list price before discount, when known. */
  publishedRate: number | null;
  /** What the quote said the label would cost, before fees. */
  quotedCost: number;
  flatFee: number;
  labelStatus: string | null;
};

/** What the shipment form sends to get rates. */
export type ShipmentRequest = {
  from: Address;
  to: Address;
  package: PackageInput;
  shipDate?: string;
};

/**
 * A price check, kept for 24 hours after it was last quoted so it can be reused.
 * Re-quoting the same addresses and parcel updates the same draft (the id is a hash of them).
 */
export type Draft = ShipmentRequest & {
  id: string;
  /** Who made the price check: a customer user id, or "admin". Missing on older records (= admin). */
  ownerId?: string;
  createdAt: string;
  updatedAt: string;
  rateCount: number;
  lowestPrice: number | null;
  /** Why some carriers didn't quote (from Shippo). Shown to the admin only. */
  carrierNotes?: { carrier: string; message: string }[];
  currency: string;
};

/** Owner id used for the operator's own bookings (and records from before customer accounts). */
export const ADMIN_OWNER = "admin";
export const ownerOf = (r: { ownerId?: string }) => r.ownerId ?? ADMIN_OWNER;

/** What the admin sets for each customer. */
export type CustomerSettings = {
  /** Your fee on top of the customer's Shippo price: percent + flat amount per label. */
  feePercent: number;
  feeFlat: number;
  /** Business "Ship from" address, offered on the booking form. */
  defaultSender: Address | null;
  /** Optional caps per calendar month (null = no limit). Spend = what the customer pays incl. your fee. */
  monthlyLabelLimit: number | null;
  monthlySpendLimit: number | null;
  /** Carriers they may use, e.g. ["USPS"]; empty = all carriers on their Shippo account. */
  allowedCarriers: string[];
  /** Shippo label format, e.g. "PDF_4x6". */
  labelFileType: string;
  /** Photo/paste address scanning (needs ANTHROPIC_API_KEY on the server). */
  scanEnabled: boolean;
};

/** A customer account (a business you give access to). */
export type CustomerUser = {
  id: string;
  username: string;
  usernameLower: string;
  passwordHash: string;
  name: string;
  company: string;
  email: string;
  active: boolean;
  createdAt: string;
  updatedAt: string;
  settings: CustomerSettings;
  /** The customer's own Shippo key, stored encrypted; only the last 4 characters are ever shown. */
  shippo: { tokenEnc: string | null; last4: string | null; mode: "test" | "live" | null; updatedAt: string | null };
};

/** A customer as shown in the admin UI (no password hash, no key). */
export type CustomerView = Omit<CustomerUser, "passwordHash" | "shippo" | "usernameLower"> & {
  shippo: { connected: boolean; last4: string | null; mode: "test" | "live" | null; updatedAt: string | null };
};

export const toCustomerView = (u: CustomerUser): CustomerView => {
  const { passwordHash, shippo, usernameLower, ...rest } = u;
  return { ...rest, shippo: { connected: !!shippo.tokenEnc, last4: shippo.last4, mode: shippo.mode, updatedAt: shippo.updatedAt } };
};

export const defaultCustomerSettings = (): CustomerSettings => ({
  feePercent: 0,
  feeFlat: 0,
  defaultSender: null,
  monthlyLabelLimit: null,
  monthlySpendLimit: null,
  allowedCarriers: [],
  labelFileType: "PDF_4x6",
  scanEnabled: true,
});
