import type { Schemas } from "@backline/types";
import { apiFetch } from "../../lib/api-client";

export type PlanTierOut = Schemas["PlanTierOut"];
export type ComparisonRowOut = Schemas["ComparisonRowOut"];
export type ComparisonCategoryOut = Schemas["ComparisonCategoryOut"];
export type PlansResponseOut = Schemas["PlansResponseOut"];
export type SubscriptionOut = Schemas["SubscriptionOut"];
export type CheckoutRequest = Schemas["CheckoutRequest"];
export type CheckoutResponse = Schemas["CheckoutResponse"];
export type VerifyPaymentRequest = Schemas["VerifyPaymentRequest"];
export type InvoiceOut = Schemas["InvoiceOut"];
export type PortalResponse = Schemas["PortalResponse"];
export type CancelSubscriptionRequest = Schemas["CancelSubscriptionRequest"];

export function getBillingPlans(workspaceId: string): Promise<PlansResponseOut> {
  return apiFetch<PlansResponseOut>(`/api/v1/workspaces/${workspaceId}/billing/plans`);
}

export function getSubscription(workspaceId: string): Promise<SubscriptionOut> {
  return apiFetch<SubscriptionOut>(`/api/v1/workspaces/${workspaceId}/billing/subscription`);
}

export function createCheckout(
  workspaceId: string,
  payload: CheckoutRequest,
): Promise<CheckoutResponse> {
  return apiFetch<CheckoutResponse>(`/api/v1/workspaces/${workspaceId}/billing/checkout`, {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export function verifyPayment(
  workspaceId: string,
  payload: VerifyPaymentRequest,
): Promise<SubscriptionOut> {
  return apiFetch<SubscriptionOut>(`/api/v1/workspaces/${workspaceId}/billing/verify-payment`, {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export function cancelSubscription(
  workspaceId: string,
  payload?: CancelSubscriptionRequest,
): Promise<SubscriptionOut> {
  return apiFetch<SubscriptionOut>(`/api/v1/workspaces/${workspaceId}/billing/cancel`, {
    method: "POST",
    body: JSON.stringify(payload || {}),
  });
}

export function createPortalSession(workspaceId: string): Promise<PortalResponse> {
  return apiFetch<PortalResponse>(`/api/v1/workspaces/${workspaceId}/billing/portal`, {
    method: "POST",
  });
}

export function listInvoices(workspaceId: string): Promise<InvoiceOut[]> {
  return apiFetch<InvoiceOut[]>(`/api/v1/workspaces/${workspaceId}/billing/invoices`);
}
