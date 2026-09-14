import hashlib
import hmac
import secrets
import time

from jose import JWTError, jwt
from pydantic import BaseModel, ValidationError

from app.core.config import get_settings

ALGORITHM = "HS256"


class InvalidTokenError(Exception):
    pass


class AccessTokenClaims(BaseModel):
    sub: str
    sid: str | None = None
    workspace_id: str | None = None
    role: str | None = None
    iat: int
    exp: int


class GuestTokenClaims(BaseModel):
    """13-Authentication.md §13.4: `sub` is a guest_session_id, no `role`, hardcoded
    `scope: "guest"`. Scoped to exactly one share_link_id - never valid for another
    project's resources (03-System-Architecture.md §3.5)."""

    sub: str
    scope: str = "guest"
    share_link_id: str
    iat: int
    exp: int


def create_access_token(
    user_id: str, workspace_id: str | None = None, role: str | None = None, sid: str | None = None
) -> str:
    """Access JWT (13-Authentication.md §13.3). workspace_id/role are None until
    the member has selected a workspace via POST /auth/switch-workspace."""
    settings = get_settings()
    now = int(time.time())
    claims = {
        "sub": user_id,
        "sid": sid,
        "workspace_id": workspace_id,
        "role": role,
        "iat": now,
        "exp": now + settings.jwt_access_ttl_minutes * 60,
    }
    token: str = jwt.encode(claims, settings.jwt_signing_key, algorithm=ALGORITHM)
    return token


def decode_access_token(token: str) -> AccessTokenClaims:
    settings = get_settings()
    try:
        payload = jwt.decode(token, settings.jwt_signing_key, algorithms=[ALGORITHM])
    except JWTError as exc:
        raise InvalidTokenError(str(exc)) from exc
    if payload.get("scope") == "guest" or "share_link_id" in payload:
        raise InvalidTokenError("A guest token cannot authenticate a member.")
    try:
        return AccessTokenClaims.model_validate(payload)
    except ValidationError as exc:
        raise InvalidTokenError("Invalid access token claims.") from exc


def create_guest_token(guest_session_id: str, share_link_id: str) -> str:
    settings = get_settings()
    now = int(time.time())
    claims = {
        "sub": guest_session_id,
        "scope": "guest",
        "share_link_id": share_link_id,
        "iat": now,
        "exp": now + settings.guest_token_ttl_days * 24 * 60 * 60,
    }
    token: str = jwt.encode(claims, settings.jwt_signing_key, algorithm=ALGORITHM)
    return token


def decode_guest_token(token: str) -> GuestTokenClaims:
    settings = get_settings()
    try:
        payload = jwt.decode(token, settings.jwt_signing_key, algorithms=[ALGORITHM])
    except JWTError as exc:
        raise InvalidTokenError(str(exc)) from exc
    claims = GuestTokenClaims.model_validate(payload)
    if claims.scope != "guest":
        raise InvalidTokenError("Not a guest token.")
    return claims


def generate_opaque_token() -> str:
    """High-entropy opaque token for refresh tokens and guest session tokens."""
    return secrets.token_urlsafe(32)


def generate_share_token() -> str:
    """Share-link tokens are the URL-facing identifier (`/review/{share_token}`,
    07-Review-SDK.md §7.1) - shorter than a refresh token, but still unguessable."""
    return secrets.token_urlsafe(12)


def hash_secret(value: str) -> str:
    """One-way hash for values we only ever need to compare, never recover
    (refresh tokens, OTP codes) - 13-Authentication.md §13.1/§13.2, 11-Database.md §11.14/§11.15.
    Real HMAC (not a plain `sha256(key:value)` concatenation) so the digest doesn't
    inherit sha256's length-extension weakness."""
    settings = get_settings()
    return hmac.new(
        settings.jwt_signing_key.encode(), value.encode(), hashlib.sha256
    ).hexdigest()


def secrets_match(a: str, b: str) -> bool:
    """Constant-time comparison for anything derived from hash_secret/a stored secret -
    use this instead of `==`/`!=`, which short-circuits on the first differing byte and
    leaks a timing signal proportional to how much of the guess was correct."""
    return hmac.compare_digest(a, b)


def generate_otp_code() -> str:
    return f"{secrets.randbelow(1_000_000):06d}"
