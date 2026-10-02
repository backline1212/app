"""Cloud login browser (docs/tdr/0042): a real, server-side Chromium a member drives
interactively (streamed over the websocket in `app/cloud_login_app.py`, a separate
deployable that - unlike the main API - has Playwright's browser binaries installed,
mirroring `browser_render`'s own reasoning for keeping them out of the API image).

For a reviewer without the Backline extension installed, or a site whose sign-in is
device/IP-bound so a session synced from elsewhere would be rejected anyway: this gives
them a real browser at the *proxy's own* egress IP, so whatever session it ends up with
matches the IP every later proxied request will also come from. On finish, the captured
cookies/localStorage are hand off through the exact same one-time-ticket pipeline
TDR-0041 built for the extension (`session_sync.service.create_ticket`) - this module
only adds how that payload gets captured, not a second way to carry it."""

import json
import secrets
import uuid
from dataclasses import dataclass
from typing import Any

import redis.asyncio as redis
from motor.motor_asyncio import AsyncIOMotorDatabase

from app.core.config import get_settings
from app.core.errors import BacklineError, NotFoundError, ValidationError
from app.modules.cloud_login.schemas import CloudLoginSessionOut
from app.modules.projects.repository import ProjectRepository
from app.modules.proxy.preview_host import preview_domain

_TICKET_PREFIX = "cloud_login_ticket:"
# Just long enough for the member to see the modal open and the websocket connect - not
# how long the browser session itself runs (session_ttl_seconds, below).
_TICKET_TTL_SECONDS = 120

_SLOT_PREFIX = "cloud_login_slot:"


class CloudLoginBusyError(BacklineError):
    """Every concurrent browser slot is in use. Distinct from a real launch failure -
    same reasoning as ai/key_pool.py's AIServiceBusyError."""

    code = "CLOUD_LOGIN_BUSY"
    status_code = 503


def _redis_key(ticket: str) -> str:
    return _TICKET_PREFIX + ticket


async def create_session_ticket(
    db: AsyncIOMotorDatabase[dict[str, Any]],
    redis_client: redis.Redis,
    *,
    workspace_id: str,
    project_id: str,
) -> CloudLoginSessionOut:
    settings = get_settings()
    if not settings.cloud_login_ws_url:
        raise ValidationError(
            "The cloud login browser isn't deployed for this environment "
            "(CLOUD_LOGIN_WS_URL is unset) - docs/tdr/0042."
        )

    project = await ProjectRepository(db).find_by_id(project_id)
    if project is None or project["workspace_id"] != workspace_id:
        raise NotFoundError("Project not found.")

    # The captured session lands on the canvas link (TDR-0057) - see session_sync.
    if not preview_domain():
        # Same requirement session_sync.create_ticket enforces (TDR-0041) - checked here
        # too, so a member sees this before opening a browser session, not after.
        raise ValidationError(
            "This deployment needs PROXY_PREVIEW_DOMAIN configured before a signed-in "
            "session (from any source) can be carried into the canvas - docs/tdr/0040."
        )

    ticket = secrets.token_urlsafe(24)
    payload = json.dumps(
        {
            "workspace_id": workspace_id,
            "project_id": project_id,
            "target_origin": project["target_origin"],
        }
    )
    await redis_client.set(_redis_key(ticket), payload, ex=_TICKET_TTL_SECONDS)
    return CloudLoginSessionOut(
        ws_url=f"{settings.cloud_login_ws_url}?ticket={ticket}",
        ticket_ttl_seconds=_TICKET_TTL_SECONDS,
        session_ttl_seconds=settings.cloud_login_session_ttl_seconds,
    )


@dataclass(frozen=True)
class CloudLoginTarget:
    workspace_id: str
    project_id: str
    target_origin: str


async def redeem_session_ticket(
    redis_client: redis.Redis, *, ticket: str
) -> CloudLoginTarget | None:
    """Called once, by the cloud-login-browser service itself, the instant a websocket
    connects - one-time, same reasoning as session_sync's own ticket (a stolen URL must
    not be replayable once the real session has already started)."""
    key = _redis_key(ticket)
    raw = await redis_client.get(key)
    if raw is None:
        return None
    await redis_client.delete(key)
    payload = json.loads(raw)
    return CloudLoginTarget(
        workspace_id=payload["workspace_id"],
        project_id=payload["project_id"],
        target_origin=payload["target_origin"],
    )


@dataclass(frozen=True)
class SlotLease:
    owner: str
    index: int


async def acquire_slot(redis_client: redis.Redis) -> SlotLease | None:
    """Claims the first free browser slot, atomically per slot (`SET NX`) - the ceiling
    on how many real Chromium instances this deployment ever runs at once, regardless of
    how many members click the button simultaneously. `ex` is a safety net: the normal
    path releases the instant the session ends, so a slot is only actually held for the
    duration of one real session unless the process dies mid-session."""
    settings = get_settings()
    owner = uuid.uuid4().hex
    for index in range(settings.cloud_login_max_concurrent_sessions):
        claimed = await redis_client.set(
            f"{_SLOT_PREFIX}{index}",
            owner,
            nx=True,
            ex=settings.cloud_login_session_ttl_seconds + 30,
        )
        if claimed:
            return SlotLease(owner=owner, index=index)
    return None


async def release_slot(redis_client: redis.Redis, lease: SlotLease) -> None:
    key = f"{_SLOT_PREFIX}{lease.index}"
    current = await redis_client.get(key)
    if current is not None and current.decode() == lease.owner:
        await redis_client.delete(key)
