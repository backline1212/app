"""Project card previews (TDR-0058): a screenshot of the top of a website project's
site, so the projects grid shows each site as it looks instead of a generic sketch.

Captures run on the worker (app/workers/project_preview.py), which has Playwright's
Chromium installed; the API only decides when one is due and queues it. A capture is
due when a website project has none yet, its review URL changed, the last one is a
week old, or the last attempt failed long enough ago to try again. Listing projects
queues whatever is due, so projects saved before this existed get a preview the first
time someone opens the grid, with no backfill migration.
"""

import asyncio
import io
import logging
import uuid
from datetime import UTC, datetime, timedelta
from typing import Any

from motor.motor_asyncio import AsyncIOMotorDatabase

from app.core.arq_pool import get_arq_pool
from app.core.ssrf_guard import assert_safe_to_fetch
from app.modules.projects.repository import ProjectRepository
from app.modules.projects.schemas import ProjectOut
from app.modules.storage.r2_client import delete_object, generate_presigned_gets, upload_bytes

logger = logging.getLogger(__name__)

JOB_NAME = "capture_project_preview_job"

# A desktop viewport: what a site's hero looks like to most people opening it.
VIEWPORT_WIDTH, VIEWPORT_HEIGHT = 1280, 800
# Cards are under 400 CSS px wide; 800 covers a 2x display without storing the full
# capture.
THUMBNAIL_WIDTH = 800

STALE_AFTER = timedelta(days=7)
RETRY_FAILED_AFTER = timedelta(hours=6)
# A job that never reported back (worker restarted, Redis lost it) is retried after this.
QUEUED_TIMEOUT = timedelta(minutes=10)
# Signed preview URLs outlive a long-open grid tab; the picture is of a public page.
URL_TTL_SECONDS = 6 * 3600
# Per listing, so one request against a large workspace doesn't queue hundreds of jobs;
# the rest are picked up by the next listing.
MAX_QUEUED_PER_LISTING = 20

# Some sites serve a bot wall to the default "HeadlessChrome" user agent.
_USER_AGENT = (
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
    "(KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36"
)


def _aware(value: Any) -> datetime | None:
    if not isinstance(value, datetime):
        return None
    return value if value.tzinfo else value.replace(tzinfo=UTC)


def _wants_preview(doc: dict[str, Any]) -> bool:
    return (
        doc.get("project_type", "website") == "website"
        and bool(doc.get("target_origin"))
        and doc.get("archived_at") is None
        and not doc.get("hard_delete_status")
    )


def _capture_due(doc: dict[str, Any], now: datetime, *, force: bool = False) -> bool:
    if not _wants_preview(doc):
        return False
    preview = doc.get("preview") or {}
    status = preview.get("status")
    requested_at = _aware(preview.get("requested_at"))
    if status == "queued":
        # Even a forced refresh waits for the capture already on its way.
        return requested_at is None or now - requested_at > QUEUED_TIMEOUT
    if force or status is None or preview.get("origin") != doc["target_origin"]:
        return True
    if status == "failed":
        return requested_at is None or now - requested_at > RETRY_FAILED_AFTER
    captured_at = _aware(preview.get("captured_at"))
    return captured_at is None or now - captured_at > STALE_AFTER


async def queue_capture(
    db: AsyncIOMotorDatabase[dict[str, Any]], doc: dict[str, Any], *, force: bool = False
) -> bool:
    """Queue a capture for this project if one is due. Never raises: a card preview
    isn't worth failing the request that noticed it was missing."""
    now = datetime.now(UTC)
    if not _capture_due(doc, now, force=force):
        return False
    workspace_id, project_id = doc["workspace_id"], str(doc["_id"])
    token = uuid.uuid4().hex
    claimed = await ProjectRepository(db).claim_preview(
        workspace_id,
        project_id,
        previous_token=(doc.get("preview") or {}).get("token"),
        token=token,
        origin=doc["target_origin"],
        requested_at=now,
    )
    if not claimed:
        return False
    try:
        pool = await get_arq_pool()
        await pool.enqueue_job(
            JOB_NAME,
            workspace_id=workspace_id,
            project_id=project_id,
            token=token,
            _job_id=f"project-preview:{token}",
        )
    except Exception:  # noqa: BLE001 - left "queued"; QUEUED_TIMEOUT retries it
        logger.warning(
            "Could not queue a preview capture for project %s", project_id, exc_info=True
        )
    return True


