import hmac
import secrets
import time
from datetime import UTC, datetime
from typing import Any

from motor.motor_asyncio import AsyncIOMotorClientSession, AsyncIOMotorDatabase
from pymongo.errors import DuplicateKeyError

from app.core.actor_access import resolve_actor_project_access
from app.core.config import get_settings
from app.core.errors import ConflictError, NotFoundError, PermissionDeniedError, ValidationError
from app.core.events import append_event
from app.core.permissions import project_role_allows
from app.core.project_access import check_project_action
from app.core.rate_limit import RateLimitedError
from app.core.redis_client import get_redis
from app.core.review_url import project_start_url, review_origin
from app.core.security import create_guest_token, generate_share_token, hash_secret
from app.core.session import GuestSession, Session
from app.core.verified_identity import require_verified_identity
from app.modules.auth.repository import UserRepository
from app.modules.branding.schemas import PublicBrandingOut
from app.modules.projects import service as project_service
from app.modules.projects.repository import ProjectRepository
from app.modules.proxy.preview_host import preview_origin_for_token
from app.modules.share_links import events as share_link_events
from app.modules.share_links.policy import check_domain_restriction, resolve_guest_display_name
from app.modules.share_links.repository import (
    CANVAS_LINK_PURPOSE,
    GuestSessionRepository,
    ShareLinkRepository,
    is_canvas_link,
)
from app.modules.share_links.schemas import (
    CanvasSessionOut,
    GuestSessionOut,
    GuestSessionStatusOut,
    ReviewResolveOut,
    ShareLinkOut,
)

# Shown wherever a canvas link is used outside the dashboard (TDR-0057).
CANVAS_LINK_ONLY_MESSAGE = (
    "This link only opens inside the Backline dashboard. Sign in to review this project, "
    "or ask the team for a client review link."
)


def _share_link_out(doc: dict[str, Any]) -> ShareLinkOut:
    return ShareLinkOut(
        id=str(doc["_id"]),
        project_id=doc["project_id"],
        token=doc["token"],
        mode=doc["mode"],
        has_passcode=doc["passcode_hash"] is not None,
        expires_at=doc["expires_at"],
        revoked_at=doc["revoked_at"],
        created_at=doc["created_at"],
        ask_reviewer_name=doc.get("ask_reviewer_name", True),
        domain_restrictions=doc.get("domain_restrictions", []),
        comment_export_permission=doc.get("comment_export_permission", False),
        preview_origin=_preview_origin(doc),
    )


def _preview_origin(link: dict[str, Any]) -> str | None:
    return preview_origin_for_token(link["token"]) if link["mode"] == "proxy" else None


# Wrong passcodes allowed per link in the window, from every address combined. The
# per-IP limit on /guest-sessions alone let a guesser spread over many addresses work
# through a 4-digit passcode in minutes; this makes that take days. Correct passcodes
# are never counted, so reviewers who type it right are unaffected.
PASSCODE_FAILURE_LIMIT = 25
PASSCODE_FAILURE_WINDOW_SECONDS = 15 * 60


def _passcode_failures_key(link: dict[str, Any]) -> str:
    return f"rate-limit:passcode-failures:{link['_id']}"


async def _require_passcode_attempts_left(link: dict[str, Any]) -> None:
    client = get_redis()
    key = _passcode_failures_key(link)
    await client.zremrangebyscore(key, 0, time.time() - PASSCODE_FAILURE_WINDOW_SECONDS)
    if await client.zcard(key) >= PASSCODE_FAILURE_LIMIT:
        raise RateLimitedError(
            "Too many wrong passcodes for this link. Wait a few minutes and try again."
        )


async def _record_passcode_failure(link: dict[str, Any]) -> None:
    client = get_redis()
    key = _passcode_failures_key(link)
    now = time.time()
    await client.zadd(key, {f"{now}:{secrets.token_hex(4)}": now})
    await client.expire(key, PASSCODE_FAILURE_WINDOW_SECONDS)


def _ensure_active(link: dict[str, Any]) -> None:
    """Shared by resolution (public) and guest-session creation - a link that's
    revoked or past its expiry is treated the same way regardless of caller."""
    if link["revoked_at"] is not None:
        raise ConflictError("This review link has been revoked.")
    if link["expires_at"] is not None and link["expires_at"] <= datetime.now(UTC):
        raise ConflictError("This review link has expired.")


