from dataclasses import dataclass
from datetime import UTC, datetime
from typing import Any

from motor.motor_asyncio import AsyncIOMotorDatabase

from app.core.config import get_settings
from app.core.email import send_email
from app.core.errors import (
    AuthenticationError,
    NotFoundError,
    PermissionDeniedError,
    ValidationError,
)
from app.core.security import (
    create_access_token,
    generate_opaque_token,
    generate_otp_code,
    hash_secret,
    secrets_match,
)
from app.modules.auth.google_oauth import exchange_code_for_user_info
from app.modules.auth.repository import OtpRepository, RefreshTokenRepository, UserRepository
from app.modules.auth.schemas import SessionOut, UserOut
from app.modules.workspaces.repository import MembershipRepository


@dataclass(frozen=True)
class IssuedTokens:
    """Internal to the auth module - the router splits this into the JSON body
    (access_token + user) and an httpOnly cookie (refresh_token), never both in
    the body (13-Authentication.md §13.6)."""

    access_token: str
    refresh_token: str
    user: UserOut


def _user_out(doc: dict[str, Any]) -> UserOut:
    return UserOut(
        id=str(doc["_id"]),
        email=doc["email"],
        name=doc["name"],
        avatar_url=doc.get("avatar_url"),
        preferences=doc.get("preferences", {}),
    )


def _parse_user_agent(ua: str | None) -> tuple[str | None, str | None]:
    if not ua:
        return None, None
    ua = ua.lower()
    browser = "Unknown"
    os = "Unknown"
    if "edg" in ua:
        browser = "Edge"
    elif "chrome" in ua:
        browser = "Chrome"
    elif "firefox" in ua:
        browser = "Firefox"
    elif "safari" in ua and "chrome" not in ua:
        browser = "Safari"

    if "windows" in ua:
        os = "Windows"
    elif "mac" in ua:
        os = "macOS"
    elif "linux" in ua:
        os = "Linux"
    elif "ios" in ua or "iphone" in ua or "ipad" in ua:
        os = "iOS"
    elif "android" in ua:
        os = "Android"

    return browser, os


async def _issue_tokens(
    db: AsyncIOMotorDatabase[dict[str, Any]],
    user_doc: dict[str, Any],
    ua: str | None = None,
    ip: str | None = None,
) -> IssuedTokens:
    """Raw login always returns a workspace-less token (13-Authentication.md §13.3) -
    the client calls /auth/switch-workspace next (auto-selecting if there's exactly
    one membership, or prompting if there are several / none yet)."""
    user_id = str(user_doc["_id"])

    refresh_repo = RefreshTokenRepository(db)
    raw_refresh = generate_opaque_token()
    family_id = generate_opaque_token()
    access_token = create_access_token(user_id, sid=family_id)
    settings = get_settings()
    browser, os = _parse_user_agent(ua)
    await refresh_repo.create(
        user_id=user_doc["_id"],
        token_hash=hash_secret(raw_refresh),
        family_id=family_id,
        ttl_days=settings.jwt_refresh_ttl_days,
        browser=browser,
        os=os,
        ip_address=ip,
    )

    return IssuedTokens(
        access_token=access_token, refresh_token=raw_refresh, user=_user_out(user_doc)
    )


async def login_with_google(
    db: AsyncIOMotorDatabase[dict[str, Any]],
    code: str,
    ua: str | None = None,
    ip: str | None = None,
) -> IssuedTokens:
    user_info = await exchange_code_for_user_info(code)
    if not user_info.email_verified:
        raise ValidationError("Google account email is not verified.")

    user_repo = UserRepository(db)
    existing = await user_repo.find_by_email(user_info.email)
    if existing is None:
        existing = await user_repo.create(
            email=user_info.email,
            name=user_info.name,
            avatar_url=user_info.avatar_url,
            auth_provider="google",
        )
    else:
        await user_repo.touch_login(existing["_id"], "google")

    return await _issue_tokens(db, existing, ua=ua, ip=ip)


async def request_otp(db: AsyncIOMotorDatabase[dict[str, Any]], email: str) -> None:
    otp_repo = OtpRepository(db)
    settings = get_settings()
    code = generate_otp_code()
    await otp_repo.create(
        email=email, code_hash=hash_secret(code), ttl_minutes=settings.otp_ttl_minutes
    )
    await send_email(
        to=email,
        subject="Your Backline sign-in code",
        html=f"<p>Your sign-in code is <strong>{code}</strong>. It expires in "
        f"{settings.otp_ttl_minutes} minutes.</p>",
    )


async def verify_otp(
    db: AsyncIOMotorDatabase[dict[str, Any]],
    email: str,
    code: str,
    ua: str | None = None,
    ip: str | None = None,
) -> IssuedTokens:
    otp_repo = OtpRepository(db)
    settings = get_settings()
    otp_doc = await otp_repo.find_latest_active(email)
    if otp_doc is None:
        raise ValidationError("No active code for this email. Request a new one.")

    if otp_doc["attempts"] >= settings.otp_max_attempts:
        raise ValidationError("Too many attempts. Request a new code.")

    if not secrets_match(otp_doc["code_hash"], hash_secret(code)):
        await otp_repo.increment_attempts(otp_doc["_id"])
        raise ValidationError("Incorrect code.")

    await otp_repo.mark_consumed(otp_doc["_id"])

    user_repo = UserRepository(db)
    existing = await user_repo.find_by_email(email)
    if existing is None:
        existing = await user_repo.create(
            email=email, name=email.split("@")[0], avatar_url=None, auth_provider="email_otp"
        )
    else:
        await user_repo.touch_login(existing["_id"], "email_otp")

    return await _issue_tokens(db, existing, ua=ua, ip=ip)


