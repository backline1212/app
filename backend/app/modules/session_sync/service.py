"""Carries a member's own real, signed-in session for a site into that project's proxy
canvas (docs/tdr/0041). The Backline browser extension reads cookies (HttpOnly included,
via `chrome.cookies`) and localStorage from the member's own tab - the one place a
server-side proxy fetch or the page's own script can never see them - and posts them here
to mint a one-time ticket. The extension then opens (or fetches) the ticket's `redeem_url`
on the review link's own preview origin (docs/tdr/0040): that write happens in the same
browser, under the reviewed site's real origin, which is what lets it land in the browser's
actual cookie jar and localStorage for that origin - the canvas iframe, being the same
origin, picks it up on its very next load."""

import json
import secrets
from dataclasses import dataclass
from datetime import UTC, datetime
from email.utils import format_datetime
from typing import Any

import redis.asyncio as redis
from motor.motor_asyncio import AsyncIOMotorDatabase

from app.core.errors import ConflictError, NotFoundError, ValidationError
from app.modules.projects.repository import ProjectRepository
from app.modules.proxy.preview_host import preview_cookies_can_be_secure, preview_origin_for_token
from app.modules.session_sync.schemas import SessionSyncCreate, SessionSyncTicketOut
from app.modules.share_links.repository import ShareLinkRepository

_TICKET_PREFIX = "session_sync:"
# Generous enough for the extension's own "open a background tab, wait for it to
# navigate, close it" round trip; short enough that a ticket nobody redeemed (the member
# closed the popup, went offline) can't be replayed much later. One-time regardless -
# redeem_ticket deletes it the instant it's read, valid or not.
_TICKET_TTL_SECONDS = 300


def _redis_key(ticket: str) -> str:
    return _TICKET_PREFIX + ticket


async def create_ticket(
    db: AsyncIOMotorDatabase[dict[str, Any]],
    redis_client: redis.Redis,
    *,
    workspace_id: str,
    project_id: str,
    body: SessionSyncCreate,
) -> SessionSyncTicketOut:
    project = await ProjectRepository(db).find_by_id(project_id)
    if project is None or project["workspace_id"] != workspace_id:
        raise NotFoundError("Project not found.")

    links = await ShareLinkRepository(db).list_for_project(workspace_id, project_id)
    link = next(
        (link for link in links if link["mode"] == "proxy" and link["revoked_at"] is None), None
    )
    if link is None:
        raise NotFoundError("This project has no active review link to sync a session into.")
    if link.get("expires_at") and link["expires_at"] <= datetime.now(UTC):
        raise ConflictError("This project's review link has expired.")

    origin = preview_origin_for_token(link["token"])
    if origin is None:
        # The legacy `/proxy/{token}/` path mode renames every cookie (blp_{token}_...)
        # so a site's own script can never find its real ones by name - carrying a
        # session there would mean either breaking that isolation (letting a reviewed
        # site's cookies land on Backline's own API domain) or silently doing nothing.
        # Neither is acceptable, so this is refused outright rather than degraded.
        raise ValidationError(
            "Session sync needs this deployment's PROXY_PREVIEW_DOMAIN configured "
            "(docs/tdr/0040) - without a link's own preview origin, cookies can't be "
            "carried under their real names."
        )

    ticket = secrets.token_urlsafe(24)
    payload = json.dumps(
        {
            "project_id": project_id,
            "cookies": [cookie.model_dump() for cookie in body.cookies],
            "local_storage": [item.model_dump() for item in body.local_storage],
        }
    )
    await redis_client.set(_redis_key(ticket), payload, ex=_TICKET_TTL_SECONDS)
    return SessionSyncTicketOut(redeem_url=f"{origin}/__backline/session-sync?ticket={ticket}")


@dataclass(frozen=True)
class SessionSyncRedeemResult:
    html: str
    set_cookies: tuple[str, ...]


def _js_string(value: str) -> str:
    """Same escaping as proxy/interceptor.py's `_js_string` - a value embedded inside an
    inline `<script>` block must not be able to close the tag or smuggle a JS line
    terminator a site's own cookie/localStorage values could plausibly contain."""
    return (
        json.dumps(value)
        .replace("<", "\\u003c")
        .replace(">", "\\u003e")
        .replace("&", "\\u0026")
        .replace(" ", "\\u2028")
        .replace(" ", "\\u2029")
    )


def _cookie_header(cookie: dict[str, Any]) -> str:
    """Same attributes the preview-origin Set-Cookie relay uses (proxy/service.py's
    `_preview_set_cookies`) - real name, no Domain (this origin belongs to one link),
    `Secure; SameSite=None; Partitioned` so it survives the cross-site canvas iframe."""
    parts = [f"{cookie['name']}={cookie['value']}", f"Path={cookie.get('path') or '/'}"]
    expires = cookie.get("expires")
    if expires:
        expires_at = datetime.fromtimestamp(expires, UTC)
        parts.append(f"Expires={format_datetime(expires_at, usegmt=True)}")
    if cookie.get("http_only"):
        parts.append("HttpOnly")
    if preview_cookies_can_be_secure():
        parts.extend(["Secure", "SameSite=None", "Partitioned"])
    else:
        parts.append("SameSite=Lax")
    return "; ".join(parts)


async def redeem_ticket(
    db: AsyncIOMotorDatabase[dict[str, Any]],
    redis_client: redis.Redis,
    *,
    share_token: str,
    ticket: str,
    preview_host: bool,
) -> SessionSyncRedeemResult:
    if not preview_host:
        raise ValidationError("Session sync only applies on a review link's own preview origin.")
    link = await ShareLinkRepository(db).find_by_token(share_token)
    if link is None:
        raise NotFoundError("This review link doesn't exist.")

    key = _redis_key(ticket)
    raw = await redis_client.get(key)
    if raw is None:
        raise NotFoundError("This sync link has expired or was already used.")
    await redis_client.delete(key)

    payload = json.loads(raw)
    if payload.get("project_id") != link["project_id"]:
        raise ValidationError("This sync link doesn't match the review link it was opened on.")

    set_cookies = tuple(_cookie_header(cookie) for cookie in payload["cookies"])
    local_storage_js = "\n".join(
        f"try{{localStorage.setItem({_js_string(item['key'])},{_js_string(item['value'])});}}"
        "catch(e){}"
        for item in payload["local_storage"]
    )
    html = (
        '<!doctype html><meta charset="utf-8"><title>Syncing…</title>'
        f'<script>{local_storage_js}\nlocation.replace("/");</script>'
        "Signing you in…"
    )
    return SessionSyncRedeemResult(html=html, set_cookies=set_cookies)
