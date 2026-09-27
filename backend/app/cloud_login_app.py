"""Cloud login browser - a separate, minimal FastAPI app carrying only the interactive
websocket session (docs/tdr/0042). Deployed from the Dockerfile's `cloud_login` build
target, which - like `worker` - has Playwright's Chromium binary installed; `app.main:app`
(the API) deliberately does not (see browser_render/service.py's own comment on why, and
Dockerfile's worker-stage comment). Never mounted into app.main:app for that reason - a
member's browser connects to this service directly, at its own Railway URL, never through
the API.

A member drives a real, headless Chromium here (CDP screencast out, mouse/keyboard in)
to sign in wherever the reviewed site actually needs - Google/Microsoft SSO, 2FA, whatever
the identity provider requires - from this service's own egress IP, which matches every
later proxied request's IP too (unlike a session synced in from the member's own machine,
TDR-0041, whose IP the proxy can never match). On finish, the captured cookies/localStorage
hand off through the exact same one-time ticket TDR-0041 built - this file only adds a
second way to *capture* that payload, not a second way to carry it into the canvas."""

import asyncio
import contextlib
import json
from typing import TYPE_CHECKING, Any

from fastapi import FastAPI, WebSocket, WebSocketDisconnect

from app.core.config import get_settings
from app.core.db import get_db
from app.core.redis_client import get_redis
from app.core.ssrf_guard import assert_safe_to_fetch
from app.modules.cloud_login import service as cloud_login_service
from app.modules.cloud_login.service import CloudLoginTarget
from app.modules.session_sync import service as session_sync_service
from app.modules.session_sync.schemas import CookieIn, LocalStorageItemIn, SessionSyncCreate

if TYPE_CHECKING:
    from playwright.async_api import Page, Route, ViewportSize

app = FastAPI(title="Backline Cloud Login Browser")

_VIEWPORT_WIDTH = 1280
_VIEWPORT_HEIGHT = 800
# Untrusted client input is about to drive a real, non-sandboxed browser - bounded the
# same way modules/proxy/router.py bounds a proxied request body, just for text instead
# of bytes.
_MAX_TEXT_LENGTH = 500
_MAX_KEY_LENGTH = 40


def _allowed_origin(origin: str | None) -> bool:
    settings = get_settings()
    allowed = {*settings.cors_allow_origins, settings.public_dashboard_base_url.rstrip("/")}
    return origin is not None and origin.rstrip("/") in allowed


async def _send_json(websocket: WebSocket, payload: dict[str, Any]) -> None:
    with contextlib.suppress(Exception):
        await websocket.send_text(json.dumps(payload))


async def _guard_document_navigation(route: "Route") -> None:
    """Same hook, same reasoning as browser_render/service.py's own guard: page.goto (and
    every navigation the member's clicks cause afterwards - this is an interactive session,
    not one fixed URL) can redirect anywhere, including to an internal address, and
    Playwright follows that *inside* the browser engine with no other interception point."""
    request = route.request
    if request.resource_type != "document":
        await route.continue_()
        return
    try:
        await asyncio.to_thread(assert_safe_to_fetch, request.url)
    except ValueError:
        await route.abort()
        return
    await route.continue_()


def _point(message: dict[str, Any]) -> tuple[float, float] | None:
    x, y = message.get("x"), message.get("y")
    if isinstance(x, int | float) and isinstance(y, int | float):
        return float(x), float(y)
    return None


async def _handle_input(page: "Page", message: dict[str, Any]) -> None:
    kind = message.get("type")
    if kind == "mouse":
        event = message.get("event")
        point = _point(message)
        if event == "move" and point is not None:
            await page.mouse.move(*point)
        elif event == "down":
            if point is not None:
                await page.mouse.move(*point)
            await page.mouse.down()
        elif event == "up":
            await page.mouse.up()
    elif kind == "wheel":
        dx, dy = message.get("deltaX", 0), message.get("deltaY", 0)
        if isinstance(dx, int | float) and isinstance(dy, int | float):
            await page.mouse.wheel(dx, dy)
    elif kind == "text":
        text = message.get("text")
        if isinstance(text, str) and text:
            await page.keyboard.insert_text(text[:_MAX_TEXT_LENGTH])
    elif kind == "key":
        key = message.get("key")
        if isinstance(key, str) and key:
            with contextlib.suppress(Exception):  # an unrecognized key name, not fatal
                await page.keyboard.press(key[:_MAX_KEY_LENGTH])


async def _read_local_storage(page: "Page") -> list[tuple[str, str]]:
    try:
        items = await page.evaluate("() => Object.entries(window.localStorage)")
    except Exception:
        return []
    if not isinstance(items, list):
        return []
    return [(str(k), str(v)) for k, v in items]


