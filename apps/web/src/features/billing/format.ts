import type { BillingCurrency, BillingInterval, PlanId, PlanTierOut } from "./api";

const PLAN_RANK: Record<PlanId, number> = { free: 0, solo: 1, team: 2, enterprise: 3 };

export function isUpgrade(from: PlanId, to: PlanId): boolean {
  return PLAN_RANK[to] > PLAN_RANK[from];
}

/** "$24", "₹1,899", or "$4.50" when the amount has cents. */
export function formatMoney(amount: number, currency: BillingCurrency): string {
  return new Intl.NumberFormat(currency === "inr" ? "en-IN" : "en-US", {
    style: "currency",
    currency: currency.toUpperCase(),
    minimumFractionDigits: Number.isInteger(amount) ? 0 : 2,
    maximumFractionDigits: 2,
  }).format(amount);
}

export function formatDate(value: string): string {
  return new Date(value).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
}

/** Price per month shown on a card: the annual plan is quoted as its monthly rate. */
export function monthlyRate(plan: PlanTierOut, interval: BillingInterval, currency: BillingCurrency): number {
  return plan[`price_${interval}_${currency}` as const];
}

/** What one checkout charges: a month, or twelve months at the annual rate. */
export function periodTotal(plan: PlanTierOut, interval: BillingInterval, currency: BillingCurrency): number {
  return monthlyRate(plan, interval, currency) * (interval === "annual" ? 12 : 1);
}

export function limitLabel(limit: number | null): string {
  return limit === null ? "Unlimited" : limit.toLocaleString();
}
