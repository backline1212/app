"""Project card previews (TDR-0058): a picture of a website project's site, so the
projects grid shows each site instead of a generic sketch.

Captures run on the worker (app/workers/project_preview.py); the API only decides when
one is due and queues it. With SERVER_BROWSER_ENABLED the worker screenshots the top of
the page in Chromium; otherwise, or when that fails, it uses the site's own share image
(og:image, TDR-0196 - preview_sources.py), which needs no browser. A capture is
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
from app.core.config import get_settings
from app.core.review_url import project_start_url
from app.core.server_browser import require_server_browser
from app.core.ssrf_guard import assert_safe_to_fetch
from app.modules.pages.repository import PageRepository
from app.modules.projects.preview_sources import social_image, usable_picture
from app.modules.projects.repository import ProjectRepository
from app.modules.projects.schemas import ProjectOut
from app.modules.storage.quota import store_bytes
from app.modules.storage.quota_repository import StorageQuotaRepository
from app.modules.storage.r2_client import delete_object, generate_presigned_gets

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
    if force or status is None or preview.get("origin") != project_start_url(doc):
        return True
    # A member's real screenshot from the extension beats the share image a refresh
    # without the server browser would fetch; keep it (TDR-0197).
    if preview.get("source") == "extension" and not get_settings().server_browser_enabled:
        return False
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
        origin=project_start_url(doc),
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
        if preview.get("key") and preview.get("key_origin") == project_start_url(doc):
            keys[str(doc["_id"])] = preview["key"]
    # Plan B (TDR-0197): a site that blocks the capture worker (bot protection) or has
    # no share image still has a picture once someone comments on it with the extension
    # or the review link - the newest comment screenshot.
    fallback_at: dict[str, datetime] = {}
    try:
        for project_id, (shot_key, shot_at) in (
            await _comment_screenshots(db, [d for d in docs if str(d["_id"]) not in keys])
        ).items():
            keys[project_id] = shot_key
            fallback_at[project_id] = shot_at
    except Exception:  # noqa: BLE001 - a missing fallback costs a picture, not the list
        logger.warning("Could not look up comment screenshots for previews", exc_info=True)
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
                    "preview_captured_at": fallback_at.get(str(doc["_id"]))
                    or (_aware(preview.get("captured_at")) if key else None),
                    "preview_requested_at": _aware(preview.get("requested_at")),
                }
            )
        )
    return result


async def store_member_capture(
    db: AsyncIOMotorDatabase[dict[str, Any]], doc: dict[str, Any], picture: bytes
) -> bool:
    """Keep a member's screenshot of the start page (the extension, TDR-0197) as the
    card picture unless the card already has a recent real screenshot."""
    if not _wants_preview(doc):
        return False
    now = datetime.now(UTC)
    preview = doc.get("preview") or {}
    origin = project_start_url(doc)
    captured_at = _aware(preview.get("captured_at"))
    has_real_shot = (
        preview.get("status") == "ready"
        and preview.get("key_origin") == origin
        and preview.get("source", "screenshot") in ("screenshot", "extension")
        and captured_at is not None
        and now - captured_at < STALE_AFTER
    )
    if has_real_shot or not usable_picture(picture):
        return False
    thumbnail = await asyncio.to_thread(_thumbnail, picture)
    workspace_id, project_id = doc["workspace_id"], str(doc["_id"])
    repo = ProjectRepository(db)
    token = uuid.uuid4().hex
    if not await repo.claim_preview(
        workspace_id,
        project_id,
        previous_token=preview.get("token"),
        token=token,
        origin=origin,
        requested_at=now,
    ):
        return False
    key = f"previews/{workspace_id}/{project_id}/{token}.jpg"
    try:
        await store_bytes(
            db,
            workspace_id=workspace_id,
            project_id=project_id,
            key=key,
            data=thumbnail,
            content_type="image/jpeg",
        )
    except Exception as exc:
        await repo.fail_preview(workspace_id, project_id, token=token, error=str(exc))
        raise
    before = await repo.finish_preview(
        workspace_id,
        project_id,
        token=token,
        key=key,
        origin=origin,
        captured_at=now,
        source="extension",
    )
    if before is None:
        await _delete_quietly(db, workspace_id, key)
        return False
    replaced = (before.get("preview") or {}).get("key")
    if replaced and replaced != key:
        await _delete_quietly(db, workspace_id, replaced)
    return True


async def _comment_screenshots(
    db: AsyncIOMotorDatabase[dict[str, Any]], docs: list[dict[str, Any]]
) -> dict[str, tuple[str, datetime]]:
    """project_id -> (key, created_at) of its newest comment screenshot."""
    wanted: dict[str, list[str]] = {}
    for doc in docs:
        if _wants_preview(doc):
            wanted.setdefault(doc["workspace_id"], []).append(str(doc["_id"]))
    result: dict[str, tuple[str, datetime]] = {}
    pages = PageRepository(db)
    for workspace_id, project_ids in wanted.items():
        page_projects = await pages.project_ids_by_page(workspace_id, project_ids)
        shots = await pages.latest_comment_screenshots(workspace_id, list(page_projects))
        for page_id, (key, at) in shots.items():
            project_id = page_projects[page_id]
            created = _aware(at) or datetime.now(UTC)
            if project_id not in result or created > result[project_id][1]:
                result[project_id] = (key, created)
    return result


async def _delete_quietly(
    db: AsyncIOMotorDatabase[dict[str, Any]], workspace_id: str, key: str
) -> None:
    try:
        await delete_object(key)
        await StorageQuotaRepository(db).release_deleted(workspace_id, key)
    except Exception:  # noqa: BLE001 - an orphaned thumbnail is cleaned up on hard delete
        logger.warning("Could not delete project preview %s", key, exc_info=True)


async def _screenshot(url: str) -> bytes:
    require_server_browser()
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


def _thumbnail(picture: bytes) -> bytes:
    from PIL import Image

    with Image.open(io.BytesIO(picture)) as image:
        rgba = image.convert("RGBA")
        # Transparent share images (logos on a clear background) go on white, not black.
        rgb = Image.new("RGB", rgba.size, (255, 255, 255))
        rgb.paste(rgba, mask=rgba.getchannel("A"))
        width = min(THUMBNAIL_WIDTH, rgb.width)
        height = round(rgb.height * width / rgb.width)
        small = rgb.resize((width, height), Image.Resampling.LANCZOS)
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
    origin = preview.get("origin") or project_start_url(doc)

    try:
        await asyncio.to_thread(assert_safe_to_fetch, origin)
    except ValueError as exc:
        await repo.fail_preview(workspace_id, project_id, token=token, error=str(exc))
        return
    picture: bytes | None = None
    source = "screenshot"
    errors: list[str] = []
    if get_settings().server_browser_enabled:
        try:
            picture = await _screenshot(origin)
        except Exception as exc:  # noqa: BLE001 - any navigation/render failure is reportable
            errors.append(str(exc))
    if picture is None:
        source = "share-image"
        try:
            picture = await social_image(origin)
        except Exception as exc:  # noqa: BLE001 - unreachable site, no share image, ...
            errors.append(str(exc))
    try:
        if picture is None:
            raise ValueError(" ".join(errors) or "No preview picture was found.")
        thumbnail = await asyncio.to_thread(_thumbnail, picture)
    except Exception as exc:  # noqa: BLE001
        await repo.fail_preview(workspace_id, project_id, token=token, error=str(exc))
        return

    key = f"previews/{workspace_id}/{project_id}/{token}.jpg"
    try:
        await store_bytes(
            db,
            workspace_id=workspace_id,
            project_id=project_id,
            key=key,
            data=thumbnail,
            content_type="image/jpeg",
        )
    except Exception as exc:
        await repo.fail_preview(workspace_id, project_id, token=token, error=str(exc))
        return
    before = await repo.finish_preview(
        workspace_id,
        project_id,
        token=token,
        key=key,
        origin=origin,
        captured_at=datetime.now(UTC),
        source=source,
    )
    if before is None:
        await _delete_quietly(db, workspace_id, key)  # superseded while rendering
        return
    replaced = (before.get("preview") or {}).get("key")
    if replaced and replaced != key:
        await _delete_quietly(db, workspace_id, replaced)
