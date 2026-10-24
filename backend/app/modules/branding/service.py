"""Workspace branding, white-label review portals and custom review domains.

Branding (name, colour, logo, support email) and custom domains are Team plan and
above; hiding Backline's own branding from client review pages is Enterprise. All of it
only changes what *clients* see on review links - the team dashboard is unchanged."""

import secrets
from datetime import UTC, datetime
from typing import Any

import httpx
from motor.motor_asyncio import AsyncIOMotorDatabase

from app.core.config import get_settings
from app.core.errors import NotFoundError, PlanLimitExceededError, ValidationError
from app.modules.billing.plans import effective_plan_id, get_plan_definition
from app.modules.branding.repository import CustomDomainRepository
from app.modules.branding.schemas import (
    BrandingOut,
    BrandingUpdate,
    CustomDomainOut,
    PublicBrandingOut,
)
from app.modules.storage.r2_client import generate_presigned_get, upload_bytes
from app.modules.workspaces.repository import WorkspaceRepository

_BRANDING_PLANS = {"team", "enterprise"}
_WHITE_LABEL_PLANS = {"enterprise"}
_LOGO_TYPES = {"image/png": "png", "image/jpeg": "jpg", "image/webp": "webp"}
MAX_LOGO_BYTES = 512 * 1024
TXT_PREFIX = "_backline-verify"


def _entitlements(workspace: dict[str, Any]) -> tuple[bool, bool, str]:
    plan_id = effective_plan_id(workspace)
    return plan_id in _BRANDING_PLANS, plan_id in _WHITE_LABEL_PLANS, plan_id


def _plan_error(plan_id: str, feature: str, needed: str) -> PlanLimitExceededError:
    plan = get_plan_definition(plan_id)
    return PlanLimitExceededError(
        f"{feature} is part of the {needed} plan. {plan['name']} doesn't include it.",
        details={
            "resource": "branding",
            "plan_id": plan_id,
            "upgrade_plan_id": "team" if needed == "Team" else "enterprise",
        },
    )


async def _workspace(db: AsyncIOMotorDatabase[dict[str, Any]], workspace_id: str) -> dict[str, Any]:
    workspace = await WorkspaceRepository(db).find_by_id(workspace_id)
    if workspace is None:
        raise NotFoundError("Workspace not found.")
    return workspace


async def public_branding(
    db: AsyncIOMotorDatabase[dict[str, Any]], workspace_id: str
) -> PublicBrandingOut | None:
    """Branding for a client-facing review page, or None when the workspace has none
    (or its plan no longer includes it - a lapsed plan falls back to Backline's look)."""
    workspace = await WorkspaceRepository(db).find_by_id(workspace_id)
    if workspace is None:
        return None
    can_customize, can_white_label, _ = _entitlements(workspace)
    branding = workspace.get("branding") or {}
    if not can_customize or not branding:
        return None
    logo_key = branding.get("logo_key")
    return PublicBrandingOut(
        display_name=branding.get("display_name") or None,
        accent_color=branding.get("accent_color") or None,
        logo_url=await generate_presigned_get(logo_key) if logo_key else None,
        hide_backline_branding=bool(branding.get("hide_backline_branding")) and can_white_label,
        support_email=branding.get("support_email") or None,
    )


async def review_domain(db: AsyncIOMotorDatabase[dict[str, Any]], workspace_id: str) -> str | None:
    for doc in await CustomDomainRepository(db).list_for_workspace(workspace_id):
        if doc["status"] == "verified" and doc.get("connected"):
            return str(doc["host"])
    return None


async def get_branding(db: AsyncIOMotorDatabase[dict[str, Any]], workspace_id: str) -> BrandingOut:
    workspace = await _workspace(db, workspace_id)
    can_customize, can_white_label, _ = _entitlements(workspace)
    branding = workspace.get("branding") or {}
    logo_key = branding.get("logo_key")
    return BrandingOut(
        display_name=branding.get("display_name") or None,
        accent_color=branding.get("accent_color") or None,
        logo_url=await generate_presigned_get(logo_key) if logo_key else None,
        hide_backline_branding=bool(branding.get("hide_backline_branding")),
        support_email=branding.get("support_email") or None,
        can_customize=can_customize,
        can_white_label=can_white_label,
        can_use_custom_domain=can_customize,
        review_domain=await review_domain(db, workspace_id) if can_customize else None,
    )


