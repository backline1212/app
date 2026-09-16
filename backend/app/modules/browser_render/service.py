import asyncio
from datetime import UTC, datetime, timedelta
from typing import TYPE_CHECKING, Any

from motor.motor_asyncio import AsyncIOMotorDatabase

if TYPE_CHECKING:
    from playwright.async_api import Route

from app.core.arq_pool import get_arq_pool
from app.core.errors import NotFoundError, ValidationError
from app.core.ssrf_guard import assert_safe_to_fetch
from app.modules.browser_render.repository import BrowserRenderRepository
from app.modules.browser_render.schemas import (
    ENGINE_BY_BROWSER,
    RenderRequest,
    RenderStatusOut,
    ViewportIn,
)
from app.modules.pages.repository import PageRepository
from app.modules.projects import service as project_service
from app.modules.storage.r2_client import generate_presigned_get

# A render older than this is served straight from cache instead of re-running a
# headless browser - QA clicking back and forth between viewports/orientations on the
# same page shouldn't spin up a new browser process on every click, and a site under
# active review rarely changes meaningfully minute-to-minute. "Refresh render" (force)
# bypasses this deliberately, e.g. right after deploying a fix.
_CACHE_FRESH_FOR = timedelta(minutes=15)


async def _guard_document_navigation(route: "Route") -> None:
    """Registered via page.route below, before every navigation. The initial
    assert_safe_to_fetch(url) call in run_render only checks the URL as first typed -
    Playwright's page.goto then follows any server redirect *inside the browser
    engine*, with no hook to intercept it the way proxy/service.py's manual
    httpx redirect loop does (A4's SSRF fix). route() is that hook: every request the
    page makes - including each redirect hop of the top-level navigation, since a
    redirect target is itself a new intercepted request - passes through here first.
    Only "document" requests (the navigating frame, not subresources like images/XHR
    the loaded page makes) are checked - the vulnerability is a page whose *own* URL
    (or a redirect of it) resolves to an internal address once the browser actually
    navigates there, not what that page subsequently fetches once safely loaded."""
    request = route.request
    if request.resource_type != "document":
        await route.continue_()
        return
    try:
        # assert_safe_to_fetch does a blocking DNS lookup (socket.getaddrinfo) - off
        # the event loop so one render's redirect check can't stall every other
        # concurrent job this worker process is running (max_jobs=3, main.py).
        await asyncio.to_thread(assert_safe_to_fetch, request.url)
    except ValueError:
        await route.abort()
        return
    await route.continue_()


async def _resolve_page(
    db: AsyncIOMotorDatabase[dict[str, Any]], *, workspace_id: str, project_id: str, page_id: str
) -> dict[str, Any]:
    page = await PageRepository(db).find_by_id(page_id)
    if page is None or page["project_id"] != project_id or page["workspace_id"] != workspace_id:
        raise NotFoundError("Page not found.")
    return page


def _doc_to_status(doc: dict[str, Any], *, screenshot_url: str | None) -> RenderStatusOut:
    return RenderStatusOut(
        status=doc["status"],
        browser=doc["browser"],
        viewport=ViewportIn(width=doc["viewport"]["width"], height=doc["viewport"]["height"]),
        orientation=doc["orientation"],
        screenshot_url=screenshot_url,
        rendered_at=doc.get("rendered_at"),
        error=doc.get("error"),
    )


async def request_render(
    db: AsyncIOMotorDatabase[dict[str, Any]],
    *,
    workspace_id: str,
    project_id: str,
    page_id: str,
    body: RenderRequest,
) -> RenderStatusOut:
    project = await project_service.get_project(
        db, project_id=project_id, workspace_id=workspace_id
    )
    if not project.settings.enable_cross_browser_render:
        raise ValidationError(
            "Cross-browser rendering is off for this project. Turn on 'Render real "
            "cross-browser screenshots' in Project settings first."
        )
    page = await _resolve_page(
        db, workspace_id=workspace_id, project_id=project_id, page_id=page_id
    )

    repo = BrowserRenderRepository(db)
    width, height = body.viewport.width, body.viewport.height
    existing = await repo.find(
        page_id=page_id,
        browser=body.browser,
        width=width,
        height=height,
        orientation=body.orientation,
    )
    fresh = (
        existing is not None
        and existing["status"] == "ready"
        and existing.get("rendered_at") is not None
        and datetime.now(UTC) - existing["rendered_at"] < _CACHE_FRESH_FOR
    )
    if fresh and not body.force:
        assert existing is not None
        screenshot_url = await generate_presigned_get(existing["screenshot_key"])
        return _doc_to_status(existing, screenshot_url=screenshot_url)

    doc = await repo.mark_queued(
        workspace_id=workspace_id,
        project_id=project_id,
        page_id=page_id,
        browser=body.browser,
        width=width,
        height=height,
        orientation=body.orientation,
    )
    pool = await get_arq_pool()
    await pool.enqueue_job(
        "render_browser_snapshot_job",
        workspace_id=workspace_id,
        project_id=project_id,
        page_id=page_id,
        url=page["url_normalized"],
        browser=body.browser,
        width=width,
        height=height,
        orientation=body.orientation,
    )
    return _doc_to_status(doc, screenshot_url=None)


