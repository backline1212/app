from starlette.responses import PlainTextResponse
from starlette.types import ASGIApp, Receive, Scope, Send

from app.modules.proxy.preview_host import is_preview_host, share_token_for_host

PREVIEW_HOST_STATE_KEY = "backline_preview_host"


class PreviewHostMiddleware:
    """Every request on a share link's preview origin (docs/tdr/0040) is the reviewed
    site's own path, so it's re-addressed to the proxy route for that link - and *only*
    there: no API route, widget file, MCP mount or realtime socket is reachable from a
    preview origin, which is what keeps a reviewed site's scripts away from Backline."""

    def __init__(self, app: ASGIApp) -> None:
        self.app = app

    async def __call__(self, scope: Scope, receive: Receive, send: Send) -> None:
        if scope["type"] not in ("http", "websocket"):
            await self.app(scope, receive, send)
            return
        host = dict(scope.get("headers", [])).get(b"host", b"").decode("latin-1")
        if not is_preview_host(host):
            await self.app(scope, receive, send)
            return
        # From here on it's a preview host, so nothing below is ever served by the API.
        if scope["type"] == "websocket":
            # The reviewed site's own sockets aren't proxied yet; refusing them here is
            # what stops one reaching Backline's /ws instead.
            await receive()
            await send({"type": "websocket.close", "code": 1008})
            return
        token = share_token_for_host(host)
        if token is None:
            await PlainTextResponse("Not found.", status_code=404)(scope, receive, send)
            return
        # Tokens are url-safe base64, so they need no escaping in either form.
        prefix = f"/proxy/{token}"
        scope = {
            **scope,
            "path": prefix + scope["path"],
            "raw_path": prefix.encode() + scope.get("raw_path", scope["path"].encode()),
            "root_path": "",
            "state": {**scope.get("state", {}), PREVIEW_HOST_STATE_KEY: True},
        }
        await self.app(scope, receive, send)
