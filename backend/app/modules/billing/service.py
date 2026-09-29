"""Billing service layer: Stripe, Razorpay/UPI, sandbox checkout, limits and invoices."""

import hashlib
import hmac
import time
from datetime import UTC, datetime, timedelta
from typing import Any
from uuid import uuid4

import httpx
from bson import ObjectId
from motor.motor_asyncio import AsyncIOMotorDatabase

from app.core.config import get_settings
from app.core.errors import (
    AuthenticationError,
    ExternalServiceError,
    NotFoundError,
    ValidationError,
)
from app.core.events import append_event
from app.modules.billing.limits import get_workspace_limits_and_usage
from app.modules.billing.plans import (
    COMPARISON_CATEGORIES,
    PLANS,
    get_plan_definition,
    get_plan_limits_snapshot,
)
from app.modules.billing.repository import BillingRepository
from app.modules.billing.schemas import (
    CheckoutRequest,
    CheckoutResponse,
    ComparisonCategoryOut,
    ComparisonRowOut,
    InvoiceOut,
    PlansResponseOut,
    PlanTierOut,
    PortalResponse,
    SubscriptionOut,
    UsageMetricsOut,
    VerifyPaymentRequest,
)


def _compute_price(plan_id: str, interval: str, currency: str) -> float:
    plan = get_plan_definition(plan_id)
    if currency == "inr":
        if interval == "annual":
            return float(plan["price_annual_inr"] * 12)
        return float(plan["price_monthly_inr"])
    else:
        if interval == "annual":
            return float(plan["price_annual_usd"] * 12)
        return float(plan["price_monthly_usd"])


async def get_available_plans(
    db: AsyncIOMotorDatabase[dict[str, Any]], workspace_id: str
) -> PlansResponseOut:
    settings = get_settings()
    try:
        ws_doc = await db.workspaces.find_one({"_id": ObjectId(workspace_id)})
    except Exception:
        ws_doc = await db.workspaces.find_one({"_id": workspace_id})

    current_plan = (ws_doc.get("plan", "free") if ws_doc else "free").lower()

    plans_list: list[PlanTierOut] = []
    for p in PLANS.values():
        plans_list.append(
            PlanTierOut(
                id=p["id"],
                name=p["name"],
                badge=p["badge"],
                description=p["description"],
                popular=p["popular"],
                price_monthly_usd=p["price_monthly_usd"],
                price_annual_usd=p["price_annual_usd"],
                price_monthly_inr=p["price_monthly_inr"],
                price_annual_inr=p["price_annual_inr"],
                project_limit=p["project_limit"],
                member_limit=p["member_limit"],
                guest_limit_label=p["guest_limit_label"],
                ai_credits_monthly=p["ai_credits_monthly"],
                storage_gb=p["storage_gb"],
                integrations_allowed=p["integrations_allowed"],
                features=p["features"],
                highlights=p["highlights"],
            )
        )

    categories_list: list[ComparisonCategoryOut] = []
    for cat in COMPARISON_CATEGORIES:
        cat_name = str(cat.get("category", ""))
        raw_rows = cat.get("rows", [])
        if isinstance(raw_rows, list):
            rows = [
                ComparisonRowOut(
                    name=str(r.get("name", "")),
                    free=str(r.get("free", "")),
                    solo=str(r.get("solo", "")),
                    team=str(r.get("team", "")),
                    enterprise=str(r.get("enterprise", "")),
                )
                for r in raw_rows
                if isinstance(r, dict)
            ]
            categories_list.append(ComparisonCategoryOut(category=cat_name, rows=rows))

    return PlansResponseOut(
        plans=plans_list,
        categories=categories_list,
        current_plan_id=current_plan,
        sandbox_enabled=settings.billing_sandbox_enabled,
        stripe_configured=bool(settings.stripe_secret_key),
        razorpay_configured=bool(settings.razorpay_key_id and settings.razorpay_key_secret),
    )


