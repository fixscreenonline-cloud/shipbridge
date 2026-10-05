import { z } from "zod";
import { US_STATE_CODES } from "./us-states";

// Optional text: "", null and missing all mean "not given" (saved drafts can hold nulls).
const optionalText = z
  .string()
  .trim()
  .nullish()
  .transform((v) => (v ? v : undefined));

const required = (label: string) => z.string().trim().min(1, `${label} is required`);

export const AddressSchema = z.object({
  first_name: required("First name"),
  last_name: required("Last name"),
  company_name: optionalText,
  phone: required("Phone").regex(/^[0-9+()\-\s]{7,20}$/, "Enter a valid phone number"),
  email: optionalText.pipe(z.string().email("Enter a valid email").optional()),
  street: required("Street"),
  street2: optionalText,
  city: required("City"),
  state: z.enum(US_STATE_CODES, { errorMap: () => ({ message: "Choose a US state" }) }),
  zip_code: required("ZIP code").regex(/^\d{5}(-\d{4})?$/, "Enter a 5-digit ZIP code"),
  // US domestic only.
  country: z.literal("US", { errorMap: () => ({ message: "Only US addresses are supported" }) }),
});

const positive = (label: string) =>
  z.coerce.number({ invalid_type_error: `${label} must be a number` }).positive(`${label} must be more than 0`);

export const PackageSchema = z.object({
  length: positive("Length"),
  width: positive("Width"),
  height: positive("Height"),
  dimension_unit: z.enum(["in", "cm"]),
  weight: positive("Weight"),
  weight_unit: z.enum(["oz", "lb"]),
});

export const RateRequestSchema = z.object({
  from: AddressSchema,
  to: AddressSchema,
  package: PackageSchema,
  // "", null and missing all mean "no ship date".
  shipDate: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "Use a date like 2026-10-05")
    .nullish()
    .or(z.literal(""))
    .transform((v) => v || undefined),
});

export const BuyRequestSchema = z.object({
  rateId: z.string().trim().min(1),
});

export const SettingsSchema = z.object({
  percent: z.coerce.number().min(0, "Margin can't be negative").max(500, "Margin can't exceed 500%"),
  flatFee: z.coerce.number().min(0, "Flat fee can't be negative").max(100, "Flat fee can't exceed $100"),
});