async def get_render_status(
    db: AsyncIOMotorDatabase[dict[str, Any]],
    *,
    workspace_id: str,
    project_id: str,
    page_id: str,
    browser: str,
    width: int,
    height: int,
    orientation: str,
) -> RenderStatusOut:
    await _resolve_page(db, workspace_id=workspace_id, project_id=project_id, page_id=page_id)
    doc = await BrowserRenderRepository(db).find(
        page_id=page_id, browser=browser, width=width, height=height, orientation=orientation
    )
    if doc is None:
        raise NotFoundError("No render requested yet for this combination.")
    screenshot_url = None
    if doc["status"] == "ready":
        screenshot_url = await generate_presigned_get(doc["screenshot_key"])
    return _doc_to_status(doc, screenshot_url=screenshot_url)


async def run_render(
    db: AsyncIOMotorDatabase[dict[str, Any]],
    *,
    workspace_id: str,
    project_id: str,
    page_id: str,
    url: str,
    browser: str,
    width: int,
    height: int,
    orientation: str,
) -> None:
    """The actual Playwright work, called from the Arq job wrapper
    (app/workers/browser_render.py) - never inline in a request handler, since a cold
    headless-browser launch plus page load routinely takes several seconds, which the
    request/poll split (request_render/get_render_status above) exists to hide from the
    dashboard's own request/response cycle."""
    # Imported lazily so a process that never renders anything (the API container,
    # most Railway request traffic) doesn't pay Playwright's import-time cost - only the
    # worker process that actually executes this function needs the `playwright install`
    # browser binaries present on disk. mypy's "playwright.*" override
    # (pyproject.toml's [[tool.mypy.overrides]]) is what keeps this resolvable in a dev
    # checkout that hasn't run `uv sync` yet.
    from playwright.async_api import async_playwright

    from app.modules.storage.r2_client import upload_bytes

    repo = BrowserRenderRepository(db)
    doc = await repo.find(
        page_id=page_id, browser=browser, width=width, height=height, orientation=orientation
    )
    if doc is None:
        return  # the queued record was superseded/removed; nothing left to report into

    # SSRF guard: a page's URL isn't otherwise tied to its project's target_origin, and
    # this worker navigates a real headless browser to it - reject anything resolving to
    # a private/internal address before launching Playwright at all.
    try:
        assert_safe_to_fetch(url)
    except ValueError as exc:
        await repo.mark_failed(doc_id=doc["_id"], error=str(exc)[:500])
        return

    await repo.mark_rendering(doc_id=doc["_id"])

    # Portrait keeps the viewport as selected; landscape swaps width/height - the same
    # convention ProjectFooter's orientation toggle already uses for the live iframe
    # (apps/web/src/features/projects/ProjectOverviewPage.tsx), so a render matches
    # whatever the reviewer was just looking at live.
    render_width, render_height = (width, height) if orientation == "portrait" else (height, width)
    engine_name = ENGINE_BY_BROWSER.get(browser, "chromium")

    try:
        async with async_playwright() as p:
            engine = getattr(p, engine_name)
            browser_instance = await engine.launch()
            try:
                page = await browser_instance.new_page(
                    viewport={"width": render_width, "height": render_height}
                )
                await page.route("**/*", _guard_document_navigation)
                await page.goto(url, wait_until="networkidle", timeout=20_000)
                screenshot_bytes = await page.screenshot(full_page=True, type="png")
            finally:
                await browser_instance.close()
    except Exception as exc:  # noqa: BLE001 - any Playwright/navigation failure is reportable, not a bug
        await repo.mark_failed(doc_id=doc["_id"], error=str(exc)[:500])
        return

    key = (
        f"renders/{workspace_id}/{project_id}/{page_id}/"
        f"{browser}-{render_width}x{render_height}-{orientation}-{int(datetime.now(UTC).timestamp())}.png"
    )
    await upload_bytes(key, screenshot_bytes, "image/png")
    await repo.mark_ready(doc_id=doc["_id"], screenshot_key=key)
