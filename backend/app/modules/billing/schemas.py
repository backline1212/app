"""Pydantic schemas for billing, plans, checkout and subscriptions."""

from datetime import datetime
from typing import Any, Literal

from pydantic import BaseModel, Field

BillingInterval = Literal["monthly", "annual"]
BillingCurrency = Literal["usd", "inr"]
BillingProvider = Literal["stripe", "razorpay", "sandbox", "free"]
SubscriptionStatus = Literal["active", "trialing", "past_due", "canceled", "incomplete"]


class PlanTierOut(BaseModel):
    id: str
    name: str
    badge: str
    description: str
    popular: bool = False
    price_monthly_usd: int
    price_annual_usd: int
    price_monthly_inr: int
    price_annual_inr: int
    project_limit: int
    member_limit: int
    guest_limit_label: str
    ai_credits_monthly: int
    storage_gb: int
    integrations_allowed: list[str]
    features: list[str]
    highlights: list[str]


class ComparisonRowOut(BaseModel):
    name: str
    free: str
    solo: str
    team: str
    enterprise: str


class ComparisonCategoryOut(BaseModel):
    category: str
    rows: list[ComparisonRowOut]


class PlansResponseOut(BaseModel):
    plans: list[PlanTierOut]
    categories: list[ComparisonCategoryOut]
    current_plan_id: str
    sandbox_enabled: bool = True
    stripe_configured: bool = False
    razorpay_configured: bool = False


class UsageMetricsOut(BaseModel):
    projects_used: int
    projects_limit: int
    members_used: int
    members_limit: int
    ai_credits_used: int
    ai_credits_limit: int
    storage_gb_used: float = 0.0
    storage_gb_limit: int = 1


class SubscriptionOut(BaseModel):
    workspace_id: str
    plan_id: str
    plan_name: str
    status: SubscriptionStatus = "active"
    interval: BillingInterval = "monthly"
    currency: BillingCurrency = "usd"
    amount: float = 0.0
    provider: str = "free"
    current_period_start: datetime | None = None
    current_period_end: datetime | None = None
    cancel_at_period_end: bool = False
    usage: UsageMetricsOut
    payment_method_summary: str | None = None
    is_owner: bool = True


class CheckoutRequest(BaseModel):
    plan_id: Literal["solo", "team", "enterprise"]
    interval: BillingInterval = "monthly"
    currency: BillingCurrency = "usd"
    provider: Literal["stripe", "razorpay", "sandbox"] = "stripe"
    success_url: str | None = None
    cancel_url: str | None = None


class CheckoutResponse(BaseModel):
    provider: str
    checkout_url: str | None = None
    session_id: str | None = None
    order_id: str | None = None
    key_id: str | None = None
    amount: float
    currency: str
    plan_id: str
    interval: str
    sandbox_mode: bool = False
    simulated_token: str | None = None


class VerifyPaymentRequest(BaseModel):
    plan_id: Literal["solo", "team", "enterprise"]
    interval: BillingInterval = "monthly"
    currency: BillingCurrency = "usd"
    provider: Literal["stripe", "razorpay", "sandbox"] = "sandbox"
    # Razorpay fields
    razorpay_payment_id: str | None = None
    razorpay_order_id: str | None = None
    razorpay_signature: str | None = None
    # Stripe fields
    stripe_session_id: str | None = None
    # Sandbox / simulated fields
    simulated: bool = False
    payment_method: str = "card"  # card, upi, netbanking


class InvoiceOut(BaseModel):
    id: str
    workspace_id: str
    invoice_number: str
    amount_paid: float
    currency: str
    status: str
    provider: str
    plan_name: str
    interval: str
    period_start: datetime
    period_end: datetime
    paid_at: datetime
    pdf_url: str | None = None
    hosted_invoice_url: str | None = None


class BillingEventOut(BaseModel):
    id: str
    workspace_id: str
    event_type: str
    provider: str
    amount: float
    currency: str
    plan_id: str
    interval: str
    metadata: dict[str, Any] = Field(default_factory=dict)
    created_at: datetime


class CancelSubscriptionRequest(BaseModel):
    reason: str | None = None
    feedback: str | None = None


class PortalResponse(BaseModel):
    portal_url: str
