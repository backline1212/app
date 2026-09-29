"""Pydantic contracts for plans, checkout, subscriptions and invoices."""

from datetime import datetime
from typing import Literal

from pydantic import BaseModel, Field

from app.modules.billing.plans import BillingCurrency, BillingInterval, PaidPlanId, PlanId

# The gateway a member picks in the checkout dialog.
CheckoutProvider = Literal["stripe", "razorpay"]
# What actually processed a payment: the picked gateway, or the test sandbox when that
# gateway has no keys on this server and the sandbox is allowed (docs/tdr/0051).
PaymentProvider = Literal["stripe", "razorpay", "sandbox"]
# "expired": a paid period ended without a renewal, so the workspace is on Free now.
SubscriptionStatus = Literal["active", "expired"]


class PlanFeatureOut(BaseModel):
    label: str
    coming_soon: bool = False


class PlanTierOut(BaseModel):
    id: PlanId
    name: str
    badge: str
    description: str
    popular: bool
    price_monthly_usd: int
    price_annual_usd: int
    price_monthly_inr: int
    price_annual_inr: int
    # None means unlimited.
    project_limit: int | None
    member_limit: int | None
    ai_credits_monthly: int
    storage_gb: int
    features: list[PlanFeatureOut]


class ComparisonRowOut(BaseModel):
    name: str
    free: str
    solo: str
    team: str
    enterprise: str


class ComparisonCategoryOut(BaseModel):
    category: str
    rows: list[ComparisonRowOut]


class PaymentOptionsOut(BaseModel):
    """Which checkout choices work on this server. A gateway without keys is still
    offered while the sandbox is allowed; it then completes as a test payment."""

    stripe_live: bool
    razorpay_live: bool
    sandbox: bool


class PlansResponseOut(BaseModel):
    plans: list[PlanTierOut]
    categories: list[ComparisonCategoryOut]
    payment_options: PaymentOptionsOut


class UsageMetricsOut(BaseModel):
    projects_used: int
    projects_limit: int | None
    members_used: int
    members_limit: int | None
    ai_credits_used: int
    ai_credits_limit: int
    # AI credits are counted per calendar month (UTC) and reset at this instant.
    ai_credits_reset_at: datetime
    storage_gb_limit: int


class SubscriptionOut(BaseModel):
    workspace_id: str
    plan_id: PlanId
    plan_name: str
    status: SubscriptionStatus
    interval: BillingInterval | None = None
    currency: BillingCurrency | None = None
    # Price of one period of the current plan, in whole currency units.
    amount: int = 0
    provider: PaymentProvider | None = None
    current_period_start: datetime | None = None
    current_period_end: datetime | None = None
    # Set when a paid period ran out without a renewal; the workspace is on Free now.
    expired_plan_id: PaidPlanId | None = None
    expired_plan_name: str | None = None
    usage: UsageMetricsOut
    is_owner: bool
    stripe_portal_available: bool = False


class CheckoutRequest(BaseModel):
    plan_id: PaidPlanId
    interval: BillingInterval = "monthly"
    currency: BillingCurrency = "usd"
    provider: CheckoutProvider = "stripe"


class CheckoutResponse(BaseModel):
    checkout_id: str
    provider: PaymentProvider
    plan_id: PaidPlanId
    plan_name: str
    interval: BillingInterval
    currency: BillingCurrency
    # Whole currency units, and the gateway's smallest unit (cents/paise).
    amount: int
    amount_minor: int
    # Stripe: hosted checkout page to redirect to.
    checkout_url: str | None = None
    # Razorpay: what Razorpay Checkout needs to open its payment sheet.
    razorpay_order_id: str | None = None
    razorpay_key_id: str | None = None


class VerifyPaymentRequest(BaseModel):
    checkout_id: str = Field(min_length=1, max_length=64)
    # Razorpay Checkout's success handler returns these two.
    razorpay_payment_id: str | None = Field(default=None, max_length=128)
    razorpay_signature: str | None = Field(default=None, max_length=256)


class InvoiceOut(BaseModel):
    id: str
    invoice_number: str
    amount_paid: float
    currency: BillingCurrency
    status: Literal["paid"]
    provider: PaymentProvider
    provider_payment_id: str | None = None
    plan_name: str
    interval: BillingInterval
    period_start: datetime
    period_end: datetime
    paid_at: datetime
    # Stripe-hosted invoice pages; None for Razorpay and test payments.
    pdf_url: str | None = None
    hosted_invoice_url: str | None = None


class CancelSubscriptionRequest(BaseModel):
    reason: str | None = Field(default=None, max_length=500)


class PortalResponse(BaseModel):
    portal_url: str
