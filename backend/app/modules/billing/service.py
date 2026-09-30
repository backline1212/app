"""Billing: plans, prepaid checkout through Stripe, Razorpay/UPI or the test sandbox,
payment confirmation, signed webhooks, invoices and downgrades (docs/tdr/0052).

Every paid plan is prepaid for one period (30 or 365 days) and lapses to Free when that
period ends unless it is renewed. A checkout document records what is being bought
before the customer pays; confirmation - from the browser or a gateway webhook, in
either order - only ever activates what that document says, exactly once.
"""

import asyncio
import hashlib
import hmac
import json
import logging
import time
from datetime import UTC, datetime, timedelta
from typing import Any

import httpx
from bson import ObjectId
from motor.motor_asyncio import AsyncIOMotorClientSession, AsyncIOMotorDatabase

from app.core.config import Settings, get_settings
from app.core.errors import (
    AuthenticationError,
    ExternalServiceError,
    NotFoundError,
    ValidationError,
)
from app.core.events import ActorType, append_event
from app.modules.auth.repository import UserRepository
from app.modules.billing.limits import ai_credit_window, count_usage
from app.modules.billing.plans import (
    COMPARISON_CATEGORIES,
    FREE_PLAN_ID,
    PLANS,
    effective_plan_id,
    get_plan_definition,
    plan_price,
)
from app.modules.billing.repository import BillingRepository
from app.modules.billing.schemas import (
    AiUsageActionOut,
    AiUsageMemberOut,
    AiUsageOut,
    AiUsagePointOut,
    CheckoutRequest,
    CheckoutResponse,
    ComparisonCategoryOut,
    InvoiceOut,
    PaymentOptionsOut,
    PlansResponseOut,
    PlanTierOut,
    PortalResponse,
    SubscriptionOut,
    UsageMetricsOut,
    VerifyPaymentRequest,
)

logger = logging.getLogger("backline.billing")

STRIPE_API = "https://api.stripe.com/v1"
RAZORPAY_API = "https://api.razorpay.com/v1"
# Stripe's own recommended replay window for signed webhook timestamps.
STRIPE_SIGNATURE_TOLERANCE_SECONDS = 300
PERIOD_LENGTH = {"monthly": timedelta(days=30), "annual": timedelta(days=365)}
PLAN_CHANGED = "workspace.plan_changed"

_GATEWAY_TIMEOUT = httpx.Timeout(15.0)
_PROVIDER_LABEL = {"stripe": "Stripe", "razorpay": "Razorpay"}
_PAYMENT_PROVIDERS = frozenset({"stripe", "razorpay", "sandbox"})


# -- configuration --------------------------------------------------------------------


def sandbox_allowed(settings: Settings) -> bool:
    """A sandbox payment activates a paid plan without taking money, so it is refused
    in production no matter what BILLING_SANDBOX_ENABLED says."""
    return settings.billing_sandbox_enabled and settings.environment != "production"


def stripe_live(settings: Settings) -> bool:
    return bool(settings.stripe_secret_key)


def razorpay_live(settings: Settings) -> bool:
    return bool(settings.razorpay_key_id and settings.razorpay_key_secret)


def _stripe_key_mode(settings: Settings) -> str:
    return "live" if "_live_" in settings.stripe_secret_key else "test"


def _stripe_customer(settings: Settings, workspace: dict[str, Any]) -> str | None:
    """The workspace's Stripe customer, if it is usable with the configured key.
    Customers made with test keys don't exist for live keys (and vice versa), so one
    stored under the other key mode is ignored rather than failing the checkout."""
    customer_id = workspace.get("stripe_customer_id")
    if not stripe_live(settings) or not customer_id:
        return None
    if workspace.get("stripe_customer_mode") != _stripe_key_mode(settings):
        return None
    return str(customer_id)


# -- plans and subscription ----------------------------------------------------------


