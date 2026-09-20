from fastapi import APIRouter, Cookie, Depends, Request, Response

from app.core.config import get_settings
from app.core.db import get_db
from app.core.errors import AuthenticationError
from app.core.feature_flags import load_feature_flags
from app.core.rate_limit import check_rate_limit, get_client_ip
from app.core.redis_client import get_redis
from app.core.session import Session, get_current_session
from app.modules.auth import service as auth_service
from app.modules.auth.schemas import (
    AccessTokenOut,
    GoogleCallbackRequest,
    OtpRequestRequest,
    OtpVerifyRequest,
    PasswordLoginRequest,
    SessionOut,
    SignupRequest,
    SwitchWorkspaceRequest,
    TokenPairOut,
    UserOut,
    UserUpdateRequest,
)

router = APIRouter(prefix="/auth", tags=["auth"])

REFRESH_COOKIE_NAME = "refresh_token"
REFRESH_COOKIE_PATH = "/api/v1/auth"


def _set_refresh_cookie(response: Response, raw_refresh_token: str) -> None:
    settings = get_settings()
    response.set_cookie(
        key=REFRESH_COOKIE_NAME,
        value=raw_refresh_token,
        max_age=settings.jwt_refresh_ttl_days * 24 * 60 * 60,
        httponly=True,
        secure=settings.environment != "local",
        samesite="lax" if settings.environment == "local" else "none",
        path=REFRESH_COOKIE_PATH,
    )


@router.post("/google/callback", response_model=TokenPairOut)
async def google_callback(
    body: GoogleCallbackRequest, request: Request, response: Response
) -> TokenPairOut:
    ua = request.headers.get("user-agent")
    ip = get_client_ip(request)
    issued = await auth_service.login_with_google(get_db(), body.code, ua=ua, ip=ip)
    _set_refresh_cookie(response, issued.refresh_token)
    return TokenPairOut(access_token=issued.access_token, user=issued.user)


@router.post("/signup", response_model=TokenPairOut, status_code=201)
async def signup(body: SignupRequest, request: Request, response: Response) -> TokenPairOut:
    """Creates an account with a password and signs it straight in - the member never
    has to go and log in again with credentials they just chose."""
    settings = get_settings()
    ip = get_client_ip(request)
    await check_rate_limit(
        get_redis(),
        key=f"rate-limit:signup:ip:{ip}",
        limit=settings.signup_rate_limit_per_minute,
        window_seconds=60,
    )
    issued = await auth_service.signup_with_password(
        get_db(),
        name=body.name,
        email=body.email,
        password=body.password,
        ua=request.headers.get("user-agent"),
        ip=ip,
    )
    _set_refresh_cookie(response, issued.refresh_token)
    return TokenPairOut(access_token=issued.access_token, user=issued.user)


@router.post("/login", response_model=TokenPairOut)
async def login(body: PasswordLoginRequest, request: Request, response: Response) -> TokenPairOut:
    settings = get_settings()
    ip = get_client_ip(request)
    # Limited per address as well as per IP: one is what stops a distributed run at a
    # single account, the other what stops one host working through many accounts.
    await check_rate_limit(
        get_redis(),
        key=f"rate-limit:password-login:ip:{ip}",
        limit=settings.password_login_rate_limit_per_minute,
        window_seconds=60,
    )
    await check_rate_limit(
        get_redis(),
        key=f"rate-limit:password-login:email:{body.email.lower()}",
        limit=settings.password_login_rate_limit_per_minute,
        window_seconds=60,
    )
    issued = await auth_service.login_with_password(
        get_db(),
        email=body.email,
        password=body.password,
        ua=request.headers.get("user-agent"),
        ip=ip,
    )
    _set_refresh_cookie(response, issued.refresh_token)
    return TokenPairOut(access_token=issued.access_token, user=issued.user)


@router.post("/otp/request", status_code=204)
async def otp_request(body: OtpRequestRequest, request: Request) -> None:
    # Milestone 11 rate-limiting audit: unauthenticated, and triggers a real email send
    # in production - without a limit, anyone can spam arbitrary inboxes for free.
    settings = get_settings()
    await check_rate_limit(
        get_redis(),
        key=f"rate-limit:otp-request:ip:{get_client_ip(request)}",
        limit=settings.otp_request_rate_limit_per_minute,
        window_seconds=60,
    )
    await auth_service.request_otp(get_db(), body.email)


@router.post("/otp/verify", response_model=TokenPairOut)
async def otp_verify(body: OtpVerifyRequest, request: Request, response: Response) -> TokenPairOut:
    ua = request.headers.get("user-agent")
    ip = get_client_ip(request)
    issued = await auth_service.verify_otp(get_db(), body.email, body.code, ua=ua, ip=ip)
    _set_refresh_cookie(response, issued.refresh_token)
    return TokenPairOut(access_token=issued.access_token, user=issued.user)


@router.post("/refresh", response_model=TokenPairOut)
async def refresh(
    request: Request,
    response: Response,
    refresh_token: str | None = Cookie(default=None, alias=REFRESH_COOKIE_NAME),
) -> TokenPairOut:
    if refresh_token is None:
        raise AuthenticationError("No refresh token cookie present.")
    ua = request.headers.get("user-agent")
    ip = get_client_ip(request)
    issued = await auth_service.refresh_tokens(get_db(), refresh_token, ua=ua, ip=ip)
    _set_refresh_cookie(response, issued.refresh_token)
    return TokenPairOut(access_token=issued.access_token, user=issued.user)


@router.post("/logout", status_code=204)
async def logout(
    response: Response,
    session: Session = Depends(get_current_session),
    refresh_token: str | None = Cookie(default=None, alias=REFRESH_COOKIE_NAME),
) -> None:
    if refresh_token is not None:
        await auth_service.logout(get_db(), refresh_token)
    response.delete_cookie(REFRESH_COOKIE_NAME, path=REFRESH_COOKIE_PATH)


@router.post("/switch-workspace", response_model=AccessTokenOut)
async def switch_workspace(
    body: SwitchWorkspaceRequest, session: Session = Depends(get_current_session)
) -> AccessTokenOut:
    access_token = await auth_service.switch_workspace(
        get_db(), session.user_id, body.workspace_id, sid=session.sid
    )
    flags = await load_feature_flags(get_db(), body.workspace_id)
    return AccessTokenOut(access_token=access_token, feature_flags=flags)


@router.get("/sessions", response_model=list[SessionOut])
async def list_sessions(
    session: Session = Depends(get_current_session),
    refresh_token: str | None = Cookie(default=None, alias=REFRESH_COOKIE_NAME),
) -> list[SessionOut]:
    """FD-AUD-011: Lists all active sessions for the current user."""
    return await auth_service.list_sessions(
        get_db(), session.user_id, current_refresh_token=refresh_token
    )


@router.delete("/sessions/{family_id}", status_code=204)
async def revoke_session(
    family_id: str,
    session: Session = Depends(get_current_session),
) -> None:
    """FD-AUD-011: Revokes a specific session family."""
    if family_id == "all":
        await auth_service.revoke_all_sessions(get_db(), session.user_id)
        return
    await auth_service.revoke_session_family(get_db(), session.user_id, family_id)


@router.patch("/me", response_model=UserOut)
async def update_me(
    body: UserUpdateRequest,
    session: Session = Depends(get_current_session),
) -> UserOut:
    """FD-AUD-046: Update user profile and preferences."""
    return await auth_service.update_user(
        get_db(), session.user_id, body.model_dump(exclude_unset=True)
    )
