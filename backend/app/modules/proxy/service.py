from dataclasses import dataclass
from datetime import UTC, datetime
from pathlib import Path
from typing import Any

import httpx
from motor.motor_asyncio import AsyncIOMotorDatabase

from app.core.config import get_settings
from app.core.errors import ConflictError, ExternalServiceError, NotFoundError
from app.core.ssrf_guard import MAX_REDIRECTS, assert_safe_to_fetch
from app.modules.projects.repository import ProjectRepository
from app.modules.proxy.rewriter import rewrite_html
from app.modules.share_links.repository import ShareLinkRepository

# Deliberately not forwarding any upstream response headers (CSP/X-Frame-Options would
# block the very page Backline is now serving; Set-Cookie would start a "session" this
# proxy never forwards on future requests - see docs/tdr/0008) - the router builds a
# fresh Response from just status/content_type/body below.

_WIDGET_SDK_PATH = Path(__file__).resolve().parents[4] / "apps" / "widget" / "dist" / "sdk.js"


@dataclass(frozen=True)
class ProxiedResponse:
    status_code: int
    content_type: str
    body: bytes


def _widget_sdk_version() -> str:
    """Cache-busting query param for the injected <script src> below - every proxy-mode
    guest is served the same static /widget/sdk.js URL, so without this, a guest whose
    browser already cached an older bundle would keep running that stale code
    indefinitely (even past a real fix landing) until they happened to hard-refresh.
    Tied to the built file's own mtime rather than a hardcoded version, so a fresh
    `pnpm build` here is picked up on the very next guest page load, no deploy-time
    coordination needed. Snippet mode (the agency's own `<script>` tag on their own
    site) isn't covered by this - that embed is outside anything this proxy serves."""
    try:
        return str(int(_WIDGET_SDK_PATH.stat().st_mtime))
    except OSError:
        return "0"


def _widget_script_tag(share_token: str) -> str:
    base = get_settings().public_api_base_url
    return (
        f'<script src="{base}/widget/sdk.js?v={_widget_sdk_version()}"></script>'
        f"<script>window.Backline && window.Backline.init("
        f'{{shareToken: "{share_token}", apiBaseUrl: "{base}"}});</script>'
    )


async def fetch_proxied_resource(
    db: AsyncIOMotorDatabase[dict[str, Any]], *, share_token: str, path: str, query_string: str
) -> ProxiedResponse:
    """Proxy/link mode (03-System-Architecture.md §3.3): fetches the target site's own
    response server-side and, only for HTML, injects the Review SDK and rewrites
    same-origin links to keep subsequent navigation on the proxy. Non-HTML (images,
    CSS, JS, fonts) passes through unmodified - `docs/tdr/0008` covers what this
    deliberately doesn't handle (passcode gating pre-content, JS-driven navigation,
    cookies, CSS url() rewriting)."""
    link = await ShareLinkRepository(db).find_by_token(share_token)
    if link is None:
        raise NotFoundError("This review link doesn't exist.")
    if link["revoked_at"] is not None:
        raise ConflictError("This review link has been revoked.")
    if link.get("expires_at") and link["expires_at"] <= datetime.now(UTC):
        raise ConflictError("This review link has expired.")

    project = await ProjectRepository(db).find_by_id(link["project_id"])
    if project is None or project.get("archived_at"):
        raise NotFoundError("Project not found.")
    target_origin = project["target_origin"].rstrip("/")

    upstream_url = f"{target_origin}/{path.lstrip('/')}"
    if query_string:
        upstream_url += f"?{query_string}"

    # SSRF guard (target_origin is validated as a non-private IP literal at save time,
    # but a hostname's DNS can still resolve internally, and a redirect can repoint to
    # an internal address mid-request) - resolve and reject before every hop, following
    # redirects manually instead of letting httpx auto-follow them unchecked.
    try:
        assert_safe_to_fetch(upstream_url)
    except ValueError as exc:
        raise ExternalServiceError(str(exc)) from exc

    try:
        async with httpx.AsyncClient(
            timeout=15.0, follow_redirects=False, headers={"User-Agent": "BacklineProxy/1.0"}
        ) as client:
            next_url = upstream_url
            for _ in range(MAX_REDIRECTS + 1):
                upstream = await client.get(next_url)
                if upstream.status_code not in (301, 302, 303, 307, 308):
                    break
                location = upstream.headers.get("location")
                if not location:
                    break
                next_url = str(httpx.URL(next_url).join(location))
                try:
                    assert_safe_to_fetch(next_url)
                except ValueError as exc:
                    raise ExternalServiceError(str(exc)) from exc
            else:
                raise ExternalServiceError("Too many redirects while reaching the reviewed site.")
    except httpx.HTTPError as exc:
        raise ExternalServiceError(f"Could not reach the reviewed site: {exc}") from exc

    content_type = upstream.headers.get("content-type", "application/octet-stream")

    if "text/html" in content_type:
        proxy_prefix = f"/proxy/{share_token}"
        html = upstream.text
        rewritten = rewrite_html(
            html,
            target_origin=target_origin,
            proxy_prefix=proxy_prefix,
            widget_script_tag=_widget_script_tag(share_token),
        )
        return ProxiedResponse(
            status_code=upstream.status_code, content_type=content_type, body=rewritten.encode()
        )

    return ProxiedResponse(
        status_code=upstream.status_code, content_type=content_type, body=upstream.content
    )