def get_available_plans() -> PlansResponseOut:
    settings = get_settings()
    return PlansResponseOut(
        plans=[PlanTierOut.model_validate(plan) for plan in PLANS.values()],
        categories=[ComparisonCategoryOut.model_validate(c) for c in COMPARISON_CATEGORIES],
        payment_options=PaymentOptionsOut(
            stripe_live=stripe_live(settings),
            razorpay_live=razorpay_live(settings),
            sandbox=sandbox_allowed(settings),
        ),
    )


async def get_workspace_subscription(
    db: AsyncIOMotorDatabase[dict[str, Any]], workspace_id: str, *, is_owner: bool
) -> SubscriptionOut:
    settings = get_settings()
    workspace = await BillingRepository(db).find_workspace(workspace_id)
    if workspace is None:
        raise NotFoundError("Workspace not found.")

    now = datetime.now(UTC)
    plan_id = effective_plan_id(workspace, now)
    plan = get_plan_definition(plan_id)
    stored_plan_id = str(workspace.get("plan") or FREE_PLAN_ID)
    expired = plan_id == FREE_PLAN_ID and stored_plan_id != FREE_PLAN_ID and stored_plan_id in PLANS
    paid = plan_id != FREE_PLAN_ID

    projects, members, ai_credits = await asyncio.gather(
        count_usage(db, workspace_id, "projects"),
        count_usage(db, workspace_id, "members"),
        count_usage(db, workspace_id, "ai_credits"),
    )
    usage = UsageMetricsOut(
        projects_used=projects,
        projects_limit=plan["project_limit"],
        members_used=members,
        members_limit=plan["member_limit"],
        ai_credits_used=ai_credits,
        ai_credits_limit=plan["ai_credits_monthly"],
        ai_credits_reset_at=ai_credit_window(now)[1],
        storage_gb_limit=plan["storage_gb"],
    )

    interval = workspace.get("billing_interval")
    currency = workspace.get("billing_currency")
    provider = workspace.get("billing_provider")
    if not (paid and interval in PERIOD_LENGTH and currency in ("usd", "inr")):
        interval = currency = None
    return SubscriptionOut(
        workspace_id=workspace_id,
        plan_id=plan_id,  # type: ignore[arg-type]
        plan_name=plan["name"],
        status="expired" if expired else "active",
        interval=interval,
        currency=currency,
        amount=plan_price(plan_id, interval, currency) if interval and currency else 0,
        provider=provider if paid and provider in _PAYMENT_PROVIDERS else None,
        current_period_start=workspace.get("current_period_start") if paid else None,
        current_period_end=workspace.get("current_period_end") if paid or expired else None,
        expired_plan_id=stored_plan_id if expired else None,  # type: ignore[arg-type]
        expired_plan_name=get_plan_definition(stored_plan_id)["name"] if expired else None,
        usage=usage,
        is_owner=is_owner,
        stripe_portal_available=_stripe_customer(settings, workspace) is not None,
    )


# -- AI usage -------------------------------------------------------------------------

_AI_ACTIONS = ("summarize", "suggest_reply", "analyze_project")
_USAGE_TREND_MONTHS = 6


def _month_start(value: datetime, months_back: int) -> datetime:
    year, month = value.year, value.month - months_back
    while month < 1:
        year, month = year - 1, month + 12
    return value.replace(year=year, month=month, day=1, hour=0, minute=0, second=0, microsecond=0)