async def get_workspace_subscription(
    db: AsyncIOMotorDatabase[dict[str, Any]], workspace_id: str, requesting_user_id: str
) -> SubscriptionOut:
    try:
        ws_doc = await db.workspaces.find_one({"_id": ObjectId(workspace_id)})
    except Exception:
        ws_doc = await db.workspaces.find_one({"_id": workspace_id})

    if ws_doc is None:
        raise NotFoundError("Workspace not found.")

    membership = await db.memberships.find_one(
        {"workspace_id": workspace_id, "user_id": requesting_user_id}
    )
    is_owner = membership is not None and membership.get("role") == "owner"

    plan_id = ws_doc.get("plan", "free").lower()
    plan_def = get_plan_definition(plan_id)
    limits, usage = await get_workspace_limits_and_usage(db, workspace_id)

    status = ws_doc.get("subscription_status", "active")
    interval = ws_doc.get("billing_interval", "monthly")
    currency = ws_doc.get("billing_currency", "usd")
    provider = ws_doc.get("provider", "free")
    cancel_at_period_end = ws_doc.get("cancel_at_period_end", False)
    current_period_start = ws_doc.get("current_period_start")
    current_period_end = ws_doc.get("current_period_end")

    amount = _compute_price(plan_id, interval, currency)

    payment_method = None
    if provider == "stripe":
        payment_method = "Stripe Card (•••• 4242)"
    elif provider == "razorpay":
        payment_method = "Razorpay / UPI (user@upi)"
    elif provider == "sandbox":
        payment_method = "Test Sandbox Simulated Card"
    elif plan_id == "free":
        payment_method = "Free Workspace"

    usage_metrics = UsageMetricsOut(
        projects_used=usage["projects"],
        projects_limit=limits.get("project_limit", plan_def["project_limit"]),
        members_used=usage["members"],
        members_limit=limits.get("member_limit", plan_def["member_limit"]),
        ai_credits_used=usage["ai_actions"],
        ai_credits_limit=limits.get("ai_credits_monthly", plan_def["ai_credits_monthly"]),
        storage_gb_used=0.1,
        storage_gb_limit=limits.get("storage_gb", plan_def["storage_gb"]),
    )

    return SubscriptionOut(
        workspace_id=workspace_id,
        plan_id=plan_id,
        plan_name=plan_def["name"],
        status=status,
        interval=interval,
        currency=currency,
        amount=amount,
        provider=provider,
        current_period_start=current_period_start,
        current_period_end=current_period_end,
        cancel_at_period_end=cancel_at_period_end,
        usage=usage_metrics,
        payment_method_summary=payment_method,
        is_owner=is_owner,
    )