async def refresh_tokens(
    db: AsyncIOMotorDatabase[dict[str, Any]],
    raw_refresh_token: str,
    ua: str | None = None,
    ip: str | None = None,
) -> IssuedTokens:
    refresh_repo = RefreshTokenRepository(db)
    token_hash = hash_secret(raw_refresh_token)
    token_doc = await refresh_repo.find_by_hash(token_hash)

    if token_doc is None:
        raise AuthenticationError("Invalid refresh token.")

    if token_doc["expires_at"] <= datetime.now(UTC):
        raise AuthenticationError("Refresh token has expired.")

    if token_doc["revoked_at"] is not None:
        # Reuse of an already-rotated token: theft detection (13-Authentication.md §13.6).
        await refresh_repo.revoke_family(token_doc["family_id"])
        raise AuthenticationError("Refresh token has already been used. Session revoked.")

    user_repo = UserRepository(db)
    user_doc = await user_repo.find_by_id(str(token_doc["user_id"]))
    if user_doc is None:
        raise AuthenticationError("User no longer exists.")

    new_raw = generate_opaque_token()
    new_hash = hash_secret(new_raw)
    settings = get_settings()
    browser, os = _parse_user_agent(ua)
    await refresh_repo.create(
        user_id=token_doc["user_id"],
        token_hash=new_hash,
        family_id=token_doc["family_id"],
        ttl_days=settings.jwt_refresh_ttl_days,
        browser=browser,
        os=os,
        ip_address=ip,
    )
    await refresh_repo.rotate(old_token_hash=token_hash, new_token_hash=new_hash)

    access_token = create_access_token(str(user_doc["_id"]), sid=token_doc["family_id"])
    return IssuedTokens(access_token=access_token, refresh_token=new_raw, user=_user_out(user_doc))


async def logout(db: AsyncIOMotorDatabase[dict[str, Any]], raw_refresh_token: str) -> None:
    refresh_repo = RefreshTokenRepository(db)
    token_doc = await refresh_repo.find_by_hash(hash_secret(raw_refresh_token))
    if token_doc is not None:
        await refresh_repo.revoke_family(token_doc["family_id"])


async def switch_workspace(
    db: AsyncIOMotorDatabase[dict[str, Any]],
    user_id: str,
    workspace_id: str,
    sid: str | None = None,
) -> str:
    membership_repo = MembershipRepository(db)
    membership = await membership_repo.find(workspace_id=workspace_id, user_id=user_id)
    if membership is None:
        raise PermissionDeniedError("Not a member of this workspace.")

    return create_access_token(user_id, workspace_id=workspace_id, role=membership["role"], sid=sid)


async def list_sessions(
    db: AsyncIOMotorDatabase[dict[str, Any]], user_id: str, current_refresh_token: str | None
) -> list[SessionOut]:
    from bson import ObjectId

    refresh_repo = RefreshTokenRepository(db)
    families = await refresh_repo.list_active_families(ObjectId(user_id))

    current_family_id = None
    if current_refresh_token:
        token_hash = hash_secret(current_refresh_token)
        current_token_doc = await refresh_repo.find_by_hash(token_hash)
        if current_token_doc and current_token_doc.get("user_id") == ObjectId(user_id):
            current_family_id = current_token_doc.get("family_id")

    return [
        SessionOut(
            id=f["family_id"],
            current=f["family_id"] == current_family_id,
            browser=f.get("browser"),
            os=f.get("os"),
            ip_address=f.get("ip_address"),
            # M-05: typed datetimes now (SessionOut), not hand-formatted ISO strings -
            # Pydantic's response_model handles wire serialization.
            created_at=f["issued_at"],
            last_active_at=f["issued_at"],
        )
        for f in families
    ]


async def revoke_session_family(
    db: AsyncIOMotorDatabase[dict[str, Any]], user_id: str, family_id: str
) -> None:
    """M-01: family_id is an opaque token, not scoped to user_id by construction - a
    caller must be proven the owner of this family before it's revoked, or any
    authenticated user could revoke any other user's session family by id. Unknown or
    non-owned family_id 404s (not 403) so the response can't be used to enumerate
    which family ids exist (13-Authentication.md §13.6, mirrors require_workspace_match's
    no-leakage contract for cross-tenant resources)."""
    from bson import ObjectId

    refresh_repo = RefreshTokenRepository(db)
    if not await refresh_repo.family_belongs_to_user(family_id, ObjectId(user_id)):
        raise NotFoundError("Session not found.")
    await refresh_repo.revoke_family(family_id)


async def revoke_all_sessions(db: AsyncIOMotorDatabase[dict[str, Any]], user_id: str) -> None:
    from bson import ObjectId
    from datetime import datetime, UTC

    await db.refresh_tokens.update_many(
        {"user_id": ObjectId(user_id), "revoked_at": None},
        {"$set": {"revoked_at": datetime.now(UTC)}}
    )


async def update_user(
    db: AsyncIOMotorDatabase[dict[str, Any]], user_id: str, updates: dict[str, Any]
) -> UserOut:
    from bson import ObjectId

    user_repo = UserRepository(db)

    # Prefix preferences updates
    patch = {}
    if "name" in updates and updates["name"] is not None:
        patch["name"] = updates["name"]

    if "preferences" in updates and updates["preferences"] is not None:
        for k, v in updates["preferences"].items():
            patch[f"preferences.{k}"] = v

    await user_repo.update(ObjectId(user_id), patch)

    updated_doc = await user_repo.find_by_id(user_id)
    if not updated_doc:
        raise AuthenticationError("User not found.")
    return _user_out(updated_doc)
