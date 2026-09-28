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
  /** Percentage added on top of the ShipSaving price, e.g. 15 = +15% */
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
  cost: number;
  recipient: string;
  marginPercent: number;
  flatFee: number;
  createdAt: string;
  usedAt: string | null;
};

export type ShipmentRecord = {
  id: string;
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
  /** Full booking details from ShipSaving's purchase response. Missing on older records. */
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
  /** Inches and pounds. */
  parcel: { length: number; width: number; height: number; weight: number } | null;
  carrier: string;
  service: string;
  deliveryDays: string | null;
  /** Cost breakdown as charged by ShipSaving. */
  labelRate: number | null;
  serviceFee: number;
  insuranceFee: number;
  /** Carrier's list price before ShipSaving's discount. */
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
  createdAt: string;
  updatedAt: string;
  rateCount: number;
  lowestPrice: number | null;
  currency: string;
};
