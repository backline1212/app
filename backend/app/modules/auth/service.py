import secrets
from dataclasses import dataclass
from datetime import UTC, datetime, timedelta
from typing import Any

import anyio
from motor.motor_asyncio import AsyncIOMotorClientSession, AsyncIOMotorDatabase
from pymongo.errors import DuplicateKeyError
from pymongo.read_concern import ReadConcern
from pymongo.write_concern import WriteConcern

from app.core.config import get_settings
from app.core.email import send_email
from app.core.email_address import normalize_email
from app.core.errors import (
    AuthenticationError,
    ConflictError,
    NotFoundError,
    PermissionDeniedError,
    ValidationError,
)
from app.core.mongo_utils import to_object_id
from app.core.security import (
    PASSWORD_MIN_LENGTH,
    create_access_token,
    generate_opaque_token,
    generate_otp_code,
    hash_password,
    hash_secret,
    secrets_match,
    verify_password,
)
from app.core.verified_identity import require_verified_identity
from app.modules.auth.google_oauth import exchange_code_for_user_info
from app.modules.auth.repository import OtpRepository, RefreshTokenRepository, UserRepository
from app.modules.auth.schemas import SessionOut, SignupChallengeOut, UserOut
from app.modules.workspaces.repository import MembershipRepository


@dataclass(frozen=True)
class IssuedTokens:
    """Internal to the auth module - the router splits this into the JSON body
    (access_token + user) and an httpOnly cookie (refresh_token), never both in
    the body (13-Authentication.md §13.6)."""

    access_token: str
    refresh_token: str
    user: UserOut


def _code_block(code: str) -> str:
    """A one-time code, large and spaced for reading and copying."""
    return (
        '<p style="margin:16px 0;font-size:28px;font-weight:700;letter-spacing:6px;">'
        f"<strong>{code}</strong></p>"
    )


def _user_out(doc: dict[str, Any]) -> UserOut:
    return UserOut(
        id=str(doc["_id"]),
        email=doc["email"],
        name=doc["name"],
        avatar_url=doc.get("avatar_url"),
        preferences=doc.get("preferences", {}),
        has_password=bool(doc.get("password_hash")),
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
    *,
    auth_method: str,
    ua: str | None = None,
    ip: str | None = None,
) -> IssuedTokens:
    """Raw login always returns a workspace-less token (13-Authentication.md §13.3) -
    the client calls /auth/switch-workspace next (auto-selecting if there's exactly
    one membership, or prompting if there are several / none yet)."""
    user_id = str(user_doc["_id"])
    authenticated_at = datetime.now(UTC)
    await require_verified_identity(
        db, user_id, issued_at=authenticated_at, expected_email=user_doc["email"]
    )

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
        auth_method=auth_method,
        authenticated_at=authenticated_at,
    )
    # Up to MAX_ACTIVE_SESSIONS devices stay signed in at once; the least recently used
    # beyond that are signed out (TDR-0151, replacing TDR-0034's single session).
    await refresh_repo.revoke_families_beyond(user_doc["_id"], keep=MAX_ACTIVE_SESSIONS)

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
    existing = await user_repo.get_or_create(
        email=user_info.email,
        name=user_info.name,
        avatar_url=user_info.avatar_url,
        auth_provider="google",
    )
    existing = await _record_email_proof(db, existing)
    await user_repo.touch_login(existing["_id"], "google")

    return await _issue_tokens(db, existing, auth_method="google", ua=ua, ip=ip)


# One real digest, derived once per process, to verify against when the email has no
# account or has one with no password on it. Without it, those cases would return in
# microseconds while a wrong password takes the full scrypt derivation - a timing
# oracle for which addresses are registered. Built lazily so importing this module
# doesn't cost a derivation.
_absent_password_digest: str | None = None


def _digest_for_absent_password() -> str:
    global _absent_password_digest
    if _absent_password_digest is None:
        _absent_password_digest = hash_password(secrets.token_urlsafe(32))
    return _absent_password_digest


