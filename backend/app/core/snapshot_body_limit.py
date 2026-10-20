"""Bound raw snapshot JSON before FastAPI buffers/parses it."""

import asyncio
import re

from starlette.responses import JSONResponse
from starlette.types import ASGIApp, Message, Receive, Scope, Send

MAX_SNAPSHOT_BYTES = 4 * 1024 * 1024
_PATH = re.compile(r"^/api/v1/pages/[^/]+/snapshots/?$")


class SnapshotBodyLimitMiddleware:
    def __init__(self, app: ASGIApp) -> None:
        self.app = app

    async def __call__(self, scope: Scope, receive: Receive, send: Send) -> None:
        if (
            scope["type"] != "http"
            or scope["method"] != "POST"
            or not _PATH.fullmatch(scope["path"])
        ):
            await self.app(scope, receive, send)
            return

        async def reject(status: int, message: str) -> None:
            response = JSONResponse(
                {"error": {"code": "INVALID_SNAPSHOT", "message": message, "details": {}}},
                status_code=status,
                headers={"Cache-Control": "no-store"},
            )
            await response(scope, receive, send)

        declared = dict(scope.get("headers", [])).get(b"content-length")
        if declared:
            try:
                length = int(declared)
            except ValueError:
                await reject(400, "Malformed snapshot Content-Length.")
                return
            if length < 0 or length > MAX_SNAPSHOT_BYTES:
                await reject(
                    413, "Page version exceeds the 4 MB capture limit. Feedback can still be saved."
                )
                return
        body = bytearray()
        try:
            async with asyncio.timeout(35):
                while True:
                    message = await receive()
                    if message["type"] == "http.disconnect":
                        return
                    chunk = message.get("body", b"")
                    if len(body) + len(chunk) > MAX_SNAPSHOT_BYTES:
                        await reject(
                            413,
                            "Page version exceeds the 4 MB capture limit. "
                            "Feedback can still be saved.",
                        )
                        return
                    body.extend(chunk)
                    if not message.get("more_body", False):
                        break
        except TimeoutError:
            await reject(408, "Page version upload timed out. Feedback can still be saved.")
            return
        delivered = False

        async def bounded_receive() -> Message:
            nonlocal delivered
            if delivered:
                return await receive()
            delivered = True
            return {"type": "http.request", "body": bytes(body), "more_body": False}

        await self.app(scope, bounded_receive, send)
