"""Billing and subscription API router."""

from fastapi import APIRouter, Depends, Header, Request

from app.core.db import get_db
from app.core.permissions import require_permission
from app.core.session import Session, require_workspace_match
from app.modules.billing import service as billing_service
from app.modules.billing.schemas import (
    AiUsageOut,
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


@router.get("/workspaces/{workspace_id}/billing/plans", response_model=PlansResponseOut)
async def get_plans(
    workspace_id: str,
    session: Session = Depends(require_permission("workspace:view_settings")),
) -> PlansResponseOut:
    require_workspace_match(session, workspace_id)
    return billing_service.get_available_plans()


@router.get("/workspaces/{workspace_id}/billing/subscription", response_model=SubscriptionOut)
async def get_subscription(
    workspace_id: str,
    session: Session = Depends(require_permission("workspace:view_settings")),
) -> SubscriptionOut:
    require_workspace_match(session, workspace_id)
    return await billing_service.get_workspace_subscription(
        get_db(), workspace_id, is_owner=session.role == "owner"
    )


@router.get("/workspaces/{workspace_id}/billing/ai-usage", response_model=AiUsageOut)
async def get_ai_usage(
    workspace_id: str,
    session: Session = Depends(require_permission("workspace:view_settings")),
) -> AiUsageOut:
    require_workspace_match(session, workspace_id)
    return await billing_service.get_ai_usage(get_db(), workspace_id)


@router.post("/workspaces/{workspace_id}/billing/checkout", response_model=CheckoutResponse)
async def create_checkout(
    workspace_id: str,
    body: CheckoutRequest,
    session: Session = Depends(require_permission("workspace:manage_billing")),
) -> CheckoutResponse:
    require_workspace_match(session, workspace_id)
    return await billing_service.create_checkout_session(
        get_db(), workspace_id=workspace_id, user_id=session.user_id, request=body
    )


@router.post("/workspaces/{workspace_id}/billing/verify-payment", response_model=SubscriptionOut)
async def verify_payment(
    workspace_id: str,
    body: VerifyPaymentRequest,
    session: Session = Depends(require_permission("workspace:manage_billing")),
) -> SubscriptionOut:
    require_workspace_match(session, workspace_id)
    return await billing_service.verify_and_activate_payment(
        get_db(), workspace_id=workspace_id, user_id=session.user_id, request=body
    )


@router.post("/workspaces/{workspace_id}/billing/cancel", response_model=SubscriptionOut)
async def cancel_subscription(
    workspace_id: str,
    body: CancelSubscriptionRequest | None = None,
    session: Session = Depends(require_permission("workspace:manage_billing")),
) -> SubscriptionOut:
    require_workspace_match(session, workspace_id)
    return await billing_service.cancel_subscription(
        get_db(),
        workspace_id=workspace_id,
        user_id=session.user_id,
        reason=body.reason if body else None,
    )


@router.post("/workspaces/{workspace_id}/billing/portal", response_model=PortalResponse)
async def customer_portal(
    workspace_id: str,
    session: Session = Depends(require_permission("workspace:manage_billing")),
) -> PortalResponse:
    require_workspace_match(session, workspace_id)
    return await billing_service.create_customer_portal_session(get_db(), workspace_id=workspace_id)


@router.get("/workspaces/{workspace_id}/billing/invoices", response_model=list[InvoiceOut])
async def list_invoices(
    workspace_id: str,
    session: Session = Depends(require_permission("workspace:view_settings")),
) -> list[InvoiceOut]:
    require_workspace_match(session, workspace_id)
    return await billing_service.list_workspace_invoices(get_db(), workspace_id)


# Gateway-to-server callbacks: no session, authenticated by the signature over the raw
# body instead, so the body must be read unparsed. Kept out of the OpenAPI schema since
# no Backline client ever calls them.


@router.post("/billing/webhooks/stripe", include_in_schema=False)
async def stripe_webhook(
    request: Request,
    stripe_signature: str | None = Header(default=None, alias="Stripe-Signature"),
) -> dict[str, str]:
    return await billing_service.handle_stripe_webhook(
        get_db(), await request.body(), stripe_signature
    )


@router.post("/billing/webhooks/razorpay", include_in_schema=False)
async def razorpay_webhook(
    request: Request,
    razorpay_signature: str | None = Header(default=None, alias="X-Razorpay-Signature"),
) -> dict[str, str]:
    return await billing_service.handle_razorpay_webhook(
        get_db(), await request.body(), razorpay_signature
    )
