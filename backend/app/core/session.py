from dataclasses import dataclass

from fastapi import Depends, Header
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer

from app.core.errors import AuthenticationError, PermissionDeniedError
from app.core.events import ActorType
from app.core.security import (
    InvalidTokenError,
    decode_access_token,
    decode_guest_token,
    hash_secret,
)

bearer_scheme = HTTPBearer(auto_error=False)


@dataclass(frozen=True)
class Session:
    """Resolved from either a member's access JWT (13-Authentication.md §13.3) or a
    long-lived "Connect Extension" token (extension_tokens module) - the latter has
    no login family, so `sid` stays None and its own `revoked_at` check in
    _resolve_extension_session substitutes for validate_member_session's
    family_is_active check below."""

    user_id: str
    workspace_id: str | None
    role: str | None
    sid: str | None = None


@dataclass(frozen=True)
class GuestSession:
    """Resolved from the `X-Guest-Session` header (13-Authentication.md §13.4). Scoped
    to exactly one share_link_id - endpoints that accept guests must check the guest's
    share_link_id against the resource being accessed, the same way member endpoints
    check workspace_id (require_workspace_match)."""

    guest_session_id: str
    share_link_id: str


async def get_current_session(
    credentials: HTTPAuthorizationCredentials | None = Depends(bearer_scheme),
) -> Session:
    if credentials is None:
        raise AuthenticationError("Authentication required.")
    try:
        claims = decode_access_token(credentials.credentials)
    except InvalidTokenError:
        # Not a member access JWT - falls through to the extension-token path rather
        # than failing immediately, since both share the same Authorization: Bearer
        # header (there's no separate header to route on, unlike X-Guest-Session).
        # This keeps every existing member-only endpoint (comments, pages, projects)
        # working unchanged for a "Connect Extension" token with zero per-route edits.
        return await _resolve_extension_session(credentials.credentials)

    session = Session(
        user_id=claims.sub, workspace_id=claims.workspace_id, role=claims.role, sid=claims.sid
    )
    await validate_member_session(session)
    return session


async def _resolve_extension_session(token: str) -> Session:
    from app.core.db import get_db
    from app.modules.extension_tokens.repository import ExtensionTokenRepository
    from app.modules.workspaces.repository import MembershipRepository

    doc = await ExtensionTokenRepository(get_db()).find_by_hash(hash_secret(token))
    if doc is None or doc["revoked_at"] is not None:
        raise AuthenticationError("Invalid or expired token.")

    user_id = str(doc["user_id"])
    # Same role-drift guard validate_member_session applies to JWTs (below): a token
    # minted while the member was, say, an admin must stop authorizing the instant
    # they're demoted or removed, not just once the token itself expires.
    member = await MembershipRepository(get_db()).find(
        workspace_id=doc["workspace_id"], user_id=user_id
    )
    if member is None or member["role"] != doc["role"]:
        raise PermissionDeniedError("Workspace access changed. Reconnect the extension.")

    await ExtensionTokenRepository(get_db()).touch_last_used(doc["_id"])
    return Session(user_id=user_id, workspace_id=doc["workspace_id"], role=doc["role"], sid=None)


async def get_guest_session(
    x_guest_session: str | None = Header(default=None),
) -> GuestSession:
    if x_guest_session is None:
        raise AuthenticationError("Missing X-Guest-Session header.")
    try:
        claims = decode_guest_token(x_guest_session)
    except InvalidTokenError as exc:
        raise AuthenticationError("Invalid or expired guest session.") from exc

    return GuestSession(guest_session_id=claims.sub, share_link_id=claims.share_link_id)


Actor = Session | GuestSession
"""06-Backend-Architecture.md §6.3: `get_current_session` "resolves either a member JWT
or a guest share-link token into a unified Session object." Kept as a union of the two
existing dataclasses rather than one merged type with a pile of Optional fields - callers
that need to branch do so with isinstance(), and each branch gets a fully-typed, non-Optional
view of exactly the fields that variant actually has."""


async def get_current_actor(
    credentials: HTTPAuthorizationCredentials | None = Depends(bearer_scheme),
    x_guest_session: str | None = Header(default=None),
) -> Actor:
    """Used only by endpoints explicitly documented as "member or guest" (12-API-WebSocket.md
    §12.3/§12.4 - pages, snapshots, uploads, comments). Endpoints that are member-only keep
    using get_current_session directly, so a guest token can never reach them by accident."""
    if credentials is not None:
        return await get_current_session(credentials)
    if x_guest_session is not None:
        return await get_guest_session(x_guest_session)
    raise AuthenticationError("Authentication required.")


def require_workspace_match(session: Session, workspace_id: str) -> None:
    """Cross-tenant guarantee (03-System-Architecture.md §3.5): a session token scoped
    to workspace A can never authorize access to workspace B's resources."""
    if session.workspace_id != workspace_id:
        raise PermissionDeniedError("Session is not scoped to this workspace.")


def require_workspace_context(session: Session) -> str:
    """For routes scoped by resource id rather than a `{workspace_id}` path param
    (e.g. `/projects/{project_id}`): `require_permission()` already guarantees
    `session.role` is set, which is only ever issued together with `workspace_id`
    (13-Authentication.md §13.3) - this narrows the type and fails loudly if that
    invariant is ever violated, rather than silently comparing against an empty string."""
    if session.workspace_id is None:
        raise PermissionDeniedError("No active workspace context.")
    return session.workspace_id


def require_share_link_match(guest: GuestSession, share_link_id: str) -> None:
    """Same cross-tenant guarantee, guest side: a guest token from Project A's link is
    rejected by any endpoint resolving Project B's resources (13-Authentication.md §13.4)."""
    if guest.share_link_id != share_link_id:
        raise PermissionDeniedError("Guest session is not scoped to this share link.")


def actor_identity(actor: Actor) -> tuple[ActorType, str]:
    """(actor_type, actor_id) for the events audit log (06-Backend-Architecture.md §6.6),
    which distinguishes "member" vs "guest" actors."""
    if isinstance(actor, Session):
        return "member", actor.user_id
    return "guest", actor.guest_session_id


async def validate_member_session(session: Session) -> None:
    # New tokens retain their login family through refresh and workspace switching.
    # Legacy tokens keep their existing short access-token lifetime during rollout.
    from app.core.db import get_db
    from app.modules.auth.repository import RefreshTokenRepository
    from app.modules.workspaces.repository import MembershipRepository

    if session.sid and not await RefreshTokenRepository(get_db()).family_is_active(
        session.user_id, session.sid
    ):
        raise AuthenticationError("This session has been signed out.")
    if session.workspace_id:
        member = await MembershipRepository(get_db()).find(
            workspace_id=session.workspace_id, user_id=session.user_id
        )
        if member is None or member["role"] != session.role:
            raise PermissionDeniedError("Workspace access changed. Reopen the workspace.")