async def create_checkout_session(
    db: AsyncIOMotorDatabase[dict[str, Any]],
    *,
    workspace_id: str,
    user_id: str,
    request: CheckoutRequest,
    user_email: str | None = None,
) -> CheckoutResponse:
    settings = get_settings()
    try:
        ws_doc = await db.workspaces.find_one({"_id": ObjectId(workspace_id)})
    except Exception:
        ws_doc = await db.workspaces.find_one({"_id": workspace_id})

    if ws_doc is None:
        raise NotFoundError("Workspace not found.")

    if user_email is None:
        try:
            u_doc = await db.users.find_one({"_id": ObjectId(user_id)})
            if u_doc and "email" in u_doc:
                user_email = str(u_doc["email"])
        except Exception:
            pass

    workspace_slug = ws_doc.get("slug", workspace_id)
    plan = get_plan_definition(request.plan_id)
    total_amount = _compute_price(request.plan_id, request.interval, request.currency)

    dashboard_base = settings.public_dashboard_base_url.rstrip("/")
    success_url = request.success_url or (
        f"{dashboard_base}/w/{workspace_slug}/billing"
        f"?checkout=success&plan={request.plan_id}&interval={request.interval}"
    )
    cancel_url = (
        request.cancel_url or f"{dashboard_base}/w/{workspace_slug}/billing?checkout=canceled"
    )

    # 1. Real Stripe Integration if provider is stripe and secret key is set
    if request.provider == "stripe" and settings.stripe_secret_key:
        unit_amount_cents = int(total_amount * 100)
        async with httpx.AsyncClient(timeout=15.0) as client:
            plan_name = plan["name"]
            interval_title = request.interval.capitalize()
            form_data = {
                "success_url": success_url + "&session_id={CHECKOUT_SESSION_ID}",
                "cancel_url": cancel_url,
                "mode": "payment",
                "client_reference_id": workspace_id,
                "payment_method_types[0]": "card",
                "line_items[0][price_data][currency]": request.currency.lower(),
                "line_items[0][price_data][unit_amount]": str(unit_amount_cents),
                "line_items[0][price_data][product_data][name]": (
                    f"Backline {plan_name} Plan ({interval_title})"
                ),
                "line_items[0][price_data][product_data][description]": plan["description"],
                "line_items[0][quantity]": "1",
                "metadata[workspace_id]": workspace_id,
                "metadata[plan_id]": request.plan_id,
                "metadata[interval]": request.interval,
                "metadata[currency]": request.currency,
            }
            if user_email:
                form_data["customer_email"] = user_email
            res = await client.post(
                "https://api.stripe.com/v1/checkout/sessions",
                data=form_data,
                auth=(settings.stripe_secret_key, ""),
            )
            if res.status_code != 200:
                raise ExternalServiceError(f"Stripe checkout creation failed: {res.text}")
            data = res.json()
            return CheckoutResponse(
                provider="stripe",
                checkout_url=data.get("url"),
                session_id=data.get("id"),
                amount=total_amount,
                currency=request.currency,
                plan_id=request.plan_id,
                interval=request.interval,
                sandbox_mode=False,
            )

    # 2. Real Razorpay Integration if provider is razorpay and keys are set
    if request.provider == "razorpay" and settings.razorpay_key_id and settings.razorpay_key_secret:
        amount_paise = int(total_amount * 100)
        async with httpx.AsyncClient(timeout=15.0) as client:
            order_data = {
                "amount": amount_paise,
                "currency": request.currency.upper(),
                "receipt": f"rcpt_{workspace_id[:8]}_{int(time.time())}",
                "notes": {
                    "workspace_id": workspace_id,
                    "plan_id": request.plan_id,
                    "interval": request.interval,
                },
            }
            res = await client.post(
                "https://api.razorpay.com/v1/orders",
                json=order_data,
                auth=(settings.razorpay_key_id, settings.razorpay_key_secret),
            )
            if res.status_code != 200:
                raise ExternalServiceError(f"Razorpay order creation failed: {res.text}")
            data = res.json()
            return CheckoutResponse(
                provider="razorpay",
                order_id=data.get("id"),
                key_id=settings.razorpay_key_id,
                amount=total_amount,
                currency=request.currency,
                plan_id=request.plan_id,
                interval=request.interval,
                sandbox_mode=False,
            )

    # 3. Sandbox / Mock checkout simulation (for testing before real keys or sandbox test mode)
    simulated_token = f"sim_{uuid4().hex[:16]}"
    return CheckoutResponse(
        provider=request.provider,
        checkout_url=f"{success_url}&simulated_token={simulated_token}",
        session_id=f"cs_test_{uuid4().hex[:16]}",
        order_id=f"order_test_{uuid4().hex[:14]}",
        key_id="rzp_test_sandbox_mock",
        amount=total_amount,
        currency=request.currency,
        plan_id=request.plan_id,
        interval=request.interval,
        sandbox_mode=True,
        simulated_token=simulated_token,
    )


