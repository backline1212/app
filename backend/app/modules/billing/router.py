"""Billing and subscription API router."""

import json

from fastapi import APIRouter, Depends, Header, HTTPException, Request, status

from app.core.db import get_db
from app.core.permissions import require_permission
from app.core.session import Session, require_workspace_match
from app.modules.billing import service as billing_service
from app.modules.billing.schemas import (
    CancelSubscriptionRequest,
    CheckoutRequest,
    CheckoutResponse,
    InvoiceOut,
    PlansResponseOut,
    PortalResponse,
    SubscriptionOut,
    VerifyPaymentRequest,
)

router = APIRouter(tags=["billing"])


@router.get(
    "/workspaces/{workspace_id}/billing/plans",
    response_model=PlansResponseOut,
)
async def get_plans(
    workspace_id: str,
    session: Session = Depends(require_permission("workspace:view_settings")),
) -> PlansResponseOut:
    require_workspace_match(session, workspace_id)
    return await billing_service.get_available_plans(get_db(), workspace_id)


@router.get(
    "/workspaces/{workspace_id}/billing/subscription",
    response_model=SubscriptionOut,
)
async def get_subscription(
    workspace_id: str,
    session: Session = Depends(require_permission("workspace:view_settings")),
) -> SubscriptionOut:
    require_workspace_match(session, workspace_id)
    return await billing_service.get_workspace_subscription(
        get_db(), workspace_id, session.user_id
    )


@router.post(
    "/workspaces/{workspace_id}/billing/checkout",
    response_model=CheckoutResponse,
)
async def create_checkout(
    workspace_id: str,
    body: CheckoutRequest,
    session: Session = Depends(require_permission("workspace:manage_billing")),
) -> CheckoutResponse:
    require_workspace_match(session, workspace_id)
    return await billing_service.create_checkout_session(
        get_db(),
        workspace_id=workspace_id,
        user_id=session.user_id,
        user_email=session.email or "billing@example.com",
        request=body,
    )


@router.post(
    "/workspaces/{workspace_id}/billing/verify-payment",
    response_model=SubscriptionOut,
)
async def verify_payment(
    workspace_id: str,
    body: VerifyPaymentRequest,
    session: Session = Depends(require_permission("workspace:manage_billing")),
) -> SubscriptionOut:
    require_workspace_match(session, workspace_id)
    return await billing_service.verify_and_activate_payment(
        get_db(),
        workspace_id=workspace_id,
        user_id=session.user_id,
        request=body,
    )


@router.post(
    "/workspaces/{workspace_id}/billing/cancel",
    response_model=SubscriptionOut,
)
async def cancel_subscription(
    workspace_id: str,
    body: CancelSubscriptionRequest | None = None,
    session: Session = Depends(require_permission("workspace:manage_billing")),
) -> SubscriptionOut:
    require_workspace_match(session, workspace_id)
    reason = body.reason if body else None
    return await billing_service.cancel_subscription(
        get_db(),
        workspace_id=workspace_id,
        user_id=session.user_id,
        reason=reason,
    )


@router.post(
    "/workspaces/{workspace_id}/billing/portal",
    response_model=PortalResponse,
)
async def customer_portal(
    workspace_id: str,
    session: Session = Depends(require_permission("workspace:manage_billing")),
) -> PortalResponse:
    require_workspace_match(session, workspace_id)
    return await billing_service.create_customer_portal_session(
        get_db(),
        workspace_id=workspace_id,
        requesting_user_id=session.user_id,
    )


@router.get(
    "/workspaces/{workspace_id}/billing/invoices",
    response_model=list[InvoiceOut],
)
async def list_invoices(
    workspace_id: str,
    session: Session = Depends(require_permission("workspace:view_settings")),
) -> list[InvoiceOut]:
    require_workspace_match(session, workspace_id)
    return await billing_service.list_workspace_invoices(get_db(), workspace_id)


# ============================================================================
# PUBLIC WEBHOOK ENDPOINTS (Stripe & Razorpay)
# ============================================================================


@router.post("/billing/webhooks/stripe")
async def stripe_webhook(
    request: Request,
    stripe_signature: str | None = Header(None, alias="Stripe-Signature"),
) -> dict[str, str]:
    payload_bytes = await request.body()
    try:
        data = json.loads(payload_bytes.decode("utf-8"))
    except Exception as exc:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid payload"
        ) from exc

    return await billing_service.handle_stripe_webhook(get_db(), data)


@router.post("/billing/webhooks/razorpay")
async def razorpay_webhook(
    request: Request,
    x_razorpay_signature: str | None = Header(None, alias="X-Razorpay-Signature"),
) -> dict[str, str]:
    payload_bytes = await request.body()
    try:
        data = json.loads(payload_bytes.decode("utf-8"))
    except Exception as exc:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid payload"
        ) from exc

    return await billing_service.handle_razorpay_webhook(get_db(), data)
