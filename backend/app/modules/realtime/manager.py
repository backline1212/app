import logging
from collections import defaultdict
from collections.abc import Awaitable, Callable
from typing import Any

from fastapi import WebSocket

logger = logging.getLogger("backline.realtime")

# This module deliberately doesn't follow the router/service/repository/schemas shape
# (06-Backend-Architecture.md §6.1) - there's no Mongo-backed resource here, just an
# in-process fan-out registry. `pubsub.py` is what makes broadcast_local correct across
# more than one backend process (12-API-WebSocket.md §12.6): Redis is the actual source
# of truth for "who gets this message," this class is just the last hop to a live socket.

# Access-change envelopes carry ids only so removed project members can clear caches.
_ACCESS_CHANGE_TYPES = frozenset({"project.access_changed", "workspace.members_changed"})


class MemberEventFilter:
    """Authorize recipients and project visibility at delivery, without a stale ACL cache."""

    def __init__(self, *, workspace_id: str, user_id: str) -> None:
        self.workspace_id = workspace_id
        self.user_id = user_id

    async def allows(self, envelope: dict[str, Any]) -> bool:
        from app.core.db import get_db
        from app.core.project_access import can_view_project
        from app.modules.workspaces.repository import MembershipRepository

        if envelope.get("workspace_id") != self.workspace_id:
            return False
        payload = envelope.get("payload")
        if not isinstance(payload, dict):
            return False
        if (
            envelope.get("type") == "notification.new"
            and payload.get("recipient_user_id") != self.user_id
        ):
            return False
        db = get_db()
        membership = await MembershipRepository(db).find(
            workspace_id=self.workspace_id, user_id=self.user_id
        )
        if membership is None:
            return False
        if envelope.get("type") in _ACCESS_CHANGE_TYPES:
            return True
        project_id = payload.get("project_id")
        # Older notification producers nest project identity in NotificationOut.payload.
        if project_id is None and isinstance(payload.get("payload"), dict):
            project_id = payload["payload"].get("project_id")
        if not isinstance(project_id, str):
            return True
        return await can_view_project(
            db,
            workspace_id=self.workspace_id,
            project_id=project_id,
            user_id=self.user_id,
            workspace_role=membership["role"],
        )


class ConnectionManager:
    def __init__(self) -> None:
        self._channels: dict[str, set[WebSocket]] = defaultdict(set)
        self._filters: dict[WebSocket, MemberEventFilter] = {}
        self._access_checks: dict[WebSocket, Callable[[], Awaitable[bool]]] = {}

    async def connect(
        self,
        channel: str,
        websocket: WebSocket,
        event_filter: MemberEventFilter | None = None,
        *,
        access_check: Callable[[], Awaitable[bool]],
    ) -> None:
        await websocket.accept()
        self._channels[channel].add(websocket)
        self._access_checks[websocket] = access_check
        if event_filter is not None:
            self._filters[websocket] = event_filter

    def disconnect(self, channel: str, websocket: WebSocket) -> None:
        self._channels[channel].discard(websocket)
        self._filters.pop(websocket, None)
        self._access_checks.pop(websocket, None)
        if not self._channels[channel]:
            del self._channels[channel]

    async def broadcast_local(self, channel: str, message: dict[str, Any]) -> None:
        dead: list[WebSocket] = []
        for websocket in list(self._channels.get(channel, ())):
            try:
                access_check = self._access_checks.get(websocket)
                if access_check is None or not await access_check():
                    dead.append(websocket)
                    await websocket.close(code=4403)
                    continue
            except Exception:
                logger.warning("Realtime access check failed; withheld %s.", message.get("type"))
                continue
            event_filter = self._filters.get(websocket)
            if event_filter is not None:
                try:
                    allowed = await event_filter.allows(message)
                except Exception:
                    # Can't tell what they may see (e.g. Mongo blipped): skip this one
                    # event rather than risk a leak or drop a healthy socket.
                    logger.warning("Realtime filter failed; withheld %s.", message.get("type"))
                    allowed = False
                if not allowed:
                    continue
            try:
                await websocket.send_json(message)
            except Exception:
                dead.append(websocket)
        for websocket in dead:
            self.disconnect(channel, websocket)


manager = ConnectionManager()