async def update_branding(
    db: AsyncIOMotorDatabase[dict[str, Any]], workspace_id: str, body: BrandingUpdate
) -> BrandingOut:
    workspace = await _workspace(db, workspace_id)
    can_customize, can_white_label, plan_id = _entitlements(workspace)
    if not can_customize:
        raise _plan_error(plan_id, "Custom branding", "Team")
    if body.hide_backline_branding and not can_white_label:
        raise _plan_error(plan_id, "White-label client portals", "Enterprise")
    patch: dict[str, Any] = {}
    if body.display_name is not None:
        patch["branding.display_name"] = body.display_name.strip() or None
    if body.accent_color is not None:
        patch["branding.accent_color"] = body.accent_color or None
    if body.support_email is not None:
        patch["branding.support_email"] = body.support_email or None
    if body.hide_backline_branding is not None:
        patch["branding.hide_backline_branding"] = body.hide_backline_branding
    if body.remove_logo:
        patch["branding.logo_key"] = None
    if patch:
        await WorkspaceRepository(db).set_fields(workspace_id, patch)
    return await get_branding(db, workspace_id)


async def upload_logo(
    db: AsyncIOMotorDatabase[dict[str, Any]], workspace_id: str, content_type: str, data: bytes
) -> BrandingOut:
    workspace = await _workspace(db, workspace_id)
    can_customize, _, plan_id = _entitlements(workspace)
    if not can_customize:
        raise _plan_error(plan_id, "Custom branding", "Team")
    extension = _LOGO_TYPES.get(content_type)
    if extension is None:
        raise ValidationError("Use a PNG, JPG or WebP logo.")
    if not data or len(data) > MAX_LOGO_BYTES:
        raise ValidationError("Logos must be smaller than 512 KB.")
    # Tiny and one per workspace, so it isn't counted against project storage quota.
    key = f"branding/{workspace_id}/logo-{secrets.token_hex(8)}.{extension}"
    await upload_bytes(key, data, content_type)
    await WorkspaceRepository(db).set_fields(workspace_id, {"branding.logo_key": key})
    return await get_branding(db, workspace_id)


def _domain_out(doc: dict[str, Any]) -> CustomDomainOut:
    return CustomDomainOut(
        id=str(doc["_id"]),
        host=doc["host"],
        status=doc["status"],
        txt_name=f"{TXT_PREFIX}.{doc['host']}",
        txt_value=f"backline-verify={doc['verification_token']}",
        cname_target=get_settings().custom_domain_cname_target,
        connected=bool(doc.get("connected")),
        last_error=doc.get("last_error"),
        verified_at=doc.get("verified_at"),
        created_at=doc["created_at"],
    )


async def list_domains(
    db: AsyncIOMotorDatabase[dict[str, Any]], workspace_id: str
) -> list[CustomDomainOut]:
    return [
        _domain_out(doc)
        for doc in await CustomDomainRepository(db).list_for_workspace(workspace_id)
    ]


async def add_domain(
    db: AsyncIOMotorDatabase[dict[str, Any]], workspace_id: str, host: str, actor_id: str
) -> CustomDomainOut:
    workspace = await _workspace(db, workspace_id)
    can_customize, _, plan_id = _entitlements(workspace)
    if not can_customize:
        raise _plan_error(plan_id, "Custom domains", "Team")
    settings = get_settings()
    reserved = {
        host_of(settings.public_dashboard_base_url),
        *(host_of(origin) for origin in settings.cors_allow_origins),
    }
    if host in reserved or (
        settings.proxy_preview_domain and host.endswith(settings.proxy_preview_domain)
    ):
        raise ValidationError("That domain belongs to Backline itself.")
    if len(await CustomDomainRepository(db).list_for_workspace(workspace_id)) >= 5:
        raise ValidationError("A workspace can add up to 5 review domains.")
    doc = await CustomDomainRepository(db).create(
        workspace_id, host, secrets.token_urlsafe(18), actor_id
    )
    return _domain_out(doc)


