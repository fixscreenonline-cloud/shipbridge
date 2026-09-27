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
};