async def verify_and_activate_payment(
    db: AsyncIOMotorDatabase[dict[str, Any]],
    *,
    workspace_id: str,
    user_id: str,
    request: VerifyPaymentRequest,
) -> SubscriptionOut:
    settings = get_settings()
    repo = BillingRepository(db)

    try:
        ws_doc = await db.workspaces.find_one({"_id": ObjectId(workspace_id)})
    except Exception:
        ws_doc = await db.workspaces.find_one({"_id": workspace_id})

    if ws_doc is None:
        raise NotFoundError("Workspace not found.")

    plan_def = get_plan_definition(request.plan_id)
    plan_limits = get_plan_limits_snapshot(request.plan_id)
    amount_paid = _compute_price(request.plan_id, request.interval, request.currency)

    # 1. Verify Razorpay Signature if real Razorpay transaction
    if request.provider == "razorpay" and not request.simulated:
        if not (
            request.razorpay_order_id and request.razorpay_payment_id and request.razorpay_signature
        ):
            raise ValidationError("Missing Razorpay verification parameters.")
        if settings.razorpay_key_secret:
            expected_sig = hmac.new(
                settings.razorpay_key_secret.encode("utf-8"),
                f"{request.razorpay_order_id}|{request.razorpay_payment_id}".encode(),
                hashlib.sha256,
            ).hexdigest()
            if not hmac.compare_digest(expected_sig, request.razorpay_signature):
                raise AuthenticationError("Invalid Razorpay payment signature.")

    # 2. Verify Stripe Session if real Stripe transaction
    if request.provider == "stripe" and not request.simulated and request.stripe_session_id:
        if settings.stripe_secret_key:
            async with httpx.AsyncClient(timeout=10.0) as client:
                res = await client.get(
                    f"https://api.stripe.com/v1/checkout/sessions/{request.stripe_session_id}",
                    auth=(settings.stripe_secret_key, ""),
                )
                if res.status_code != 200:
                    raise ExternalServiceError("Could not verify Stripe checkout session.")
                stripe_data = res.json()
                if stripe_data.get("payment_status") != "paid":
                    raise ValidationError("Stripe payment not completed.")

    # Calculate subscription dates
    now = datetime.now(UTC)
    if request.interval == "annual":
        period_end = now + timedelta(days=365)
    else:
        period_end = now + timedelta(days=30)

    # Update workspace billing fields
    await repo.update_workspace_billing(
        workspace_id,
        plan=request.plan_id,
        plan_limits_json=plan_limits,
        subscription_status="active",
        billing_interval=request.interval,
        billing_currency=request.currency,
        provider=request.provider,
        current_period_start=now,
        current_period_end=period_end,
        cancel_at_period_end=False,
    )

    # Generate next invoice
    invoice_number = await repo.generate_next_invoice_number(workspace_id)
    provider_invoice_id = (
        request.razorpay_payment_id or request.stripe_session_id or f"inv_{uuid4().hex[:12]}"
    )
    await repo.create_invoice(
        workspace_id=workspace_id,
        invoice_number=invoice_number,
        amount_paid=amount_paid,
        currency=request.currency,
        plan_id=request.plan_id,
        plan_name=plan_def["name"],
        interval=request.interval,
        provider=request.provider,
        period_start=now,
        period_end=period_end,
        provider_invoice_id=provider_invoice_id,
        hosted_invoice_url=f"/invoices/{invoice_number}",
        pdf_url=f"/invoices/{invoice_number}.pdf",
    )

    # Record billing audit event
    await repo.create_billing_event(
        workspace_id=workspace_id,
        event_type="subscription_created",
        provider=request.provider,
        amount=amount_paid,
        currency=request.currency,
        plan_id=request.plan_id,
        interval=request.interval,
        provider_event_id=request.razorpay_payment_id or request.stripe_session_id,
        metadata={
            "plan_name": plan_def["name"],
            "simulated": request.simulated,
            "payment_method": request.payment_method,
            "user_id": user_id,
        },
    )

    # Append timeline event
    await append_event(
        db,
        workspace_id=workspace_id,
        type="workspace:plan_changed",
        actor_type="member",
        actor_id=user_id,
        payload={
            "plan": request.plan_id,
            "plan_name": plan_def["name"],
            "interval": request.interval,
            "amount": amount_paid,
            "currency": request.currency,
            "provider": request.provider,
        },
    )

    return await get_workspace_subscription(db, workspace_id, user_id)


