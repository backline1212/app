"""Canonical notification `type` values - M-06 (FD-AUD-006/038): these were previously
inline string literals repeated at each notify_* call site (`type="comment_assigned"`,
etc.), the same drift risk `comments/events.py` already guards against for the `events`
collection's `type` field. Every value here must stay in sync with
`notifications/schemas.py`'s `NotificationType` Literal - that's the wire contract;
these constants are what code should reference instead of retyping the string."""

COMMENT_ASSIGNED = "comment_assigned"
COMMENT_REPLY = "comment_reply"
COMMENT_MENTION = "comment_mention"
COMMENT_STATUS_CHANGED = "comment_status_changed"
SHARE_LINK_CREATED = "share_link_created"
INTEGRATION_DISCONNECTED = "integration_disconnected"
DEPLOY_RECOVERY_COMPLETED = "deploy_recovery_completed"
# TDR-0056.
JOIN_REQUESTED = "join_requested"
MEMBER_JOINED = "member_joined"
PROJECT_ACCESS_GRANTED = "project_access_granted"
OWNERSHIP_TRANSFERRED = "ownership_transferred"
