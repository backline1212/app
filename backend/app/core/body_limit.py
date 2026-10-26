"""Cap request bodies before anything buffers them (TDR-0201).

Starlette spools multipart files to disk and `request.body()` reads everything before a
handler can check a size, so an unauthenticated caller could send gigabytes to a
webhook or a guest upload route. File routes get room for their own 20 MB file limit
plus form overhead; everything else is JSON or small forms. The snapshot, proxy and
deploy-hook routes enforce their own limits and are left alone.
"""

import re

from starlette.responses import JSONResponse
from starlette.types import ASGIApp, Message, Receive, Scope, Send

DEFAULT_MAX_BYTES = 5 * 1024 * 1024
_FILE_MAX_BYTES = 21 * 1024 * 1024
_LIMITS: tuple[tuple[re.Pattern[str], int | None], ...] = (
    (re.compile(r"^/api/v1/pages/[^/]+/snapshots/?$"), None),
    (re.compile(r"^/proxy/"), None),
    (re.compile(r"^/api/v1/deploy-hooks/"), None),
    (re.compile(r"^/api/v1/uploads/direct/?$"), _FILE_MAX_BYTES),
    (re.compile(r"^/api/v1/projects/[^/]+/assets/?$"), _FILE_MAX_BYTES),
    (re.compile(r"^/api/v1/projects/[^/]+/preview/image/?$"), 9 * 1024 * 1024),
    (re.compile(r"^/api/v1/workspaces/[^/]+/branding/logo/?$"), 1024 * 1024),
)


def _limit_for(path: str) -> int | None:
    for pattern, limit in _LIMITS:
        if pattern.match(path):
            return limit
    return DEFAULT_MAX_BYTES


class RequestBodyLimitMiddleware:
    def __init__(self, app: ASGIApp) -> None:
        self.app = app

    async def __call__(self, scope: Scope, receive: Receive, send: Send) -> None:
        if scope["type"] != "http" or scope["method"] in ("GET", "HEAD", "OPTIONS"):
            await self.app(scope, receive, send)
            return
        limit = _limit_for(scope["path"])
        if limit is None:
            await self.app(scope, receive, send)
            return

        async def reject() -> None:
            response = JSONResponse(
                {
                    "error": {
                        "code": "PAYLOAD_TOO_LARGE",
                        "message": "This request is larger than Backline accepts.",
                        "details": {"max_bytes": limit},
                    }
                },
                status_code=413,
                headers={"Cache-Control": "no-store", "Connection": "close"},
            )
            await response(scope, receive, send)

        declared = dict(scope.get("headers", [])).get(b"content-length")
        if declared is not None:
            try:
                if int(declared) > limit:
                    await reject()
                    return
            except ValueError:
                await reject()
                return

        received = 0
        responded = False

        async def capped_receive() -> Message:
            nonlocal received
            message = await receive()
            if message["type"] == "http.request":
                received += len(message.get("body", b""))
                if received > limit:
                    raise _TooLarge
            return message

        async def tracking_send(message: Message) -> None:
            nonlocal responded
            if message["type"] == "http.response.start":
                responded = True
            await send(message)

        try:
            await self.app(scope, capped_receive, tracking_send)
        except _TooLarge:
            if not responded:
                await reject()


class _TooLarge(Exception):
    pass