def _validate_new_password(password: str, email: str) -> None:
    """Length is already enforced by the request schema; this is the part that has to
    look at the password's content, which Pydantic can't express. Deliberately short -
    a long list of composition rules pushes people towards predictable substitutions
    rather than longer passwords."""
    if len(password) < PASSWORD_MIN_LENGTH:
        raise ValidationError(f"Use at least {PASSWORD_MIN_LENGTH} characters.")
    if len(set(password)) < 4:
        raise ValidationError("That password repeats too few characters. Mix it up.")
    local_part = email.split("@")[0].lower()
    if len(local_part) >= 4 and local_part in password.lower():
        raise ValidationError("Leave your email address out of your password.")


async def request_signup(
    db: AsyncIOMotorDatabase[dict[str, Any]], *, name: str, email: str, password: str
) -> SignupChallengeOut:
    if not name.strip():
        raise ValidationError("Tell us your name.")
    _validate_new_password(password, email)
    existing = await UserRepository(db).find_by_email(email)
    if existing is not None and existing.get("email_verified_at"):
        raise ConflictError("That email already has a Backline account. Sign in instead.")
    settings = get_settings()
    code = generate_otp_code()
    await OtpRepository(db).create(
        email=email,
        code_hash=hash_secret(code),
        purpose="signup",
        ttl_minutes=settings.otp_ttl_minutes,
    )
    await send_email(
        to=email,
        subject="Verify your Backline account",
        html="<p>Use this code to verify your email and finish creating your Backline "
        f"account:</p>{_code_block(code)}<p>It expires in {settings.otp_ttl_minutes} minutes. "
        "If you didn't try to create an account, you can ignore this email.</p>",
    )
    return SignupChallengeOut(email=email, expires_in_seconds=settings.otp_ttl_minutes * 60)


async def _record_email_proof(
    db: AsyncIOMotorDatabase[dict[str, Any]], user_doc: dict[str, Any]
) -> dict[str, Any]:
    verified = await UserRepository(db).verify_email(user_doc["_id"], email=user_doc["email"])
    if verified is None:
        raise AuthenticationError("Your account changed. Sign in again.")
    return verified


async def signup_with_password(
    db: AsyncIOMotorDatabase[dict[str, Any]],
    *,
    name: str,
    email: str,
    password: str,
    code: str,
    ua: str | None = None,
    ip: str | None = None,
) -> IssuedTokens:
    """Only an inbox-proven signup may create or activate its password identity."""
    name = name.strip()
    if not name:
        raise ValidationError("Tell us your name.")
    _validate_new_password(password, email)

    user_repo = UserRepository(db)
    existing = await user_repo.find_by_email(email)
    if existing is not None and existing.get("email_verified_at"):
        raise ConflictError("That email already has a Backline account. Sign in instead.")
    await _verify_and_consume_otp(db, email, code, purpose="signup")

    # Blocking and memory-bound (~32 MiB, ~175 ms) - off the event loop, or every other
    # request in this worker waits behind it.
    password_hash = await anyio.to_thread.run_sync(hash_password, password)
    user_doc = await user_repo.get_or_create(
        email=email, name=name, avatar_url=None, auth_provider="email_otp"
    )
    activated = await user_repo.activate_verified_signup(
        user_doc["_id"], email=user_doc["email"], name=name, password_hash=password_hash
    )
    if activated is None:
        raise ConflictError("This account was verified elsewhere. Sign in instead.")

    return await _issue_tokens(db, activated, auth_method="password", ua=ua, ip=ip)


async def login_with_password(
    db: AsyncIOMotorDatabase[dict[str, Any]],
    *,
    email: str,
    password: str,
    ua: str | None = None,
    ip: str | None = None,
) -> IssuedTokens:
    user_repo = UserRepository(db)
    user_doc = await user_repo.find_by_email(email)
    stored = user_doc.get("password_hash") if user_doc else None

    matched = await anyio.to_thread.run_sync(
        verify_password, password, stored or _digest_for_absent_password()
    )
    # One message for all three cases (no account, account without a password, wrong
    # password): which of them it is, is exactly what an attacker probing addresses
    # wants to learn. The sign-in screen offers the code flow alongside, which is how a
    # member with no password still gets in.
    if user_doc is None or not stored or not matched:
        raise AuthenticationError("Incorrect email or password.")
    await require_verified_identity(db, str(user_doc["_id"]))

    await user_repo.touch_login(user_doc["_id"], "password")
    return await _issue_tokens(db, user_doc, auth_method="password", ua=ua, ip=ip)


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
        html=f"<p>Use this code to sign in to Backline:</p>{_code_block(code)}"
        f"<p>It expires in {settings.otp_ttl_minutes} minutes. If you didn't try to sign in, "
        "you can ignore this email; nobody can sign in without the code.</p>",
    )