async def get_ai_usage(db: AsyncIOMotorDatabase[dict[str, Any]], workspace_id: str) -> AiUsageOut:
    """Where this month's AI credits went, from the same ledger the plan limit counts
    (billing/limits.py), so the page and the limit can never disagree."""
    repo = BillingRepository(db)
    workspace = await repo.find_workspace(workspace_id)
    if workspace is None:
        raise NotFoundError("Workspace not found.")

    now = datetime.now(UTC)
    plan = get_plan_definition(effective_plan_id(workspace, now))
    period_start, resets_at = ai_credit_window(now)
    trend_start = _month_start(now, _USAGE_TREND_MONTHS - 1)
    breakdown, by_month = await asyncio.gather(
        repo.ai_usage_breakdown(workspace_id, period_start=period_start),
        repo.ai_usage_by_month(workspace_id, since=trend_start),
    )

    action_counts = {row["_id"]: row["count"] for row in breakdown["by_action"]}
    member_rows = sorted(breakdown["by_member"], key=lambda row: -row["count"])
    member_ids = [row["_id"] for row in member_rows if row["_id"]]
    users = await UserRepository(db).find_many_by_ids(member_ids)
    day_counts = {row["_id"]: row["count"] for row in breakdown["by_day"]}
    days = [period_start.replace(day=day).strftime("%Y-%m-%d") for day in range(1, now.day + 1)]
    months = [
        _month_start(now, back).strftime("%Y-%m") for back in range(_USAGE_TREND_MONTHS - 1, -1, -1)
    ]

    def member_name(user_id: str | None) -> str:
        if user_id is None:
            return "Before per-member tracking"
        return str(users[user_id]["name"]) if user_id in users else "Former member"

    return AiUsageOut(
        plan_id=plan["id"],
        plan_name=plan["name"],
        used=sum(action_counts.values()),
        limit=plan["ai_credits_monthly"],
        period_start=period_start,
        resets_at=resets_at,
        ai_enabled=bool(get_settings().groq_api_keys),
        by_action=[
            AiUsageActionOut(action=action, count=action_counts.get(action, 0))  # type: ignore[arg-type]
            for action in _AI_ACTIONS
        ],
        by_member=[
            AiUsageMemberOut(user_id=row["_id"], name=member_name(row["_id"]), count=row["count"])
            for row in member_rows
        ],
        daily=[AiUsagePointOut(period=day, count=day_counts.get(day, 0)) for day in days],
        monthly=[AiUsagePointOut(period=month, count=by_month.get(month, 0)) for month in months],
    )


# -- checkout -------------------------------------------------------------------------


async def create_checkout_session(
    db: AsyncIOMotorDatabase[dict[str, Any]],
    *,
    workspace_id: str,
    user_id: str,
    request: CheckoutRequest,
) -> CheckoutResponse:
    settings = get_settings()
    repo = BillingRepository(db)
    workspace = await repo.find_workspace(workspace_id)
    if workspace is None:
        raise NotFoundError("Workspace not found.")
    if request.provider == "razorpay" and request.currency != "inr":
        raise ValidationError("Razorpay and UPI payments are charged in INR. Switch to ₹ INR.")

    live = stripe_live(settings) if request.provider == "stripe" else razorpay_live(settings)
    if not live and not sandbox_allowed(settings):
        raise ValidationError(
            f"{_PROVIDER_LABEL[request.provider]} payments aren't set up on this server yet."
        )

    plan = get_plan_definition(request.plan_id)
    amount = plan_price(request.plan_id, request.interval, request.currency)
    amount_minor = amount * 100
    checkout_id = ObjectId()
    gateway_fields: dict[str, Any] = {}

    if not live:
        provider, reference = "sandbox", f"sandbox_{checkout_id}"
    elif request.provider == "stripe":
        session = await _create_stripe_session(
            db,
            settings,
            workspace,
            checkout_id=checkout_id,
            user_id=user_id,
            request=request,
            plan_name=plan["name"],
            description=plan["description"],
            amount_minor=amount_minor,
        )
        provider, reference = "stripe", str(session["id"])
        gateway_fields["checkout_url"] = session.get("url")
    else:
        order = await _razorpay_request(
            settings,
            "POST",
            "/orders",
            body={
                "amount": amount_minor,
                "currency": "INR",
                "receipt": str(checkout_id),
                "notes": {
                    "workspace_id": workspace_id,
                    "checkout_id": str(checkout_id),
                    "plan_id": request.plan_id,
                    "interval": request.interval,
                },
            },
        )
        provider, reference = "razorpay", str(order["id"])
        gateway_fields["razorpay_order_id"] = reference
        gateway_fields["razorpay_key_id"] = settings.razorpay_key_id

    await repo.create_checkout(
        checkout_id=checkout_id,
        workspace_id=workspace_id,
        user_id=user_id,
        provider=provider,
        reference=reference,
        plan_id=request.plan_id,
        interval=request.interval,
        currency=request.currency,
        amount_minor=amount_minor,
    )
    return CheckoutResponse(
        checkout_id=str(checkout_id),
        provider=provider,  # type: ignore[arg-type]
        plan_id=request.plan_id,
        plan_name=plan["name"],
        interval=request.interval,
        currency=request.currency,
        amount=amount,
        amount_minor=amount_minor,
        **gateway_fields,
    )