async def with_previews(
    db: AsyncIOMotorDatabase[dict[str, Any]],
    docs: list[dict[str, Any]],
    outs: list[ProjectOut],
    *,
    queue: bool = True,
) -> list[ProjectOut]:
    """Fill in each project's signed preview URL and queue any capture that is due.
    A screenshot is only shown for the URL it was taken of, so a project pointed at a
    new site shows its sketch until the new capture lands, never the old site."""
    if queue:
        queued = 0
        for doc in docs:
            if queued >= MAX_QUEUED_PER_LISTING:
                break
            if await queue_capture(db, doc):
                queued += 1
                # Reflect the claim in this response, so the client knows to poll.
                preview = doc.setdefault("preview", {})
                preview["status"] = "queued"
                preview["requested_at"] = datetime.now(UTC)

    keys: dict[str, str] = {}
    for doc in docs:
        preview = doc.get("preview") or {}
        if preview.get("key") and preview.get("key_origin") == doc.get("target_origin"):
            keys[str(doc["_id"])] = preview["key"]
    try:
        urls = await generate_presigned_gets(list(keys.values()), expires_in=URL_TTL_SECONDS)
    except Exception:  # noqa: BLE001 - storage trouble costs the pictures, not the list
        logger.warning("Could not sign project preview URLs", exc_info=True)
        urls = {}

    result = []
    for doc, out in zip(docs, outs, strict=True):
        preview = doc.get("preview") or {}
        key = keys.get(str(doc["_id"]))
        result.append(
            out.model_copy(
                update={
                    "preview_url": urls.get(key) if key else None,
                    "preview_status": preview.get("status"),
                    "preview_captured_at": _aware(preview.get("captured_at")) if key else None,
                    "preview_requested_at": _aware(preview.get("requested_at")),
                }
            )
        )
    return result


async def _delete_quietly(key: str) -> None:
    try:
        await delete_object(key)
    except Exception:  # noqa: BLE001 - an orphaned thumbnail is cleaned up on hard delete
        logger.warning("Could not delete project preview %s", key, exc_info=True)


async def _screenshot(url: str) -> bytes:
    # Imported here so the API process never loads Playwright (see
    # browser_render/service.py's run_render), and because browser_render.service
    # imports projects.service, which imports this module.
    from playwright.async_api import TimeoutError as PlaywrightTimeout
    from playwright.async_api import async_playwright

    from app.modules.browser_render.service import _guard_document_navigation

    async with async_playwright() as p:
        browser = await p.chromium.launch()
        try:
            context = await browser.new_context(
                viewport={"width": VIEWPORT_WIDTH, "height": VIEWPORT_HEIGHT},
                user_agent=_USER_AGENT,
                locale="en-US",
            )
            page = await context.new_page()
            # Re-checks every redirect hop of the navigation, not just the first URL.
            await page.route("**/*", _guard_document_navigation)
            await page.goto(url, wait_until="domcontentloaded", timeout=25_000)
            # "networkidle" never comes on sites that poll or stream (YouTube); wait for
            # the load event a while, then a beat for fonts and hero animations.
            try:
                await page.wait_for_load_state("load", timeout=10_000)
            except PlaywrightTimeout:
                pass
            await page.wait_for_timeout(1_500)
            return await page.screenshot(type="png")
        finally:
            await browser.close()


def _thumbnail(png: bytes) -> bytes:
    from PIL import Image

    with Image.open(io.BytesIO(png)) as image:
        rgb = image.convert("RGB")
        height = round(rgb.height * THUMBNAIL_WIDTH / rgb.width)
        small = rgb.resize((THUMBNAIL_WIDTH, height), Image.Resampling.LANCZOS)
        out = io.BytesIO()
        small.save(out, "JPEG", quality=80, optimize=True, progressive=True)
        return out.getvalue()


async def run_capture(
    db: AsyncIOMotorDatabase[dict[str, Any]], *, workspace_id: str, project_id: str, token: str
) -> None:
    """The Playwright work, called from the Arq job wrapper. Does nothing when a newer
    capture was queued after this one, or the project is gone."""
    repo = ProjectRepository(db)
    doc = await repo.find_by_id(project_id)
    if doc is None or doc["workspace_id"] != workspace_id:
        return
    preview = doc.get("preview") or {}
    if preview.get("token") != token or not _wants_preview(doc):
        return
    origin = preview.get("origin") or doc["target_origin"]

    try:
        await asyncio.to_thread(assert_safe_to_fetch, origin)
    except ValueError as exc:
        await repo.fail_preview(workspace_id, project_id, token=token, error=str(exc))
        return
    try:
        thumbnail = await asyncio.to_thread(_thumbnail, await _screenshot(origin))
    except Exception as exc:  # noqa: BLE001 - any navigation/render failure is reportable
        await repo.fail_preview(workspace_id, project_id, token=token, error=str(exc))
        return

    key = f"previews/{workspace_id}/{project_id}/{token}.jpg"
    await upload_bytes(key, thumbnail, "image/jpeg")
    before = await repo.finish_preview(
        workspace_id,
        project_id,
        token=token,
        key=key,
        origin=origin,
        captured_at=datetime.now(UTC),
    )
    if before is None:
        await _delete_quietly(key)  # superseded while this one was rendering
        return
    replaced = (before.get("preview") or {}).get("key")
    if replaced and replaced != key:
        await _delete_quietly(replaced)