async def create_initial_link(
    db: AsyncIOMotorDatabase[dict[str, Any]],
    *,
    project_id: str,
    workspace_id: str,
    actor_user_id: str,
    session: AsyncIOMotorClientSession,
) -> None:
    """Internal creation boundary: caller inserts its new project in this transaction."""
    await ShareLinkRepository(db).create(
        project_id=project_id,
        workspace_id=workspace_id,
        created_by=actor_user_id,
        token=generate_share_token(),
        mode="proxy",
        passcode_hash=None,
        expires_at=None,
        session=session,
    )
    await append_event(
        db,
        workspace_id=workspace_id,
        type=share_link_events.SHARE_LINK_CREATED,
        actor_type="member",
        actor_id=actor_user_id,
        payload={"project_id": project_id, "mode": "proxy"},
        session=session,
    )


async def create_share_link(
    db: AsyncIOMotorDatabase[dict[str, Any]],
    *,
    project_id: str,
    workspace_id: str,
    actor_user_id: str,
    mode: str,
    passcode: str | None,
    expires_at: datetime | None,
    ask_reviewer_name: bool = True,
    domain_restrictions: list[str] | None = None,
    comment_export_permission: bool = False,
) -> ShareLinkOut:
    # Raises NotFoundError if the project doesn't exist or belongs to another workspace.
    await project_service.get_project(db, project_id=project_id, workspace_id=workspace_id)

    if domain_restrictions or comment_export_permission:
        raise ValidationError("Verified reviewer domains and guest export are not available.")
    if expires_at is not None and expires_at <= datetime.now(UTC):
        raise ValidationError("Choose an expiry in the future.")

    repo = ShareLinkRepository(db)
    doc = await repo.create(
        project_id=project_id,
        workspace_id=workspace_id,
        token=generate_share_token(),
        mode=mode,
        passcode_hash=hash_secret(passcode) if passcode else None,
        expires_at=expires_at,
        created_by=actor_user_id,
        ask_reviewer_name=ask_reviewer_name,
        domain_restrictions=domain_restrictions,
        comment_export_permission=comment_export_permission,
    )
    await append_event(
        db,
        workspace_id=workspace_id,
        type=share_link_events.SHARE_LINK_CREATED,
        actor_type="member",
        actor_id=actor_user_id,
        payload={"project_id": project_id, "mode": mode},
    )
    return _share_link_out(doc)


async def list_share_links(
    db: AsyncIOMotorDatabase[dict[str, Any]], *, project_id: str, workspace_id: str
) -> list[ShareLinkOut]:
    await project_service.get_project(db, project_id=project_id, workspace_id=workspace_id)
    repo = ShareLinkRepository(db)
    docs = await repo.list_for_project(workspace_id, project_id)
    return [_share_link_out(doc) for doc in docs]


async def revoke_share_link(
    db: AsyncIOMotorDatabase[dict[str, Any]],
    *,
    share_link_id: str,
    workspace_id: str,
    actor_user_id: str,
) -> None:
    repo = ShareLinkRepository(db)
    link = await repo.find_by_id(share_link_id)
    # The canvas link isn't one of the project's client links (TDR-0057): it's never
    # listed, and revoking it would only break the team's own canvas.
    if link is None or link["workspace_id"] != workspace_id or is_canvas_link(link):
        raise NotFoundError("Share link not found.")

    await repo.revoke(share_link_id)
    await append_event(
        db,
        workspace_id=workspace_id,
        type=share_link_events.SHARE_LINK_REVOKED,
        actor_type="member",
        actor_id=actor_user_id,
        payload={"share_link_id": share_link_id},
    )


async def _review_branding(
    db: AsyncIOMotorDatabase[dict[str, Any]], workspace_id: str
) -> "PublicBrandingOut | None":
    from app.modules.branding.service import public_branding

    return await public_branding(db, workspace_id)