async def _create_stripe_session(
    db: AsyncIOMotorDatabase[dict[str, Any]],
    settings: Settings,
    workspace: dict[str, Any],
    *,
    checkout_id: ObjectId,
    user_id: str,
    request: CheckoutRequest,
    plan_name: str,
    description: str,
    amount_minor: int,
) -> dict[str, Any]:
    workspace_id = str(workspace["_id"])
    billing_url = f"{settings.public_dashboard_base_url.rstrip('/')}/w/{workspace['slug']}/billing"
    interval_label = "annual" if request.interval == "annual" else "monthly"
    form: dict[str, str] = {
        "mode": "payment",
        "success_url": f"{billing_url}?checkout=success&checkout_id={checkout_id}",
        "cancel_url": f"{billing_url}?checkout=canceled",
        "client_reference_id": workspace_id,
        "metadata[workspace_id]": workspace_id,
        "metadata[checkout_id]": str(checkout_id),
        "metadata[plan_id]": request.plan_id,
        "metadata[interval]": request.interval,
        "line_items[0][quantity]": "1",
        "line_items[0][price_data][currency]": request.currency,
        "line_items[0][price_data][unit_amount]": str(amount_minor),
        "line_items[0][price_data][product_data][name]": f"Backline {plan_name} ({interval_label})",
        "line_items[0][price_data][product_data][description]": description,
        # A real Stripe invoice (hosted page + PDF) for every payment.
        "invoice_creation[enabled]": "true",
    }
    customer_id = _stripe_customer(settings, workspace)
    if customer_id:
        form["customer"] = customer_id
    else:
        form["customer_creation"] = "always"
        user = await UserRepository(db).find_by_id(user_id)
        if user and user.get("email"):
            form["customer_email"] = str(user["email"])
    return await _stripe_request(settings, "POST", "/checkout/sessions", data=form)


# -- confirmation ---------------------------------------------------------------------


async def verify_and_activate_payment(
    db: AsyncIOMotorDatabase[dict[str, Any]],
    *,
    workspace_id: str,
    user_id: str,
    request: VerifyPaymentRequest,
) -> SubscriptionOut:
    """Called by the browser after a checkout. Safe to call more than once and safe to
    race a webhook for the same payment: whichever arrives first activates the plan."""
    settings = get_settings()
    checkout = await BillingRepository(db).find_checkout(workspace_id, request.checkout_id)
    if checkout is None:
        raise NotFoundError("Checkout not found.")

    if checkout["status"] == "pending":
        provider = checkout["provider"]
        if provider == "sandbox":
            if not sandbox_allowed(settings):
                raise ValidationError("Test payments are turned off on this server.")
            await _activate_checkout(
                db, checkout, actor_type="member", actor_id=user_id, source="sandbox"
            )
        elif provider == "stripe":
            session = await _stripe_request(
                settings,
                "GET",
                f"/checkout/sessions/{checkout['reference']}",
                params={"expand[]": "invoice"},
            )
            if session.get("payment_status") != "paid":
                raise ValidationError(
                    "Stripe hasn't confirmed this payment yet. Delayed payment methods "
                    "activate the plan automatically once the payment clears."
                )
            await _activate_stripe_session(
                db, settings, checkout, session, actor_type="member", actor_id=user_id
            )
        else:
            if not (request.razorpay_payment_id and request.razorpay_signature):
                raise ValidationError("Razorpay didn't return a payment confirmation.")
            if not razorpay_live(settings):
                raise ValidationError("Razorpay payments aren't set up on this server.")
            signed = f"{checkout['reference']}|{request.razorpay_payment_id}"
            if not _hmac_matches(
                settings.razorpay_key_secret, signed.encode(), request.razorpay_signature
            ):
                # 422, not 401: the member's session is fine, the payment proof isn't -
                # and a 401 would make the dashboard silently refresh and retry.
                raise ValidationError("The payment signature didn't match. No plan was changed.")
            await _activate_checkout(
                db,
                checkout,
                actor_type="member",
                actor_id=user_id,
                source="confirm",
                provider_payment_id=request.razorpay_payment_id,
            )

    return await get_workspace_subscription(db, workspace_id, is_owner=True)