def host_of(url: str) -> str:
    return httpx.URL(url).host if "://" in url else url


async def _txt_records(name: str) -> list[str]:
    """TXT lookup over DNS-over-HTTPS, so no resolver library or UDP egress is needed."""
    async with httpx.AsyncClient(timeout=8.0) as client:
        response = await client.get(
            "https://cloudflare-dns.com/dns-query",
            params={"name": name, "type": "TXT"},
            headers={"accept": "application/dns-json"},
        )
    response.raise_for_status()
    return [
        str(answer.get("data", "")).strip('"')
        for answer in response.json().get("Answer", [])
        if answer.get("type") == 16
    ]


async def _attach_to_web_project(host: str) -> tuple[bool, str | None]:
    """Adds the domain to the Vercel web project when the API is configured to."""
    settings = get_settings()
    if not settings.vercel_api_token or not settings.vercel_project_id:
        return (
            False,
            "Verified. An administrator still needs to connect this domain to the review portal.",
        )
    params = {"teamId": settings.vercel_team_id} if settings.vercel_team_id else {}
    try:
        async with httpx.AsyncClient(timeout=15.0) as client:
            response = await client.post(
                f"https://api.vercel.com/v10/projects/{settings.vercel_project_id}/domains",
                params=params,
                headers={"Authorization": f"Bearer {settings.vercel_api_token}"},
                json={"name": host},
            )
    except httpx.HTTPError as exc:
        return False, f"Verified, but connecting the domain failed: {exc}"
    if response.status_code in (200, 201) or (
        response.status_code == 409 and "already" in response.text.lower()
    ):
        return True, None
    return False, f"Verified, but connecting the domain failed ({response.status_code})."


async def verify_domain(
    db: AsyncIOMotorDatabase[dict[str, Any]], workspace_id: str, domain_id: str
) -> CustomDomainOut:
    repo = CustomDomainRepository(db)
    doc = await repo.find(workspace_id, domain_id)
    if doc is None:
        raise NotFoundError("Domain not found.")
    expected = f"backline-verify={doc['verification_token']}"
    now = datetime.now(UTC)
    try:
        records = await _txt_records(f"{TXT_PREFIX}.{doc['host']}")
    except (httpx.HTTPError, ValueError) as exc:
        await repo.update(
            workspace_id,
            domain_id,
            {"last_error": f"DNS lookup failed: {exc}", "last_checked_at": now},
        )
        return _domain_out({**doc, "last_error": f"DNS lookup failed: {exc}"})
    if expected not in records:
        pending: dict[str, Any] = {
            "status": "pending" if doc["status"] != "verified" else "verified",
            "last_error": "The TXT record wasn't found yet. DNS changes can take a while.",
            "last_checked_at": now,
        }
        await repo.update(workspace_id, domain_id, pending)
        return _domain_out({**doc, **pending})
    connected, note = (
        (True, None) if doc.get("connected") else await _attach_to_web_project(doc["host"])
    )
    patch: dict[str, Any] = {
        "status": "verified",
        "verified_at": doc.get("verified_at") or now,
        "connected": connected,
        "last_error": note,
        "last_checked_at": now,
    }
    await repo.update(workspace_id, domain_id, patch)
    return _domain_out({**doc, **patch})


async def remove_domain(
    db: AsyncIOMotorDatabase[dict[str, Any]], workspace_id: str, domain_id: str
) -> None:
    if not await CustomDomainRepository(db).delete(workspace_id, domain_id):
        raise NotFoundError("Domain not found.")


async def branding_for_host(
    db: AsyncIOMotorDatabase[dict[str, Any]], host: str
) -> PublicBrandingOut | None:
    doc = await CustomDomainRepository(db).find_verified_by_host(host.lower())
    if doc is None:
        return None
    return await public_branding(db, doc["workspace_id"])