async def cancel_subscription(
    db: AsyncIOMotorDatabase[dict[str, Any]],
    *,
    workspace_id: str,
    user_id: str,
    reason: str | None = None,
) -> SubscriptionOut:
    repo = BillingRepository(db)
    try:
        ws_doc = await db.workspaces.find_one({"_id": ObjectId(workspace_id)})
    except Exception:
        ws_doc = await db.workspaces.find_one({"_id": workspace_id})

    if ws_doc is None:
        raise NotFoundError("Workspace not found.")

    free_limits = get_plan_limits_snapshot("free")

    await repo.update_workspace_billing(
        workspace_id,
        plan="free",
        plan_limits_json=free_limits,
        subscription_status="canceled",
        billing_interval="monthly",
        billing_currency="usd",
        provider="free",
        cancel_at_period_end=False,
    )

    await repo.create_billing_event(
        workspace_id=workspace_id,
        event_type="subscription_canceled",
        provider="manual",
        amount=0.0,
        currency="usd",
        plan_id="free",
        interval="monthly",
        metadata={"reason": reason, "canceled_by": user_id},
    )

    await append_event(
        db,
        workspace_id=workspace_id,
        type="workspace:plan_changed",
        actor_type="member",
        actor_id=user_id,
        payload={"plan": "free", "status": "canceled", "reason": reason},
    )

    return await get_workspace_subscription(db, workspace_id, user_id)


async def create_customer_portal_session(
    db: AsyncIOMotorDatabase[dict[str, Any]],
    *,
    workspace_id: str,
    requesting_user_id: str,
) -> PortalResponse:
    settings = get_settings()
    try:
        ws_doc = await db.workspaces.find_one({"_id": ObjectId(workspace_id)})
    except Exception:
        ws_doc = await db.workspaces.find_one({"_id": workspace_id})

    if ws_doc is None:
        raise NotFoundError("Workspace not found.")

    stripe_customer_id = ws_doc.get("stripe_customer_id")
    workspace_slug = ws_doc.get("slug", workspace_id)
    dashboard_base = settings.public_dashboard_base_url.rstrip("/")
    return_url = f"{dashboard_base}/w/{workspace_slug}/billing"

    if stripe_customer_id and settings.stripe_secret_key:
        async with httpx.AsyncClient(timeout=10.0) as client:
            res = await client.post(
                "https://api.stripe.com/v1/billing_portal/sessions",
                data={"customer": stripe_customer_id, "return_url": return_url},
                auth=(settings.stripe_secret_key, ""),
            )
            if res.status_code == 200:
                data = res.json()
                return PortalResponse(portal_url=data.get("url", return_url))

    return PortalResponse(portal_url=return_url)


async def list_workspace_invoices(
    db: AsyncIOMotorDatabase[dict[str, Any]], workspace_id: str
) -> list[InvoiceOut]:
    repo = BillingRepository(db)
    docs = await repo.list_invoices(workspace_id)
    results: list[InvoiceOut] = []
    for d in docs:
        results.append(
            InvoiceOut(
                id=str(d["_id"]),
                workspace_id=d["workspace_id"],
                invoice_number=d["invoice_number"],
                amount_paid=d["amount_paid"],
                currency=d["currency"],
                status=d["status"],
                provider=d["provider"],
                plan_name=d["plan_name"],
                interval=d["interval"],
                period_start=d["period_start"],
                period_end=d["period_end"],
                paid_at=d["paid_at"],
                pdf_url=d.get("pdf_url"),
                hosted_invoice_url=d.get("hosted_invoice_url"),
            )
        )
    return results


