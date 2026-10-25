"""One-click unsubscribe for digest and feedback emails (RFC 8058).

Every digest/feedback email carries `List-Unsubscribe` + `List-Unsubscribe-Post` headers
and a footer link. A POST to the link (what Gmail and Yahoo send) turns the preference off
at once; a GET only shows a confirmation page, so link scanners that open URLs in emails
cannot unsubscribe anyone.
"""

from html import escape
from typing import Any

from motor.motor_asyncio import AsyncIOMotorDatabase

from app.core.config import get_settings
from app.core.security import create_unsubscribe_token, read_unsubscribe_token
from app.modules.auth.repository import UserRepository

_PREFERENCE = {"digest": "daily_digest", "feedback": "email_notifications"}
_LABEL = {"digest": "daily digest emails", "feedback": "feedback notification emails"}


def unsubscribe_url(user_id: str, kind: str) -> str:
    base = get_settings().public_api_base_url.rstrip("/")
    return f"{base}/api/v1/email/unsubscribe/{create_unsubscribe_token(user_id, kind)}"


def label_for(token: str) -> str | None:
    parsed = read_unsubscribe_token(token)
    return _LABEL[parsed[1]] if parsed else None


async def unsubscribe(db: AsyncIOMotorDatabase[dict[str, Any]], token: str) -> str | None:
    """Turns the email kind off for the token's user. Returns what was turned off, or
    None for an invalid token or an account that no longer exists."""
    parsed = read_unsubscribe_token(token)
    if parsed is None:
        return None
    user_id, kind = parsed
    repo = UserRepository(db)
    user = await repo.find_by_id(user_id)
    if user is None:
        return None
    await repo.update(user["_id"], {f"preferences.{_PREFERENCE[kind]}": False})
    return _LABEL[kind]


def settings_link() -> str:
    url = escape(get_settings().public_dashboard_base_url.rstrip("/"), quote=True)
    return f'<a href="{url}">your Backline account settings</a>'