async def _activate_stripe_session(
    db: AsyncIOMotorDatabase[dict[str, Any]],
    settings: Settings,
    checkout: dict[str, Any],
    session: dict[str, Any],
    *,
    actor_type: ActorType,
    actor_id: str | None,
) -> None:
    if session.get("amount_total") != checkout["amount_minor"] or (
        str(session.get("currency", "")).lower() != checkout["currency"]
    ):
        logger.error(
            "Stripe session %s paid %s %s, checkout %s expected %s %s",
            session.get("id"),
            session.get("amount_total"),
            session.get("currency"),
            checkout["_id"],
            checkout["amount_minor"],
            checkout["currency"],
        )
        raise ValidationError("The paid amount doesn't match this checkout. No plan was changed.")

    invoice = session.get("invoice")
    if isinstance(invoice, str):
        # Webhook payloads carry only the invoice id; the URLs are a nicety, so a
        # failed lookup here must not block activating a payment that has cleared.
        try:
            invoice = await _stripe_request(settings, "GET", f"/invoices/{invoice}")
        except ExternalServiceError:
            invoice = None
    payment_intent = session.get("payment_intent")
    if isinstance(payment_intent, dict):
        payment_intent = payment_intent.get("id")
    customer = session.get("customer")
    if isinstance(customer, dict):
        customer = customer.get("id")

    await _activate_checkout(
        db,
        checkout,
        actor_type=actor_type,
        actor_id=actor_id,
        source="confirm" if actor_type == "member" else "webhook",
        provider_payment_id=str(payment_intent) if payment_intent else None,
        stripe_customer=(str(customer), _stripe_key_mode(settings)) if customer else None,
        hosted_invoice_url=invoice.get("hosted_invoice_url") if isinstance(invoice, dict) else None,
        invoice_pdf_url=invoice.get("invoice_pdf") if isinstance(invoice, dict) else None,
    )


