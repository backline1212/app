"""An explicit inbox proof gates member credentials, including legacy credentials."""

from datetime import UTC, datetime
from typing import Any

from motor.motor_asyncio import AsyncIOMotorDatabase

from app.core.errors import AuthenticationError
from app.modules.auth.repository import UserRepository


def _aware(value: Any) -> datetime | None:
    if not isinstance(value, datetime):
        return None
    return value if value.tzinfo else value.replace(tzinfo=UTC)


async def require_verified_identity(
    db: AsyncIOMotorDatabase[dict[str, Any]],
    user_id: str,
    *,
    issued_at: Any = ...,
    expected_email: str | None = None,
) -> None:
    user = await UserRepository(db).find_by_id(user_id)
    verified_at = _aware(user.get("email_verified_at")) if user else None
    if verified_at is None:
        raise AuthenticationError("Verify your email by signing in with an email code or Google.")
    if expected_email is not None and user is not None and user["email"] != expected_email:
        raise AuthenticationError("Your email changed. Sign in again.")
    if issued_at is not ...:
        issued = _aware(issued_at)
        if issued is None or issued < verified_at:
            raise AuthenticationError(
                "Your account was verified again. Sign in or reconnect this tool."
            )
