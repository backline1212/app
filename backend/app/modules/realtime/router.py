from fastapi import APIRouter, Query, WebSocket, WebSocketDisconnect
from pydantic import ValidationError

from app.core.db import get_db
from app.core.security import InvalidTokenError, decode_access_token, decode_guest_token
from app.core.session import Actor, GuestSession, Session
from app.modules.pages.repository import PageRepository
from app.modules.realtime import presence
from app.modules.realtime.manager import manager
from app.modules.realtime.pubsub import publish
from app.modules.share_links.repository import GuestSessionRepository, ShareLinkRepository

router = APIRouter(tags=["realtime"])


def _resolve_actor(token: str) -> Actor:
    """A browser WebSocket handshake can't set an Authorization header, so the same
    member JWT or guest token used everywhere else travels as a `?token=` query param
    instead (12-API-WebSocket.md §12.6). Both token kinds are signed with the same key,
    so they're told apart by shape, not by which header carried them: `decode_guest_token`
    strictly requires `scope == "guest"` plus a `share_link_id` claim a member token never
    has, so exactly one of the two decodes succeeds for any given token."""
    try:
        guest_claims = decode_guest_token(token)
        return GuestSession(
            guest_session_id=guest_claims.sub, share_link_id=guest_claims.share_link_id
        )
    except (InvalidTokenError, ValidationError):
        pass

    try:
        member_claims = decode_access_token(token)
    except (InvalidTokenError, ValidationError) as exc:
        raise InvalidTokenError("Invalid token.") from exc
    return Session(
        user_id=member_claims.sub, workspace_id=member_claims.workspace_id, role=member_claims.role
    )


@router.websocket("/ws")
async def websocket_endpoint(
    websocket: WebSocket,
    token: str = Query(...),
    page_id: str | None = Query(default=None),
) -> None:
    try:
        actor = _resolve_actor(token)
    except InvalidTokenError:
        await websocket.close(code=4401)
        return

    db = get_db()

    guest_project_id: str | None = None
    if isinstance(actor, Session):
        if actor.workspace_id is None:
            await websocket.close(code=4403)
            return
        channel = f"workspace:{actor.workspace_id}:all"
        workspace_id = actor.workspace_id
        presence_display_name = actor.user_id
    else:
        link = await ShareLinkRepository(db).find_by_id(actor.share_link_id)
        if link is None or link["revoked_at"] is not None:
            await websocket.close(code=4403)
            return
        channel = f"project:{link['project_id']}:client"
        workspace_id = link["workspace_id"]
        guest_project_id = link["project_id"]
        guest_repo = GuestSessionRepository(db)
        guest_doc = await guest_repo.find_by_id(actor.guest_session_id)
        if (
            guest_doc is None
            or guest_doc["workspace_id"] != workspace_id
            or guest_doc["share_link_id"] != actor.share_link_id
        ):
            await websocket.close(code=4403)
            return
        await guest_repo.touch_last_seen(
            workspace_id=workspace_id, guest_session_id=actor.guest_session_id
        )
        presence_display_name = guest_doc["display_name"]

    # A caller-supplied page_id isn't otherwise validated as belonging to this actor's
    # workspace/project before being used to key presence and broadcast on the
    # workspace's own channel - without this, a member or guest could spoof
    # presence for a foreign page_id into their own workspace's presence feed.
    if page_id is not None:
        page = await PageRepository(db).find_by_id(page_id)
        page_valid = (
            page is not None
            and page["workspace_id"] == workspace_id
            and (guest_project_id is None or page["project_id"] == guest_project_id)
        )
        if not page_valid:
            page_id = None

    await manager.connect(channel, websocket)

    presence_key = f"{channel}:{id(websocket)}"
    if page_id is not None:
        await presence.mark_present(page_id, presence_key, presence_display_name)
        await publish(
            f"workspace:{workspace_id}:all",
            event_type="presence.updated",
            workspace_id=workspace_id,
            payload={"page_id": page_id, "active_sessions": await presence.list_present(page_id)},
        )

    try:
        while True:
            # Dashboard/widget clients don't send anything over this connection today -
            # receiving is just how the endpoint notices a disconnect (WebSocketDisconnect)
            # without a busy-poll loop.
            await websocket.receive_text()
    except WebSocketDisconnect:
        pass
    finally:
        manager.disconnect(channel, websocket)
        if page_id is not None:
            await presence.mark_absent(page_id, presence_key)
            await publish(
                f"workspace:{workspace_id}:all",
                event_type="presence.updated",
                workspace_id=workspace_id,
                payload={
                    "page_id": page_id,
                    "active_sessions": await presence.list_present(page_id),
                },
            )