async def _activate_checkout(
    db: AsyncIOMotorDatabase[dict[str, Any]],
    checkout: dict[str, Any],
    *,
    actor_type: ActorType,
    actor_id: str | None,
    source: str,
    provider_payment_id: str | None = None,
    stripe_customer: tuple[str, str] | None = None,
    hosted_invoice_url: str | None = None,
    invoice_pdf_url: str | None = None,
) -> None:
    """Claims the checkout, applies the plan and issues the invoice in one transaction,
    so a crash part-way leaves the checkout pending for the next confirm or webhook
    retry instead of marked paid with no plan applied."""
    repo = BillingRepository(db)
    workspace_id: str = checkout["workspace_id"]
    plan_id: str = checkout["plan_id"]
    interval: str = checkout["interval"]
    plan_name = get_plan_definition(plan_id)["name"]
    applied: dict[str, Any] = {}

    async def _apply(session: AsyncIOMotorClientSession) -> None:
        applied.clear()
        claimed = await repo.claim_checkout(
            workspace_id,
            checkout["_id"],
            provider_payment_id=provider_payment_id,
            session=session,
        )
        workspace = await repo.find_workspace(workspace_id, session=session)
        if not claimed or workspace is None:
            return

        now = datetime.now(UTC)
        current_end = workspace.get("current_period_end")
        # Paying again for the plan you're on extends it from the current end date, so
        # renewing early never loses days. Any other plan starts a fresh period now.
        covered_from = now
        if isinstance(current_end, datetime) and current_end > now:
            if effective_plan_id(workspace, now) == plan_id:
                covered_from = current_end
        extending = covered_from is not now
        period_end = covered_from + PERIOD_LENGTH[interval]
        fields: dict[str, Any] = {
            "plan": plan_id,
            "subscription_status": "active",
            "billing_interval": interval,
            "billing_currency": checkout["currency"],
            "billing_provider": checkout["provider"],
            "current_period_start": (
                workspace.get("current_period_start") or now if extending else now
            ),
            "current_period_end": period_end,
        }
        if stripe_customer is not None:
            fields["stripe_customer_id"], fields["stripe_customer_mode"] = stripe_customer
        await repo.set_workspace_billing(workspace_id, fields, session=session)

        invoice_number = await repo.next_invoice_number(now.year, session=session)
        await repo.create_invoice(
            {
                "workspace_id": workspace_id,
                "checkout_id": str(checkout["_id"]),
                "invoice_number": invoice_number,
                "amount_minor": checkout["amount_minor"],
                "currency": checkout["currency"],
                "plan_id": plan_id,
                "plan_name": plan_name,
                "interval": interval,
                "provider": checkout["provider"],
                "provider_payment_id": provider_payment_id,
                "hosted_invoice_url": hosted_invoice_url,
                "pdf_url": invoice_pdf_url,
                "period_start": covered_from,
                "period_end": period_end,
                "paid_at": now,
            },
            session=session,
        )
        await repo.create_billing_event(
            workspace_id=workspace_id,
            event_type="payment_succeeded",
            provider=checkout["provider"],
            plan_id=plan_id,
            amount_minor=checkout["amount_minor"],
            currency=checkout["currency"],
            interval=interval,
            metadata={
                "checkout_id": str(checkout["_id"]),
                "invoice_number": invoice_number,
                "provider_payment_id": provider_payment_id,
                "source": source,
            },
            session=session,
        )
        applied.update(invoice_number=invoice_number, period_end=period_end)

    async with await db.client.start_session() as mongo_session:
        await mongo_session.with_transaction(_apply)

    if applied:
        await append_event(
            db,
            workspace_id=workspace_id,
            type=PLAN_CHANGED,
            actor_type=actor_type,
            actor_id=actor_id,
            payload={
                "plan": plan_id,
                "plan_name": plan_name,
                "interval": interval,
                "provider": checkout["provider"],
                "invoice_number": applied["invoice_number"],
                "paid_through": applied["period_end"].isoformat(),
            },
        )


# -- downgrade, portal, invoices ------------------------------------------------------


async def cancel_subscription(
    db: AsyncIOMotorDatabase[dict[str, Any]],
    *,
    workspace_id: str,
    user_id: str,
    reason: str | None = None,
) -> SubscriptionOut:
    """Moves the workspace to Free now. Plans are prepaid and never auto-renew, so
    there is nothing to stop at the gateway; remaining paid time is not refunded."""
    repo = BillingRepository(db)
    workspace = await repo.find_workspace(workspace_id)
    if workspace is None:
        raise NotFoundError("Workspace not found.")
    previous = effective_plan_id(workspace)
    if previous == FREE_PLAN_ID:
        raise ValidationError("This workspace is already on the Free plan.")

    await repo.set_workspace_billing(
        workspace_id,
        {
            "plan": FREE_PLAN_ID,
            "subscription_status": "canceled",
            "current_period_start": None,
            "current_period_end": None,
        },
    )
    await repo.create_billing_event(
        workspace_id=workspace_id,
        event_type="plan_canceled",
        provider=workspace.get("billing_provider"),
        plan_id=previous,
        metadata={"reason": reason, "canceled_by": user_id},
    )
    await append_event(
        db,
        workspace_id=workspace_id,
        type=PLAN_CHANGED,
        actor_type="member",
        actor_id=user_id,
        payload={"plan": FREE_PLAN_ID, "previous_plan": previous, "reason": reason},
    )
    return await get_workspace_subscription(db, workspace_id, is_owner=True)


