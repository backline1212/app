import asyncio
import logging
import time
from collections import defaultdict
from typing import Any

from fastapi import WebSocket

logger = logging.getLogger("backline.realtime")

# This module deliberately doesn't follow the router/service/repository/schemas shape
# (06-Backend-Architecture.md §6.1) - there's no Mongo-backed resource here, just an
# in-process fan-out registry. `pubsub.py` is what makes broadcast_local correct across
# more than one backend process (12-API-WebSocket.md §12.6): Redis is the actual source
# of truth for "who gets this message," this class is just the last hop to a live socket.

# Envelope types that change what a member may see. They carry ids only, so they are
# delivered to everyone still in the workspace, and they make each filter reload first.
_ACCESS_CHANGE_TYPES = frozenset({"project.access_changed", "workspace.members_changed"})


class MemberEventFilter:
    """One member connection's view of the workspace channel (TDR-0056). Every event on
    `workspace:{id}:all` that names a project_id the member can't open is dropped here,
    at the last hop, so a private project's comments never reach a socket that couldn't
    fetch them over REST. The hidden-project set is cached, and reloaded on an access
    change or after `ttl_seconds`; the reload also re-reads the member's role, and a
    member who has left the workspace receives nothing more."""

    def __init__(self, *, workspace_id: str, user_id: str, ttl_seconds: float = 60.0) -> None:
        self.workspace_id = workspace_id
        self.user_id = user_id
        self.ttl_seconds = ttl_seconds
        self._hidden: set[str] | None = None
        self._loaded_at = 0.0
        self._removed = False
        self._lock = asyncio.Lock()

    def invalidate(self) -> None:
        self._hidden = None

    async def _load(self) -> set[str]:
        from app.core.db import get_db
        from app.core.project_access import hidden_project_ids
        from app.modules.workspaces.repository import MembershipRepository

        db = get_db()
        membership = await MembershipRepository(db).find(
            workspace_id=self.workspace_id, user_id=self.user_id
        )
        if membership is None:
            self._removed = True
            return set()
        self._removed = False
        return set(
            await hidden_project_ids(
                db,
                workspace_id=self.workspace_id,
                user_id=self.user_id,
                workspace_role=membership["role"],
            )
        )

    async def hidden(self) -> set[str]:
        fresh = time.monotonic() - self._loaded_at < self.ttl_seconds
        if self._hidden is not None and fresh:
            return self._hidden
        async with self._lock:
            fresh = time.monotonic() - self._loaded_at < self.ttl_seconds
            if self._hidden is None or not fresh:
                self._hidden = await self._load()
                self._loaded_at = time.monotonic()
            return self._hidden

    async def allows(self, envelope: dict[str, Any]) -> bool:
        if envelope.get("type") in _ACCESS_CHANGE_TYPES:
            self.invalidate()
            await self.hidden()
            return not self._removed
        hidden = await self.hidden()
        if self._removed:
            return False
        payload = envelope.get("payload")
        project_id = payload.get("project_id") if isinstance(payload, dict) else None
        return not (isinstance(project_id, str) and project_id in hidden)


class ConnectionManager:
    def __init__(self) -> None:
        self._channels: dict[str, set[WebSocket]] = defaultdict(set)
        self._filters: dict[WebSocket, MemberEventFilter] = {}

    async def connect(
        self,
        channel: str,
        websocket: WebSocket,
        event_filter: MemberEventFilter | None = None,
    ) -> None:
        await websocket.accept()
        self._channels[channel].add(websocket)
        if event_filter is not None:
            self._filters[websocket] = event_filter

    def disconnect(self, channel: str, websocket: WebSocket) -> None:
        self._channels[channel].discard(websocket)
        self._filters.pop(websocket, None)
        if not self._channels[channel]:
            del self._channels[channel]

    async def broadcast_local(self, channel: str, message: dict[str, Any]) -> None:
        dead: list[WebSocket] = []
        for websocket in list(self._channels.get(channel, ())):
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