async def _verify_and_consume_otp(
    db: AsyncIOMotorDatabase[dict[str, Any]], email: str, code: str, *, purpose: str | None = None
) -> None:
    otp_repo = OtpRepository(db)
    otp_doc = await otp_repo.find_latest(email, purpose=purpose)
    if otp_doc is None:
        raise ValidationError("No active code for this email. Request a new one.")
    # Select the newest code before claiming, so an exhausted newest code cannot
    # silently fall back to an older code with a fresh attempt budget.
    claimed = await otp_repo.claim_attempt(
        otp_doc["_id"], max_attempts=get_settings().otp_max_attempts
    )
    if claimed is None:
        raise ValidationError("This code expired or has no attempts left. Request a new one.")
    if not secrets_match(claimed["code_hash"], hash_secret(code)):
        raise ValidationError("Incorrect code.")
    if not await otp_repo.consume(claimed["_id"], code_hash=claimed["code_hash"]):
        raise ValidationError("This code expired or was already used. Request a new one.")


async def verify_otp(
    db: AsyncIOMotorDatabase[dict[str, Any]],
    email: str,
    code: str,
    ua: str | None = None,
    ip: str | None = None,
) -> IssuedTokens:
    await _verify_and_consume_otp(db, email, code)

    user_repo = UserRepository(db)
    existing = await user_repo.get_or_create(
        email=email, name=email.split("@")[0], avatar_url=None, auth_provider="email_otp"
    )
    existing = await _record_email_proof(db, existing)
    await user_repo.touch_login(existing["_id"], "email_otp")

    return await _issue_tokens(db, existing, auth_method="email_otp", ua=ua, ip=ip)


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
    await require_verified_identity(
        db, str(user_doc["_id"]), issued_at=token_doc.get("authenticated_at", False)
    )

    new_raw = generate_opaque_token()
    new_hash = hash_secret(new_raw)

    settings = get_settings()
    browser, os = _parse_user_agent(ua)

    async def commit_rotation(session: AsyncIOMotorClientSession) -> dict[str, Any] | None:
        claimed = await refresh_repo.rotate(
            old_token_hash=token_hash, new_token_hash=new_hash, session=session
        )
        if claimed is None:
            return None
        await refresh_repo.create(
            user_id=claimed["user_id"],
            token_hash=new_hash,
            family_id=claimed["family_id"],
            ttl_days=settings.jwt_refresh_ttl_days,
            browser=browser,
            os=os,
            ip_address=ip,
            auth_method=claimed.get("auth_method"),
            authenticated_at=claimed.get("authenticated_at"),
            session=session,
        )
        return claimed

    # Session validation (including extension readiness) must always see a live
    # family member while another tab refreshes. CAS plus successor insertion
    # commit together; neither a write failure nor a reader can observe a gap.
    async with await db.client.start_session() as session:
        claimed: dict[str, Any] | None = await session.with_transaction(
            commit_rotation,
            read_concern=ReadConcern("snapshot"),
            write_concern=WriteConcern("majority"),
        )
    if claimed is None:
        await refresh_repo.revoke_family(token_doc["family_id"])
        raise AuthenticationError("Refresh token has already been used. Session revoked.")

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
    user_object_id = to_object_id(user_id)
    if user_object_id is None:
        raise AuthenticationError("Invalid session.")

    refresh_repo = RefreshTokenRepository(db)
    families = await refresh_repo.list_active_families(user_object_id)

    current_family_id = None
    if current_refresh_token:
        token_hash = hash_secret(current_refresh_token)
        current_token_doc = await refresh_repo.find_by_hash(token_hash)
        if current_token_doc and current_token_doc.get("user_id") == user_object_id:
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
    user_object_id = to_object_id(user_id)
    if user_object_id is None:
        raise AuthenticationError("Invalid session.")

    refresh_repo = RefreshTokenRepository(db)
    if not await refresh_repo.family_belongs_to_user(family_id, user_object_id):
        raise NotFoundError("Session not found.")
    await refresh_repo.revoke_family(family_id)