async def resolve_share_link(
    db: AsyncIOMotorDatabase[dict[str, Any]], token: str
) -> ReviewResolveOut:
    """Public, unauthenticated (12-API-WebSocket.md §12.3) - reports whether a
    passcode is required without ever checking one; the passcode itself is only
    verified at POST /guest-sessions (§12.7)."""
    repo = ShareLinkRepository(db)
    link = await repo.find_by_token(token)
    if link is None:
        raise NotFoundError("This review link doesn't exist.")
    _ensure_active(link)

    project = await ProjectRepository(db).find_by_id(link["project_id"])
    if project is None or project.get("archived_at"):
        raise NotFoundError("Project not found.")

    return ReviewResolveOut(
        share_link_id=str(link["_id"]),
        project_id=str(project["_id"]),
        project_name=project["name"],
        project_type=project.get("project_type", "website"),
        variant=project.get("variant"),
        branding=await _review_branding(db, project["workspace_id"]),
        mode=link["mode"],
        requires_passcode=link["passcode_hash"] is not None,
        target_origin=review_origin(project["target_origin"]),
        start_url=project_start_url(project) or None,
        ask_reviewer_name=link.get("ask_reviewer_name", True),
        show_board_to_client=project.get("settings_json", {}).get("show_board_to_client", False),
        preview_origin=_preview_origin(link),
        canvas_only=is_canvas_link(link),
        review_url=f"{get_settings().public_dashboard_base_url.rstrip('/')}/"
        if is_canvas_link(link)
        else f"{get_settings().public_dashboard_base_url.rstrip('/')}/review/{token}",
    )


async def create_guest_session(
    db: AsyncIOMotorDatabase[dict[str, Any]],
    *,
    share_token: str,
    display_name: str,
    email: str | None,
    passcode: str | None,
    ua_fingerprint: str,
    origin: str | None = None,
    referer: str | None = None,
) -> GuestSessionOut:
    repo = ShareLinkRepository(db)
    link = await repo.find_by_token(share_token)
    if link is None:
        raise NotFoundError("This review link doesn't exist.")
    _ensure_active(link)
    # TDR-0057: a canvas link's sessions are only issued to a signed-in member, through
    # create_canvas_session - never to whoever holds the token. Copying the canvas's
    # address out of the dashboard grants nothing.
    if is_canvas_link(link):
        raise PermissionDeniedError(CANVAS_LINK_ONLY_MESSAGE)
    # M-02: domain_restrictions and ask_reviewer_name enforced server-side, from the
    # request's own headers - never the client-supplied payload - before a guest
    # session is minted at all (share_links/policy.py).
    check_domain_restriction(link, origin, referer)
    resolved_name = resolve_guest_display_name(link, display_name)

    if link["passcode_hash"] is not None:
        await _require_passcode_attempts_left(link)
        supplied = hash_secret(passcode) if passcode else ""
        if not hmac.compare_digest(supplied, link["passcode_hash"]):
            await _record_passcode_failure(link)
            raise PermissionDeniedError("Incorrect passcode.")

    project = await ProjectRepository(db).find_by_id(link["project_id"])
    if project is None or project.get("archived_at"):
        raise NotFoundError("Project not found or archived.")

    guest_repo = GuestSessionRepository(db)
    guest_doc = await guest_repo.create(
        share_link_id=str(link["_id"]),
        workspace_id=link["workspace_id"],
        display_name=resolved_name,
        email=email,
        ua_fingerprint=ua_fingerprint,
    )
    await append_event(
        db,
        workspace_id=link["workspace_id"],
        type=share_link_events.GUEST_SESSION_CREATED,
        actor_type="guest",
        actor_id=str(guest_doc["_id"]),
        payload={"share_link_id": str(link["_id"]), "project_id": str(link["project_id"])},
    )

    token = create_guest_token(str(guest_doc["_id"]), str(link["_id"]))
    return GuestSessionOut(guest_session_token=token, display_name=resolved_name)


async def get_or_create_canvas_link(
    db: AsyncIOMotorDatabase[dict[str, Any]],
    *,
    workspace_id: str,
    project_id: str,
    actor_user_id: str,
) -> dict[str, Any]:
    """The project's canvas link (TDR-0057), made the first time anyone opens the
    canvas. A proxy link with no passcode, expiry or name prompt: who may use it is
    decided per member by create_canvas_session, not by the token."""
    repo = ShareLinkRepository(db)
    existing = await repo.find_canvas_link(workspace_id, project_id)
    if existing is not None:
        return existing
    try:
        return await repo.create(
            project_id=project_id,
            workspace_id=workspace_id,
            token=generate_share_token(),
            mode="proxy",
            passcode_hash=None,
            expires_at=None,
            created_by=actor_user_id,
            ask_reviewer_name=False,
            purpose=CANVAS_LINK_PURPOSE,
        )
    except DuplicateKeyError:
        # Two members opened the canvas at once; the unique index kept one link.
        raced = await repo.find_canvas_link(workspace_id, project_id)
        if raced is None:
            raise
        return raced


