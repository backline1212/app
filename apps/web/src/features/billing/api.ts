import type { Schemas } from "@backline/types";
import { ApiError, apiFetch } from "../../lib/api-client";

export type PlanTierOut = Schemas["PlanTierOut"];
export type ComparisonCategoryOut = Schemas["ComparisonCategoryOut"];
export type PaymentOptionsOut = Schemas["PaymentOptionsOut"];
export type PlansResponseOut = Schemas["PlansResponseOut"];
export type SubscriptionOut = Schemas["SubscriptionOut"];
export type CheckoutRequest = Schemas["CheckoutRequest"];
export type CheckoutResponse = Schemas["CheckoutResponse"];
export type VerifyPaymentRequest = Schemas["VerifyPaymentRequest"];
export type InvoiceOut = Schemas["InvoiceOut"];
export type PortalResponse = Schemas["PortalResponse"];

export type PlanId = PlanTierOut["id"];
export type PaidPlanId = CheckoutRequest["plan_id"];
export type BillingInterval = CheckoutRequest["interval"];
export type BillingCurrency = CheckoutRequest["currency"];
export type CheckoutProvider = CheckoutRequest["provider"];

export const PAID_PLAN_IDS: readonly PaidPlanId[] = ["solo", "team", "enterprise"];

export function isPaidPlanId(value: string | null | undefined): value is PaidPlanId {
  return PAID_PLAN_IDS.includes(value as PaidPlanId);
}

const base = (workspaceId: string) => `/api/v1/workspaces/${workspaceId}/billing`;

export function getBillingPlans(workspaceId: string): Promise<PlansResponseOut> {
  return apiFetch<PlansResponseOut>(`${base(workspaceId)}/plans`);
}

export function getSubscription(workspaceId: string): Promise<SubscriptionOut> {
  return apiFetch<SubscriptionOut>(`${base(workspaceId)}/subscription`);
}

export function createCheckout(workspaceId: string, payload: CheckoutRequest): Promise<CheckoutResponse> {
  return apiFetch<CheckoutResponse>(`${base(workspaceId)}/checkout`, {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export function verifyPayment(workspaceId: string, payload: VerifyPaymentRequest): Promise<SubscriptionOut> {
  return apiFetch<SubscriptionOut>(`${base(workspaceId)}/verify-payment`, {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export function cancelSubscription(workspaceId: string): Promise<SubscriptionOut> {
  return apiFetch<SubscriptionOut>(`${base(workspaceId)}/cancel`, { method: "POST", body: "{}" });
}

export function createPortalSession(workspaceId: string): Promise<PortalResponse> {
  return apiFetch<PortalResponse>(`${base(workspaceId)}/portal`, { method: "POST" });
}

export function listInvoices(workspaceId: string): Promise<InvoiceOut[]> {
  return apiFetch<InvoiceOut[]>(`${base(workspaceId)}/invoices`);
}

/** A 402 from a project/member/AI action: which plan the upgrade prompt should open. */
export function planLimitUpgrade(error: unknown): PaidPlanId | null {
  if (!(error instanceof ApiError) || error.code !== "PLAN_LIMIT_EXCEEDED") return null;
  const next = error.details.upgrade_plan_id;
  return typeof next === "string" && isPaidPlanId(next) ? next : "solo";
}