async def _run_session(websocket: WebSocket, target: CloudLoginTarget) -> None:
    # Imported lazily, same reasoning as browser_render/service.py's run_render: only
    # this service's image has the browser binaries `playwright install` downloads.
    from playwright.async_api import async_playwright

    settings = get_settings()
    await _send_json(websocket, {"type": "status", "message": "Starting a private browser..."})

    async with async_playwright() as p:
        browser = await p.chromium.launch()
        try:
            viewport: ViewportSize = {"width": _VIEWPORT_WIDTH, "height": _VIEWPORT_HEIGHT}
            context = await browser.new_context(viewport=viewport)
            page = await context.new_page()
            await page.route("**/*", _guard_document_navigation)

            await _send_json(
                websocket, {"type": "status", "message": f"Opening {target.target_origin}..."}
            )
            try:
                await page.goto(target.target_origin, wait_until="domcontentloaded", timeout=20_000)
            except Exception as exc:
                await _send_json(
                    websocket, {"type": "error", "message": f"Could not open the site: {exc}"}
                )
                return

            cdp = await context.new_cdp_session(page)

            async def on_frame(params: dict[str, Any]) -> None:
                with contextlib.suppress(Exception):
                    await _send_json(websocket, {"type": "frame", "data": params["data"]})
                    await cdp.send("Page.screencastFrameAck", {"sessionId": params["sessionId"]})

            cdp.on("Page.screencastFrame", lambda params: asyncio.create_task(on_frame(params)))
            await cdp.send(
                "Page.startScreencast",
                {
                    "format": "jpeg",
                    "quality": 60,
                    "maxWidth": _VIEWPORT_WIDTH,
                    "maxHeight": _VIEWPORT_HEIGHT,
                    "everyNthFrame": 1,
                },
            )
            await _send_json(
                websocket, {"type": "ready", "width": _VIEWPORT_WIDTH, "height": _VIEWPORT_HEIGHT}
            )

            time_up = {"type": "status", "message": "Time's up - capturing your session..."}
            loop = asyncio.get_event_loop()
            deadline = loop.time() + settings.cloud_login_session_ttl_seconds
            while True:
                remaining = deadline - loop.time()
                if remaining <= 0:
                    await _send_json(websocket, time_up)
                    break
                try:
                    raw = await asyncio.wait_for(websocket.receive_text(), timeout=remaining)
                except TimeoutError:
                    await _send_json(websocket, time_up)
                    break
                except WebSocketDisconnect:
                    # Nobody left to hand a redeem_url to - browser/slot cleanup still
                    # happens via this function's own `finally` and the caller's.
                    return
                try:
                    message = json.loads(raw)
                except (TypeError, ValueError):
                    continue
                if message.get("type") == "finish":
                    break
                await _handle_input(page, message)

            await _send_json(websocket, {"type": "status", "message": "Capturing your session..."})
            cookies = await context.cookies()
            local_storage = await _read_local_storage(page)
            ticket_out = await session_sync_service.create_ticket(
                get_db(),
                get_redis(),
                workspace_id=target.workspace_id,
                project_id=target.project_id,
                body=SessionSyncCreate(
                    cookies=[
                        CookieIn(
                            name=cookie["name"],
                            value=cookie["value"],
                            path=cookie.get("path", "/"),
                            expires=cookie["expires"] if cookie.get("expires", -1) > 0 else None,
                            http_only=bool(cookie.get("httpOnly", False)),
                        )
                        for cookie in cookies
                    ],
                    local_storage=[
                        LocalStorageItemIn(key=key, value=value) for key, value in local_storage
                    ],
                ),
            )
            await _send_json(websocket, {"type": "done", "redeem_url": ticket_out.redeem_url})
        finally:
            await browser.close()


@app.websocket("/ws")
async def cloud_login_ws(websocket: WebSocket) -> None:
    if not _allowed_origin(websocket.headers.get("origin")):
        await websocket.close(code=4403)
        return

    ticket = websocket.query_params.get("ticket")
    if not ticket:
        await websocket.close(code=4400)
        return

    redis_client = get_redis()
    target = await cloud_login_service.redeem_session_ticket(redis_client, ticket=ticket)
    if target is None:
        await websocket.accept()
        await _send_json(websocket, {"type": "error", "message": "This session link has expired."})
        await websocket.close(code=4404)
        return

    try:
        await asyncio.to_thread(assert_safe_to_fetch, target.target_origin)
    except ValueError as exc:
        await websocket.accept()
        await _send_json(websocket, {"type": "error", "message": str(exc)})
        await websocket.close(code=4400)
        return

    lease = await cloud_login_service.acquire_slot(redis_client)
    if lease is None:
        await websocket.accept()
        await _send_json(
            websocket,
            {
                "type": "error",
                "code": "BUSY",
                "message": "Every live browser slot is in use right now - try again shortly.",
            },
        )
        await websocket.close(code=4503)
        return

    await websocket.accept()
    try:
        await _run_session(websocket, target)
    finally:
        await cloud_login_service.release_slot(redis_client, lease)


@app.get("/health")
async def health() -> dict[str, str]:
    return {"status": "ok"}
