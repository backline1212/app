from datetime import datetime
from typing import Any, Literal

from pydantic import BaseModel

NotificationType = Literal[
    "comment_assigned",
    "comment_reply",
    "comment_mention",
    "comment_status_changed",
    "share_link_created",
    "integration_disconnected",
    "deploy_recovery_completed",
    "join_requested",
    "member_joined",
    "project_access_granted",
    "ownership_transferred",
]


class NotificationOut(BaseModel):
    id: str
    type: NotificationType
    payload: dict[str, Any]
    # target_route is an optional client-side route string (e.g. "/w/my-ws/p/abc?ticket=xyz")
    # populated at creation time so the frontend can navigate on click without a second request.
    target_route: str | None = None
    read_at: datetime | None
    created_at: datetime