async def get_guest_session_status(
    db: AsyncIOMotorDatabase[dict[str, Any]], guest: GuestSession
) -> GuestSessionStatusOut:
    link = await ShareLinkRepository(db).find_by_id(guest.share_link_id)
    if link is None:
        raise NotFoundError("This review session no longer exists. Rejoin the review link.")
    await resolve_actor_project_access(db, guest, link["project_id"])
    doc = await GuestSessionRepository(db).find_by_id(guest.guest_session_id)
    if doc is None:
        raise NotFoundError("This review session no longer exists. Rejoin the review link.")
    dashboard = get_settings().public_dashboard_base_url.rstrip("/")
    member_bound = guest.member_user_id is not None
    return GuestSessionStatusOut(
        project_id=link["project_id"],
        share_link_id=guest.share_link_id,
        display_name=doc["display_name"],
        member_bound=member_bound,
        review_url=f"{dashboard}/" if member_bound else f"{dashboard}/review/{link['token']}",
    )


async def end_guest_session(db: AsyncIOMotorDatabase[dict[str, Any]], guest: GuestSession) -> None:
    # Ending one's own signed identity must work after link revoke/archive too.
    # This reveals nothing about the project or any other session.
    repo = GuestSessionRepository(db)
    doc = await repo.find_by_id(guest.guest_session_id)
    if doc is None:
        return
    if (
        doc["share_link_id"] != guest.share_link_id
        or doc.get("member_user_id") != guest.member_user_id
    ):
        raise PermissionDeniedError("This review session doesn't belong to you.")
    await repo.end(
        workspace_id=doc["workspace_id"],
        guest_session_id=guest.guest_session_id,
        share_link_id=guest.share_link_id,
    )


async def create_canvas_session(
    db: AsyncIOMotorDatabase[dict[str, Any]],
    *,
    session: Session,
    project_id: str,
    ua_fingerprint: str,
) -> CanvasSessionOut:
    """The review canvas's link and the widget's session on it, for this member
    (TDR-0057). The session carries the member's user id, so the API checks their
    current project role on everything the widget does - a viewer reads, a commenter
    comments, and removing someone from the project ends it at once."""
    workspace_id = session.workspace_id
    if workspace_id is None:
        raise PermissionDeniedError("No active workspace context.")
    project = await ProjectRepository(db).find_by_id(project_id)
    if project is None or project["workspace_id"] != workspace_id:
        raise NotFoundError("Project not found.")
    role = check_project_action(project, session, "project:view")
    if project.get("archived_at"):
        raise ConflictError("This project is archived. Restore it before reviewing.")

    link = await get_or_create_canvas_link(
        db, workspace_id=workspace_id, project_id=project_id, actor_user_id=session.user_id
    )
    user = await UserRepository(db).find_by_id(session.user_id)
    if user is None or not user.get("email_verified_at"):
        raise PermissionDeniedError("Verify your email before opening member review.")
    await require_verified_identity(db, session.user_id, issued_at=session.authenticated_at)
    display_name = ((user or {}).get("name") or (user or {}).get("email") or "Team member")[:100]

    guests = GuestSessionRepository(db)
    link_id = str(link["_id"])
    guest = await guests.find_for_member(
        workspace_id=workspace_id,
        share_link_id=link_id,
        member_user_id=session.user_id,
        verified_after=user["email_verified_at"],
    )
    if guest is None:
        guest = await guests.create(
            share_link_id=link_id,
            workspace_id=workspace_id,
            display_name=display_name,
            email=None,
            ua_fingerprint=ua_fingerprint,
            member_user_id=session.user_id,
            member_authenticated_at=session.authenticated_at,
        )
    elif guest["display_name"] != display_name:
        await guests.set_display_name(
            workspace_id=workspace_id,
            guest_session_id=str(guest["_id"]),
            display_name=display_name,
        )

    return CanvasSessionOut(
        token=link["token"],
        preview_origin=_preview_origin(link),
        guest_session_token=create_guest_token(
            str(guest["_id"]), link_id, member_user_id=session.user_id
        ),
        display_name=display_name,
        can_comment=project_role_allows("comment:create", role),
    )
