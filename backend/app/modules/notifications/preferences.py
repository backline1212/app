"""Shared feedback notification preferences for creation and deferred delivery."""

from app.modules.notifications import events

FEEDBACK_PREFERENCES = {
    events.COMMENT_ASSIGNED: "notify_on_assignment",
    events.COMMENT_REPLY: "notify_on_reply",
    events.COMMENT_MENTION: "notify_on_mention",
    events.COMMENT_STATUS_CHANGED: "notify_on_status_change",
}