async def revoke_all_sessions(db: AsyncIOMotorDatabase[dict[str, Any]], user_id: str) -> None:
    user_object_id = to_object_id(user_id)
    if user_object_id is None:
        raise AuthenticationError("Invalid session.")

    await db.refresh_tokens.update_many(
        {"user_id": user_object_id, "revoked_at": None},
        {"$set": {"revoked_at": datetime.now(UTC)}},
    )
    # Browser-extension connections are long-lived bearer tokens; "sign out of all
    # sessions" must end them as well.
    from app.modules.extension_tokens.repository import ExtensionTokenRepository

    await ExtensionTokenRepository(db).revoke_all_for_user(user_object_id)


MAX_ACTIVE_SESSIONS = 5

# How long after an emailed-code sign-in the "Set a password" step stays open.
PASSWORD_RESET_WINDOW = timedelta(minutes=15)


async def set_password(
    db: AsyncIOMotorDatabase[dict[str, Any]], user_id: str, sid: str | None, password: str
) -> None:
    """TDR-0037: sets or replaces the member's password without the old one - the
    "Set a password" step that follows signing in with an emailed code, which is how a
    member who joined by Google or a code gets a first password and how a forgotten one
    is reset. The code is the proof, so only a session that a code sign-in started in
    the last 15 minutes may use this; anyone else changes their password with the
    current one (change_password). Without that check, any live session - a borrowed
    laptop, a leaked access token - could take the account over (TDR-0053)."""
    user_object_id = to_object_id(user_id)
    if user_object_id is None:
        raise AuthenticationError("Invalid session.")

    login = await RefreshTokenRepository(db).find_active_in_family(user_id, sid) if sid else None
    authenticated_at = login.get("authenticated_at") if login else None
    if isinstance(authenticated_at, datetime) and authenticated_at.tzinfo is None:
        authenticated_at = authenticated_at.replace(tzinfo=UTC)
    if (
        login is None
        or login.get("auth_method") != "email_otp"
        or not isinstance(authenticated_at, datetime)
        or authenticated_at < datetime.now(UTC) - PASSWORD_RESET_WINDOW
    ):
        raise PermissionDeniedError(
            "To set a new password, sign in with an emailed code first, or use "
            "Change password in your account."
        )

    user_repo = UserRepository(db)
    user_doc = await user_repo.find_by_id(user_id)
    if user_doc is None:
        raise AuthenticationError("Invalid session.")

    _validate_new_password(password, user_doc["email"])

    # Blocking and memory-bound - off the event loop, same as signup.
    password_hash = await anyio.to_thread.run_sync(hash_password, password)
    await user_repo.set_password_hash(user_object_id, password_hash)


async def update_user(
    db: AsyncIOMotorDatabase[dict[str, Any]], user_id: str, updates: dict[str, Any]
) -> UserOut:
    user_object_id = to_object_id(user_id)
    if user_object_id is None:
        raise AuthenticationError("Invalid session.")

    user_repo = UserRepository(db)

    # Prefix preferences updates
    patch: dict[str, Any] = {}
    if "name" in updates and updates["name"] is not None:
        name = updates["name"].strip()
        if not name:
            raise ValidationError("Name can't be empty.")
        patch["name"] = name

    # Present-but-null removes the photo; absent leaves it alone.
    if "avatar_url" in updates:
        patch["avatar_url"] = updates["avatar_url"]

    if "preferences" in updates and updates["preferences"] is not None:
        for k, v in updates["preferences"].items():
            patch[f"preferences.{k}"] = v

    await user_repo.update(user_object_id, patch)

    updated_doc = await user_repo.find_by_id(user_id)
    if not updated_doc:
        raise AuthenticationError("User not found.")
    return _user_out(updated_doc)


