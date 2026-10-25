"""Gzip for the API's JSON and the widget script only (TDR-0167).

Starlette's GZipMiddleware compresses every response, which would also re-compress
images/PDFs served from /content, buffer the MCP server's event streams and touch
proxied website responses. This applies it to what benefits: /api JSON (a project's
comment list is several MB uncompressed) and /widget/sdk.js."""

from starlette.middleware.gzip import GZipMiddleware
from starlette.types import ASGIApp, Receive, Scope, Send

_BINARY_SUFFIXES = ("/content", "/download", "/screenshot")


def _compressible(scope: Scope) -> bool:
    path: str = scope.get("path", "")
    if not (path.startswith("/api/") or path.startswith("/widget/")):
        return False
    if path.endswith(_BINARY_SUFFIXES) or path.endswith(".zip"):
        return False
    for name, value in scope.get("headers") or []:
        if name == b"accept" and b"text/event-stream" in value:
            return False
    return True


class SelectiveGZipMiddleware:
    def __init__(self, app: ASGIApp, minimum_size: int = 1024, compresslevel: int = 6) -> None:
        self.app = app
        self.gzip = GZipMiddleware(app, minimum_size=minimum_size, compresslevel=compresslevel)

    async def __call__(self, scope: Scope, receive: Receive, send: Send) -> None:
        if scope["type"] == "http" and _compressible(scope):
            await self.gzip(scope, receive, send)
        else:
            await self.app(scope, receive, send)
