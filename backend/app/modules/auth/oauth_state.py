"""Browser-bound, expiring and single-use Google sign-in attempts."""

import secrets
from urllib.parse import urlencode, urlsplit

from app.core.config import get_settings
from app.core.errors import ExternalServiceError, ValidationError
from app.core.redis_client import get_redis
from app.core.security import hash_secret

STATE_TTL_SECONDS = 10 * 60


def google_sign_in_available() -> bool:
    """Configuration readiness only; never claim a provider round trip succeeded."""
    settings = get_settings()
    if (
        not settings.google_oauth_client_id.strip()
        or not settings.google_oauth_client_secret.strip()
    ):
        return False
    try:
        callback = urlsplit(settings.google_oauth_redirect_uri)
        callback_origin = f"{callback.scheme}://{callback.netloc}"
        allowed = {
            settings.public_dashboard_base_url.rstrip("/"),
            *(origin.rstrip("/") for origin in settings.cors_allow_origins),
        }
        return bool(
            callback.scheme
            in (("http", "https") if settings.environment == "local" else ("https",))
            and callback.hostname
            and callback.port != 0
            and not callback.username
            and not callback.password
            and callback.path == "/auth/callback"
            and not callback.query
            and not callback.fragment
            and callback_origin in allowed
        )
    except ValueError:
        return False


async def start_google_sign_in() -> tuple[str, str]:
    settings = get_settings()
    if not google_sign_in_available():
        raise ExternalServiceError("Google sign-in is not configured. Use email to sign in.")
    state = secrets.token_urlsafe(32)
    await get_redis().setex(f"auth:google:state:{hash_secret(state)}", STATE_TTL_SECONDS, "pending")
    params = urlencode(
        {
            "client_id": settings.google_oauth_client_id,
            "redirect_uri": settings.google_oauth_redirect_uri,
            "response_type": "code",
            "scope": "openid email profile",
            "prompt": "select_account",
            "state": state,
        }
    )
    return f"https://accounts.google.com/o/oauth2/v2/auth?{params}", state


async def consume_google_state(state: str, browser_state: str | None) -> None:
    if (
        not browser_state
        or not browser_state.isascii()
        or not secrets.compare_digest(state, browser_state)
    ):
        raise ValidationError(
            "This sign-in request doesn't match your browser. Start Google sign-in again."
        )
    # Cookie matching precedes consumption so an unrelated browser cannot drain an
    # attempt by knowing its public state. GETDEL makes concurrent callbacks single-use.
    consumed = await get_redis().getdel(f"auth:google:state:{hash_secret(state)}")
    if consumed is None:
        raise ValidationError(
            "This sign-in request expired or was already used. Start Google sign-in again."
        )
