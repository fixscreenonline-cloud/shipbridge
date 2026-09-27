import type { MarginSettings } from "./types";

export const round2 = (n: number) => Math.round(n * 100) / 100;

/**
 * Customer price = cost + percent + flat fee, rounded UP to the next cent
 * so rounding never eats into your margin.
 */
export function applyMargin(cost: number, settings: Pick<MarginSettings, "percent" | "flatFee">): number {
  const raw = cost * (1 + settings.percent / 100) + settings.flatFee;
  return Math.ceil(raw * 100 - 1e-6) / 100;
}

export function formatMoney(amount: number, currency = "USD") {
  return new Intl.NumberFormat("en-US", { style: "currency", currency }).format(amount);
}