async def change_password(
    db: AsyncIOMotorDatabase[dict[str, Any]],
    session_user_id: str,
    current_sid: str | None,
    *,
    current_password: str,
    new_password: str,
) -> None:
    """Changing a password needs the current one, and signs out every other session -
    whoever may have known the old password loses the sessions it got them."""
    user_repo = UserRepository(db)
    user_doc = await user_repo.find_by_id(session_user_id)
    if user_doc is None:
        raise AuthenticationError("User not found.")
    stored = user_doc.get("password_hash")
    if not stored:
        raise ValidationError(
            "You sign in with Google or an email code, so there is no password to change."
        )
    matched = await anyio.to_thread.run_sync(verify_password, current_password, stored)
    if not matched:
        raise ValidationError("Your current password is not right.")
    if current_password == new_password:
        raise ValidationError("Choose a password you haven't used here before.")
    _validate_new_password(new_password, user_doc["email"])
    password_hash = await anyio.to_thread.run_sync(hash_password, new_password)
    await user_repo.update(
        user_doc["_id"], {"password_hash": password_hash, "password_changed_at": datetime.now(UTC)}
    )
    if current_sid:
        await RefreshTokenRepository(db).revoke_other_families(user_doc["_id"], current_sid)
    # A changed password also ends extension connections made with the old one.
    from app.modules.extension_tokens.repository import ExtensionTokenRepository

    await ExtensionTokenRepository(db).revoke_all_for_user(user_doc["_id"])


def _email_change_purpose(user_id: str) -> str:
    return f"email_change:{user_id}"


async def request_email_change(
    db: AsyncIOMotorDatabase[dict[str, Any]],
    session_user_id: str,
    *,
    email: str,
    password: str | None,
) -> None:
    """Step one of changing the sign-in email: a code goes to the *new* address, so the
    change only lands once someone who reads that inbox confirms it."""
    user_repo = UserRepository(db)
    user_doc = await user_repo.find_by_id(session_user_id)
    if user_doc is None:
        raise AuthenticationError("User not found.")
    if email == normalize_email(user_doc["email"]):
        raise ValidationError("That's already your email.")
    stored = user_doc.get("password_hash")
    if stored:
        matched = await anyio.to_thread.run_sync(verify_password, password or "", stored)
        if not matched:
            raise ValidationError("Enter your current password to change your email.")
    if await user_repo.find_by_email(email) is not None:
        raise ConflictError("That email already has a Backline account.")

    settings = get_settings()
    code = generate_otp_code()
    await OtpRepository(db).create(
        email=email,
        code_hash=hash_secret(code),
        ttl_minutes=settings.otp_ttl_minutes,
        purpose=_email_change_purpose(session_user_id),
    )
    await send_email(
        to=email,
        subject="Confirm your new Backline email",
        html=f"<p>Use this code to confirm your new Backline email address:</p>"
        f"{_code_block(code)}<p>It expires in {settings.otp_ttl_minutes} minutes. If you "
        "didn't ask to change your Backline email, ignore this email.</p>",
    )


async def confirm_email_change(
    db: AsyncIOMotorDatabase[dict[str, Any]], session_user_id: str, *, email: str, code: str
) -> UserOut:
    await _verify_and_consume_otp(db, email, code, purpose=_email_change_purpose(session_user_id))

    user_repo = UserRepository(db)
    user_doc = await user_repo.find_by_id(session_user_id)
    if user_doc is None:
        raise AuthenticationError("User not found.")
    try:
        await user_repo.update(
            user_doc["_id"], {"email": email, "email_verified_at": datetime.now(UTC)}
        )
    except DuplicateKeyError:
        raise ConflictError("That email already has a Backline account.") from None
    updated = await user_repo.find_by_id(session_user_id)
    assert updated is not None
    await revoke_all_sessions(db, session_user_id)
    return _user_out(updated)
