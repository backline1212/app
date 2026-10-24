import asyncio
import logging
import time
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

# How long one socket's "still allowed" answer is reused across events. Every event
# used to cost each socket 5-8 Mongo round trips, serially, for every open dashboard;
# a short reuse window bounds that, and any access-change event clears it at once.
# Revocation that arrives without such an event takes effect within this window (the
# idle loop also re-checks every 15 seconds).
AUTH_CACHE_SECONDS = 5.0
# Sockets one event is delivered to at the same time.
FANOUT_CONCURRENCY = 50


class MemberEventFilter:
    """Authorize recipients and project visibility at delivery, without a stale ACL cache."""

    def __init__(self, *, workspace_id: str, user_id: str) -> None:
        self.workspace_id = workspace_id
        self.user_id = user_id
        self._membership: tuple[float, dict[str, Any] | None] | None = None
        self._projects: dict[str, tuple[float, bool]] = {}

    def invalidate(self) -> None:
        self._membership = None
        self._projects.clear()

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
        now = time.monotonic()
        if self._membership is None or now - self._membership[0] > AUTH_CACHE_SECONDS:
            self._membership = (
                now,
                await MembershipRepository(db).find(
                    workspace_id=self.workspace_id, user_id=self.user_id
                ),
            )
        membership = self._membership[1]
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
        cached = self._projects.get(project_id)
        if cached is not None and now - cached[0] <= AUTH_CACHE_SECONDS:
            return cached[1]
        visible = await can_view_project(
            db,
            workspace_id=self.workspace_id,
            project_id=project_id,
            user_id=self.user_id,
            workspace_role=membership["role"],
        )
        self._projects[project_id] = (now, visible)
        return visible


class ConnectionManager:
    def __init__(self) -> None:
        self._channels: dict[str, set[WebSocket]] = defaultdict(set)
        self._filters: dict[WebSocket, MemberEventFilter] = {}
        self._access_checks: dict[WebSocket, Callable[[], Awaitable[bool]]] = {}
        # When each socket's access check last passed (monotonic seconds).
        self._access_ok_at: dict[WebSocket, float] = {}

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
        self._access_ok_at.pop(websocket, None)
        if not self._channels[channel]:
            del self._channels[channel]

    async def _access_ok(self, websocket: WebSocket) -> bool:
        checked_at = self._access_ok_at.get(websocket)
        if checked_at is not None and time.monotonic() - checked_at <= AUTH_CACHE_SECONDS:
            return True
        access_check = self._access_checks.get(websocket)
        if access_check is None or not await access_check():
            return False
        self._access_ok_at[websocket] = time.monotonic()
        return True

    async def _deliver(self, websocket: WebSocket, message: dict[str, Any]) -> bool:
        """Returns False when the socket should be dropped."""
        try:
            if not await self._access_ok(websocket):
                await websocket.close(code=4403)
                return False
        except Exception:
            logger.warning("Realtime access check failed; withheld %s.", message.get("type"))
            return True
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
                return True
        try:
            await websocket.send_json(message)
        except Exception:
            return False
        return True

    async def broadcast_local(self, channel: str, message: dict[str, Any]) -> None:
        sockets = list(self._channels.get(channel, ()))
        if message.get("type") in _ACCESS_CHANGE_TYPES:
            # Someone's access changed: re-check everyone for this event and after it.
            for websocket in sockets:
                self._access_ok_at.pop(websocket, None)
                event_filter = self._filters.get(websocket)
                if event_filter is not None:
                    event_filter.invalidate()
        # Sockets are served concurrently; the subscriber still handles one event at a
        # time, so each socket receives events in publish order.
        limit = asyncio.Semaphore(FANOUT_CONCURRENCY)

        async def deliver(websocket: WebSocket) -> bool:
            async with limit:
                return await self._deliver(websocket, message)

        results = await asyncio.gather(*(deliver(websocket) for websocket in sockets))
        for websocket, keep in zip(sockets, results, strict=True):
            if not keep:
                self.disconnect(channel, websocket)


manager = ConnectionManager()
