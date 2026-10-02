import hashlib

from fastapi import APIRouter, Depends, Request

from app.core.config import get_settings
from app.core.db import get_db
from app.core.errors import ValidationError
from app.core.permissions import require_project_permission
from app.core.rate_limit import check_rate_limit, get_client_ip
from app.core.redis_client import get_redis
from app.core.session import Session, require_workspace_context
from app.modules.share_links import service as share_link_service
from app.modules.share_links.schemas import (
    GuestSessionCreate,
    GuestSessionOut,
    ReviewResolveOut,
    ShareLinkCreate,
    ShareLinkOut,
)

router = APIRouter(tags=["share-links"])


@router.get("/projects/{project_id}/share-links", response_model=list[ShareLinkOut])
async def list_share_links(
    project_id: str,
    # Viewers too (TDR-0056): the review canvas loads the site through the active
    # proxy link. Creating and revoking links stays with editors and managers.
    session: Session = Depends(require_project_permission("project:view")),
) -> list[ShareLinkOut]:
    return await share_link_service.list_share_links(
        get_db(), project_id=project_id, workspace_id=require_workspace_context(session)
    )


@router.post("/projects/{project_id}/share-links", response_model=ShareLinkOut, status_code=201)
async def create_share_link(
    project_id: str,
    body: ShareLinkCreate,
    session: Session = Depends(require_project_permission("share_link:manage")),
) -> ShareLinkOut:
    return await share_link_service.create_share_link(
        get_db(),
        project_id=project_id,
        workspace_id=require_workspace_context(session),
        actor_user_id=session.user_id,
        mode=body.mode,
        passcode=body.passcode,
        expires_at=body.expires_at,
        ask_reviewer_name=body.ask_reviewer_name,
        domain_restrictions=body.domain_restrictions,
        comment_export_permission=body.comment_export_permission,
    )


@router.patch("/share-links/{share_link_id}/revoke", status_code=204)
async def revoke_share_link(
    share_link_id: str,
    session: Session = Depends(require_project_permission("share_link:manage")),
) -> None:
    await share_link_service.revoke_share_link(
        get_db(),
        share_link_id=share_link_id,
        workspace_id=require_workspace_context(session),
        actor_user_id=session.user_id,
    )


@router.get("/review/{share_token}", response_model=ReviewResolveOut)
async def resolve_share_link(share_token: str, request: Request) -> ReviewResolveOut:
    settings = get_settings()
    await check_rate_limit(
        get_redis(),
        key=f"rate-limit:review:{get_client_ip(request)}",
        limit=settings.review_resolve_rate_limit_per_minute,
        window_seconds=60,
    )
    return await share_link_service.resolve_share_link(get_db(), share_token)


@router.post("/guest-sessions", response_model=GuestSessionOut, status_code=201)
async def create_guest_session(body: GuestSessionCreate, request: Request) -> GuestSessionOut:
    settings = get_settings()
    await check_rate_limit(
        get_redis(),
        key=f"rate-limit:guest-session:{get_client_ip(request)}",
        limit=settings.guest_session_rate_limit_per_minute,
        window_seconds=60,
    )

    user_agent = request.headers.get("user-agent")
    if not user_agent:
        raise ValidationError("Missing User-Agent header.")
    ua_fingerprint = hashlib.sha256(user_agent.encode()).hexdigest()

    return await share_link_service.create_guest_session(
        get_db(),
        share_token=body.share_token,
        display_name=body.display_name,
        email=body.email,
        passcode=body.passcode,
        ua_fingerprint=ua_fingerprint,
        # M-02: read directly from the request the browser actually sent - never a
        # client-payload field a guest could freely spoof.
        origin=request.headers.get("origin"),
        referer=request.headers.get("referer"),
    )
