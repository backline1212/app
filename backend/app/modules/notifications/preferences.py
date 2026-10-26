"""Shared feedback notification preferences for creation and deferred delivery."""

from app.modules.notifications import events

FEEDBACK_PREFERENCES = {
    events.COMMENT_ASSIGNED: "notify_on_assignment",
    events.COMMENT_REPLY: "notify_on_reply",
    events.COMMENT_MENTION: "notify_on_mention",
    events.COMMENT_STATUS_CHANGED: "notify_on_status_change",
    # A file version signed off (TDR-0184) is the same kind of news as a status change.
    events.FILE_APPROVED: "notify_on_status_change",
    events.CLIENT_FEEDBACK: "notify_on_client_feedback",
}
