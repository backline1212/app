from datetime import datetime
from typing import Any, Literal

from pydantic import BaseModel

NotificationType = Literal[
    "file_approved",
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
    "client_feedback",
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
    # What a comment notification is about, resolved when the list is read (so older
    # notifications get it too): the ticket's "#N", its first line and its project.
    ticket_number: int | None = None
    ticket_excerpt: str | None = None
    project_name: str | None = None