async def handle_stripe_webhook(
    db: AsyncIOMotorDatabase[dict[str, Any]],
    payload: dict[str, Any],
) -> dict[str, str]:
    event_type = payload.get("type", "")
    data_obj = payload.get("data", {}).get("object", {})
    metadata = data_obj.get("metadata", {})
    workspace_id = metadata.get("workspace_id") or data_obj.get("client_reference_id")

    if not workspace_id:
        return {"status": "ignored", "reason": "no_workspace_id"}

    repo = BillingRepository(db)
    if event_type == "checkout.session.completed":
        plan_id = metadata.get("plan_id", "team")
        interval = metadata.get("interval", "monthly")
        currency = metadata.get("currency", "usd")
        amount_total = float(data_obj.get("amount_total", 0)) / 100.0

        plan_def = get_plan_definition(plan_id)
        plan_limits = get_plan_limits_snapshot(plan_id)
        now = datetime.now(UTC)
        period_end = now + timedelta(days=365 if interval == "annual" else 30)

        await repo.update_workspace_billing(
            workspace_id,
            plan=plan_id,
            plan_limits_json=plan_limits,
            subscription_status="active",
            billing_interval=interval,
            billing_currency=currency,
            provider="stripe",
            stripe_customer_id=data_obj.get("customer"),
            stripe_subscription_id=data_obj.get("subscription"),
            current_period_start=now,
            current_period_end=period_end,
        )

        invoice_number = await repo.generate_next_invoice_number(workspace_id)
        await repo.create_invoice(
            workspace_id=workspace_id,
            invoice_number=invoice_number,
            amount_paid=amount_total,
            currency=currency,
            plan_id=plan_id,
            plan_name=plan_def["name"],
            interval=interval,
            provider="stripe",
            period_start=now,
            period_end=period_end,
            provider_invoice_id=data_obj.get("id"),
        )

        await repo.create_billing_event(
            workspace_id=workspace_id,
            event_type="checkout_completed",
            provider="stripe",
            amount=amount_total,
            currency=currency,
            plan_id=plan_id,
            interval=interval,
            provider_event_id=data_obj.get("id"),
        )

    return {"status": "processed"}


async def handle_razorpay_webhook(
    db: AsyncIOMotorDatabase[dict[str, Any]],
    payload: dict[str, Any],
) -> dict[str, str]:
    event = payload.get("event", "")
    payment_obj = payload.get("payload", {}).get("payment", {}).get("entity", {})
    notes = payment_obj.get("notes", {})
    workspace_id = notes.get("workspace_id")

    if not workspace_id:
        return {"status": "ignored", "reason": "no_workspace_id"}

    repo = BillingRepository(db)
    if event in ("payment.captured", "order.paid"):
        plan_id = notes.get("plan_id", "team")
        interval = notes.get("interval", "monthly")
        currency = payment_obj.get("currency", "INR").lower()
        amount_paid = float(payment_obj.get("amount", 0)) / 100.0

        plan_def = get_plan_definition(plan_id)
        plan_limits = get_plan_limits_snapshot(plan_id)
        now = datetime.now(UTC)
        period_end = now + timedelta(days=365 if interval == "annual" else 30)

        await repo.update_workspace_billing(
            workspace_id,
            plan=plan_id,
            plan_limits_json=plan_limits,
            subscription_status="active",
            billing_interval=interval,
            billing_currency=currency,
            provider="razorpay",
            razorpay_customer_id=payment_obj.get("customer_id"),
            current_period_start=now,
            current_period_end=period_end,
        )

        invoice_number = await repo.generate_next_invoice_number(workspace_id)
        await repo.create_invoice(
            workspace_id=workspace_id,
            invoice_number=invoice_number,
            amount_paid=amount_paid,
            currency=currency,
            plan_id=plan_id,
            plan_name=plan_def["name"],
            interval=interval,
            provider="razorpay",
            period_start=now,
            period_end=period_end,
            provider_invoice_id=payment_obj.get("id"),
        )

    return {"status": "processed"}
