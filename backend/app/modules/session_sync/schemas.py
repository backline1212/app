from pydantic import BaseModel, Field


class CookieIn(BaseModel):
    """One cookie as `chrome.cookies.getAll` reports it (docs/tdr/0041) - the extension
    reads these from the member's own real, signed-in browser profile, HttpOnly included,
    which is the one thing a page's own script or a server-side proxy fetch can never do."""

    name: str = Field(min_length=1, max_length=256)
    value: str = Field(max_length=4096)
    path: str = Field(default="/", max_length=1024)
    # Epoch seconds, matching chrome.cookies.Cookie.expirationDate; absent means a
    # session cookie (cleared on browser close, not carried across into the ticket).
    expires: float | None = None
    http_only: bool = False


class LocalStorageItemIn(BaseModel):
    key: str = Field(min_length=1, max_length=1024)
    value: str = Field(max_length=65536)


# Bounds what one ticket can carry - generous for a real site's own cookie jar and auth
# state, but not an arbitrary upload channel (this endpoint is reachable by any workspace
# member's extension token, same trust level as everything else project:manage gates).
_MAX_COOKIES = 200
_MAX_LOCAL_STORAGE_ITEMS = 200


class SessionSyncCreate(BaseModel):
    cookies: list[CookieIn] = Field(default_factory=list, max_length=_MAX_COOKIES)
    local_storage: list[LocalStorageItemIn] = Field(
        default_factory=list, max_length=_MAX_LOCAL_STORAGE_ITEMS
    )


class SessionSyncTicketOut(BaseModel):
    # Opened (or fetched) once by the extension itself to apply the session to the
    # preview origin's cookie jar - never shown to the member, never stored beyond the
    # ticket's own short Redis TTL.
    redeem_url: str
