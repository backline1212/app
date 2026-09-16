import asyncio
import contextlib
from collections.abc import AsyncIterator
from contextlib import asynccontextmanager
from pathlib import Path

import sentry_sdk
from fastapi import FastAPI, Response
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles

from app.core.arq_pool import close_arq_pool
from app.core.auth_origin import AuthOriginMiddleware
from app.core.config import get_settings
from app.core.db import close_client, get_client, get_db
from app.core.errors import register_exception_handlers
from app.core.indexes import ensure_indexes
from app.core.redis_client import close_redis, get_redis
from app.modules.ai.router import router as ai_router
from app.modules.assets.router import router as assets_router
from app.modules.auth.router import router as auth_router
from app.modules.browser_render.router import router as browser_render_router
from app.modules.clients.router import router as clients_router
from app.modules.comments.router import router as comments_router
from app.modules.dashboard.router import router as dashboard_router
from app.modules.extension_tokens.router import router as extension_tokens_router
from app.modules.integrations.router import router as integrations_router
from app.modules.mcp.router import router as mcp_router
from app.modules.mcp.server import mcp as mcp_server
from app.modules.notifications.router import router as notifications_router
from app.modules.pages.router import router as pages_router
from app.modules.projects.router import router as projects_router
from app.modules.proxy.fallback_router import router as proxy_fallback_router
from app.modules.proxy.router import router as proxy_router
from app.modules.realtime.pubsub import run_subscriber
from app.modules.realtime.router import router as realtime_router
from app.modules.share_links.router import router as share_links_router
from app.modules.snapshot_engine.router import router as snapshots_router
from app.modules.storage.r2_client import ensure_bucket_exists
from app.modules.storage.router import router as storage_router
from app.modules.workspaces.router import router as workspaces_router

WIDGET_DIST_DIR = Path(__file__).resolve().parents[2] / "apps" / "widget" / "dist"
EXTENSION_DIST_DIR = Path(__file__).resolve().parents[2] / "apps" / "extension" / "dist"

# streamable_http_app() lazily creates the FastMCP session manager (raises if accessed
# before this call) - built once here so both the mount below and the lifespan's
# session_manager.run() reference the same instance.
mcp_asgi_app = mcp_server.streamable_http_app()


@asynccontextmanager
async def lifespan(app: FastAPI) -> AsyncIterator[None]:
    await ensure_indexes(get_db())
    await ensure_bucket_exists()
    subscriber_task = asyncio.create_task(run_subscriber())
    # FastMCP's own session manager background task - mounting its Starlette app
    # below does not automatically run its lifespan, so it has to be entered here
    # (the SDK's own documented pattern for "mounting a FastMCP server inside an
    # existing FastAPI app").
    async with mcp_server.session_manager.run():
        yield
    subscriber_task.cancel()
    with contextlib.suppress(asyncio.CancelledError):
        await subscriber_task
    await close_client()
    await close_redis()
    await close_arq_pool()


settings = get_settings()

# Milestone 12 (docs/tdr/0011): a no-op with no DSN configured (no real Sentry project
# exists for this build), same pattern as every other credential-gated integration -
# calling sentry_sdk.capture_*/init still works with an empty DSN, it just discards.
if settings.sentry_dsn:
    sentry_sdk.init(
        dsn=settings.sentry_dsn, environment=settings.environment, traces_sample_rate=0.1
    )

app = FastAPI(title="Backline API", version="0.1.0", lifespan=lifespan)
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_allow_origins,
    # The Review SDK (07-Review-SDK.md) runs on arbitrary third-party sites, so its API
    # calls (guest-sessions, review resolve, pages, snapshots, uploads) must be allowed
    # from any origin - allow_origin_regex reflects the actual request Origin, which is
    # what lets "any origin" coexist with allow_credentials=True (a literal "*" cannot).
    # Cookie-bearing auth paths additionally enforce the dashboard origin allowlist
    # in AuthOriginMiddleware; arbitrary origins are only for header-authenticated guests.
    allow_origin_regex=".*",
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

register_exception_handlers(app)

app.add_middleware(AuthOriginMiddleware)
app.include_router(auth_router, prefix="/api/v1")
app.include_router(workspaces_router, prefix="/api/v1")
app.include_router(projects_router, prefix="/api/v1")
app.include_router(clients_router, prefix="/api/v1")
app.include_router(dashboard_router, prefix="/api/v1")
app.include_router(assets_router, prefix="/api/v1")
app.include_router(share_links_router, prefix="/api/v1")
app.include_router(pages_router, prefix="/api/v1")
app.include_router(snapshots_router, prefix="/api/v1")
app.include_router(storage_router, prefix="/api/v1")
app.include_router(comments_router, prefix="/api/v1")
app.include_router(browser_render_router, prefix="/api/v1")
app.include_router(ai_router)
app.include_router(integrations_router, prefix="/api/v1")
app.include_router(mcp_router, prefix="/api/v1")
app.include_router(extension_tokens_router, prefix="/api/v1")
app.include_router(notifications_router, prefix="/api/v1")
# Deliberately not under /api/v1 - 12-API-WebSocket.md §12.6 specifies the connection URL
# as `wss://api.backline.app/ws?...`, not `/api/v1/ws`.
app.include_router(realtime_router)
# Also not under /api/v1 - these are raw content routes (a browser navigates to them
# directly, or loads them as a <script src>), not JSON API calls
# (03-System-Architecture.md §3.3, Milestone 9).
app.include_router(proxy_router)
# The Backline-hosted MCP server (modules/mcp/server.py) - a user's own agent tooling
# (Claude Code, Cursor, ...) points its MCP client config at this URL with a personal
# access token (modules/mcp/router.py) in the Authorization header.
app.mount("/mcp", mcp_asgi_app)
if WIDGET_DIST_DIR.exists():
    app.mount("/widget", StaticFiles(directory=WIDGET_DIST_DIR), name="widget")
# Serves the built browser extension for direct download (Settings > Browser Extension)
# ahead of a Chrome Web Store listing existing - same "raw content, browser navigates
# to it directly" reasoning as the widget mount above, just a .zip instead of a .js file.
if EXTENSION_DIST_DIR.exists():
    app.mount("/extension", StaticFiles(directory=EXTENSION_DIST_DIR), name="extension")


@app.get("/health")
async def health(response: Response) -> dict[str, str]:
    mongo_ok = "ok"
    try:
        await get_client().admin.command("ping")
    except Exception:
        mongo_ok = "unreachable"

    redis_ok = "ok"
    try:
        await get_redis().ping()
    except Exception:
        redis_ok = "unreachable"

    # DEPLOYMENT.md tells operators to point an external uptime monitor at this
    # endpoint - a monitor that (as most do, e.g. UptimeRobot's default HTTP check)
    # only looks at the status code, never the JSON body, would never notice a real
    # Mongo/Redis outage if this always returned 200. A degraded dependency must
    # surface as a non-2xx response, not just a body field nothing is reading.
    degraded = mongo_ok != "ok" or redis_ok != "ok"
    response.status_code = 503 if degraded else 200
    return {"status": "degraded" if degraded else "ok", "mongo": mongo_ok, "redis": redis_ok}


# Registered last, deliberately: a true catch-all (`/{full_path:path}`) would swallow
# every other route's requests if it came first - this only ever gets to run for a
# request nothing above it matched (app/modules/proxy/fallback_router.py).
app.include_router(proxy_fallback_router)