async def create_customer_portal_session(
    db: AsyncIOMotorDatabase[dict[str, Any]], *, workspace_id: str
) -> PortalResponse:
    settings = get_settings()
    workspace = await BillingRepository(db).find_workspace(workspace_id)
    if workspace is None:
        raise NotFoundError("Workspace not found.")
    customer_id = _stripe_customer(settings, workspace)
    if customer_id is None:
        raise ValidationError("This workspace has no Stripe billing profile yet.")
    return_url = f"{settings.public_dashboard_base_url.rstrip('/')}/w/{workspace['slug']}/billing"
    session = await _stripe_request(
        settings,
        "POST",
        "/billing_portal/sessions",
        data={"customer": customer_id, "return_url": return_url},
    )
    return PortalResponse(portal_url=str(session["url"]))


async def list_workspace_invoices(
    db: AsyncIOMotorDatabase[dict[str, Any]], workspace_id: str
) -> list[InvoiceOut]:
    return [
        InvoiceOut(
            id=str(doc["_id"]),
            invoice_number=doc["invoice_number"],
            amount_paid=doc["amount_minor"] / 100,
            currency=doc["currency"],
            status=doc["status"],
            provider=doc["provider"],
            provider_payment_id=doc.get("provider_payment_id"),
            plan_name=doc["plan_name"],
            interval=doc["interval"],
            period_start=doc["period_start"],
            period_end=doc["period_end"],
            paid_at=doc["paid_at"],
            pdf_url=doc.get("pdf_url"),
            hosted_invoice_url=doc.get("hosted_invoice_url"),
        )
        for doc in await BillingRepository(db).list_invoices(workspace_id)
    ]


# -- webhooks -------------------------------------------------------------------------


async def handle_stripe_webhook(
    db: AsyncIOMotorDatabase[dict[str, Any]], payload: bytes, signature_header: str | None
) -> dict[str, str]:
    settings = get_settings()
    if not settings.stripe_webhook_secret:
        raise ValidationError("Stripe webhooks aren't configured on this server.")
    _verify_stripe_signature(settings.stripe_webhook_secret, payload, signature_header)
    event = _parse_json_object(payload)

    if event.get("type") not in (
        "checkout.session.completed",
        "checkout.session.async_payment_succeeded",
    ):
        return {"status": "ignored"}
    session = event.get("data", {}).get("object", {})
    if not isinstance(session, dict) or session.get("payment_status") != "paid":
        return {"status": "ignored"}
    checkout = await BillingRepository(db).find_checkout_by_reference(
        "stripe", str(session.get("id"))
    )
    if checkout is None:
        return {"status": "ignored"}
    if checkout["status"] == "pending":
        try:
            await _activate_stripe_session(
                db, settings, checkout, session, actor_type="system", actor_id=None
            )
        except ValidationError:
            # Already logged; acknowledge so Stripe stops retrying a payment that will
            # never match this checkout.
            return {"status": "ignored"}
    return {"status": "processed"}


async def handle_razorpay_webhook(
    db: AsyncIOMotorDatabase[dict[str, Any]], payload: bytes, signature_header: str | None
) -> dict[str, str]:
    settings = get_settings()
    if not settings.razorpay_webhook_secret:
        raise ValidationError("Razorpay webhooks aren't configured on this server.")
    if not signature_header or not _hmac_matches(
        settings.razorpay_webhook_secret, payload, signature_header
    ):
        raise AuthenticationError("Invalid Razorpay webhook signature.")
    event = _parse_json_object(payload)

    if event.get("event") not in ("payment.captured", "order.paid"):
        return {"status": "ignored"}
    payment = event.get("payload", {}).get("payment", {}).get("entity", {})
    if not isinstance(payment, dict) or not payment.get("order_id"):
        return {"status": "ignored"}
    checkout = await BillingRepository(db).find_checkout_by_reference(
        "razorpay", str(payment["order_id"])
    )
    if checkout is None:
        return {"status": "ignored"}
    if payment.get("amount") != checkout["amount_minor"]:
        logger.error(
            "Razorpay payment %s amount %s does not match checkout %s (%s)",
            payment.get("id"),
            payment.get("amount"),
            checkout["_id"],
            checkout["amount_minor"],
        )
        return {"status": "ignored"}
    if checkout["status"] == "pending":
        await _activate_checkout(
            db,
            checkout,
            actor_type="system",
            actor_id=None,
            source="webhook",
            provider_payment_id=str(payment.get("id")) if payment.get("id") else None,
        )
    return {"status": "processed"}


def _verify_stripe_signature(secret: str, payload: bytes, header: str | None) -> None:
    """Stripe signs `{timestamp}.{raw body}` with HMAC-SHA256 and sends
    `t=<timestamp>,v1=<hex>[,v1=<hex>...]` (more than one v1 while secrets rotate)."""
    if not header:
        raise AuthenticationError("Missing Stripe signature.")
    parts = [item.split("=", 1) for item in header.split(",") if "=" in item]
    timestamps = [value for key, value in parts if key.strip() == "t"]
    signatures = [value for key, value in parts if key.strip() == "v1"]
    if not timestamps or not signatures or not timestamps[0].isdigit():
        raise AuthenticationError("Malformed Stripe signature.")
    if abs(time.time() - int(timestamps[0])) > STRIPE_SIGNATURE_TOLERANCE_SECONDS:
        raise AuthenticationError("Stripe signature timestamp is outside the tolerance.")
    signed = timestamps[0].encode() + b"." + payload
    if not any(_hmac_matches(secret, signed, candidate) for candidate in signatures):
        raise AuthenticationError("Invalid Stripe signature.")


def _hmac_matches(secret: str, message: bytes, signature: str) -> bool:
    expected = hmac.new(secret.encode(), message, hashlib.sha256).hexdigest()
    return hmac.compare_digest(expected, signature.strip())


def _parse_json_object(payload: bytes) -> dict[str, Any]:
    try:
        parsed = json.loads(payload)
    except ValueError as exc:
        raise ValidationError("Webhook body is not valid JSON.") from exc
    if not isinstance(parsed, dict):
        raise ValidationError("Webhook body is not a JSON object.")
    return parsed


# -- gateway HTTP ---------------------------------------------------------------------


async def _stripe_request(
    settings: Settings,
    method: str,
    path: str,
    *,
    data: dict[str, str] | None = None,
    params: dict[str, str] | None = None,
) -> dict[str, Any]:
    return await _gateway_request(
        "Stripe",
        method,
        f"{STRIPE_API}{path}",
        auth=(settings.stripe_secret_key, ""),
        data=data,
        params=params,
    )


async def _razorpay_request(
    settings: Settings, method: str, path: str, *, body: dict[str, Any]
) -> dict[str, Any]:
    return await _gateway_request(
        "Razorpay",
        method,
        f"{RAZORPAY_API}{path}",
        auth=(settings.razorpay_key_id, settings.razorpay_key_secret),
        json=body,
    )


async def _gateway_request(
    label: str, method: str, url: str, *, auth: tuple[str, str], **kwargs: Any
) -> dict[str, Any]:
    try:
        async with httpx.AsyncClient(timeout=_GATEWAY_TIMEOUT) as client:
            response = await client.request(method, url, auth=auth, **kwargs)
    except httpx.HTTPError as exc:
        logger.warning("%s request %s %s failed: %s", label, method, url, exc)
        raise ExternalServiceError(f"Couldn't reach {label}. Try again in a moment.") from exc
    try:
        body = response.json()
    except ValueError:
        body = {}
    if response.status_code >= 400 or not isinstance(body, dict):
        error = body.get("error") if isinstance(body, dict) else None
        detail = (
            error.get("message") or error.get("description") if isinstance(error, dict) else None
        )
        logger.warning("%s %s %s -> %s: %s", label, method, url, response.status_code, detail)
        raise ExternalServiceError(
            f"{label} declined the request: {detail}"
            if detail
            else f"{label} declined the request."
        )
    return body
