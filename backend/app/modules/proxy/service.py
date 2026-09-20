import http.cookiejar
from dataclasses import dataclass
from datetime import UTC, datetime
from email.utils import format_datetime
from pathlib import Path
from typing import Any
from urllib.parse import urlsplit

import httpx
from motor.motor_asyncio import AsyncIOMotorDatabase

from app.core.config import get_settings
from app.core.errors import ConflictError, ExternalServiceError, NotFoundError
from app.core.ssrf_guard import MAX_REDIRECTS, assert_safe_to_fetch
from app.modules.projects.repository import ProjectRepository
from app.modules.proxy.rewriter import rewrite_html
from app.modules.share_links.repository import ShareLinkRepository

# Still not forwarding upstream *response* headers wholesale (CSP/X-Frame-Options would
# block the very page Backline is now serving) - the router builds a fresh Response from
# status/content_type/body. Set-Cookie is the one exception, and it's rewritten rather
# than copied: see _session_cookie_headers below. docs/tdr/0026 covers why the proxy
# carries a session at all now.

# A review proxy needs to carry a login form, not act as a general upload relay.
MAX_PROXY_BODY_BYTES = 2 * 1024 * 1024

_WIDGET_SDK_PATH = Path(__file__).resolve().parents[4] / "apps" / "widget" / "dist" / "sdk.js"


@dataclass(frozen=True)
class ProxiedResponse:
    status_code: int
    content_type: str
    body: bytes
    # Ready-made Set-Cookie header values (already namespaced and path-scoped).
    set_cookies: tuple[str, ...] = ()
    # Set instead of a body when the reviewer's browser should do the next hop itself,
    # so the frame's URL keeps matching the page it's showing.
    location: str | None = None


@dataclass(frozen=True)
class ProxyRequest:
    """The parts of the reviewer's own request that may need to reach the target site.
    Defaults reproduce the original GET-only behavior exactly."""

    method: str = "GET"
    body: bytes = b""
    cookie_header: str = ""
    content_type: str | None = None
    referer: str | None = None


def _cookie_prefix(share_token: str) -> str:
    """Session cookies live in the reviewer's browser on Backline's own origin, so they
    are namespaced per share link. Two things fall out of that: Backline's own cookies
    can never be mistaken for the reviewed site's and forwarded upstream, and two share
    links pointing at two different sites can't read each other's session. `Path` below
    enforces the same split a second time, at the browser."""
    return f"blp_{share_token}_"


def _cookies_for_upstream(cookie_header: str, share_token: str) -> dict[str, str]:
    prefix = _cookie_prefix(share_token)
    cookies: dict[str, str] = {}
    for part in cookie_header.split(";"):
        name, _, value = part.strip().partition("=")
        if name.startswith(prefix) and len(name) > len(prefix):
            cookies[name[len(prefix) :]] = value
    return cookies


def _session_cookie_headers(jar: http.cookiejar.CookieJar, share_token: str) -> tuple[str, ...]:
    """Mirrors the site's own cookies back to the reviewer under Backline's origin.

    The canvas is an iframe on the dashboard's origin pointing at the API's, which is
    cross-site in production - so these need SameSite=None, and `Partitioned` (CHIPS) so
    they survive third-party cookie restrictions by being keyed to the dashboard page
    that opened them. Locally both run on localhost, which is same-site, so Lax applies
    and Secure/Partitioned can't (there's no HTTPS to carry them). Same environment
    split as the refresh cookie in modules/auth/router.py."""
    secure = get_settings().environment != "local"
    prefix = _cookie_prefix(share_token)
    path = f"/proxy/{share_token}"
    headers: list[str] = []
    for cookie in jar:
        parts = [f"{prefix}{cookie.name}={cookie.value or ''}", f"Path={path}"]
        if cookie.expires:
            expires = datetime.fromtimestamp(cookie.expires, UTC)
            parts.append(f"Expires={format_datetime(expires, usegmt=True)}")
        # The reviewed page's own scripts may need to read its cookies, so whether they
        # can is the site's call, not ours.
        if cookie.has_nonstandard_attr("HttpOnly"):
            parts.append("HttpOnly")
        if secure:
            parts.extend(["Secure", "SameSite=None", "Partitioned"])
        else:
            parts.append("SameSite=Lax")
        headers.append("; ".join(parts))
    return tuple(headers)


def _upstream_referer(referer: str | None, *, share_token: str, target_origin: str) -> str | None:
    """The browser's Referer points at Backline's proxy URL; a site checking it (or
    Origin) against its own host would reject the form. Mapped back to the address the
    same page really has on the site, which is where the form was served from."""
    if not referer:
        return None
    marker = f"/proxy/{share_token}"
    index = referer.find(marker)
    if index == -1:
        return None
    return f"{target_origin}{referer[index + len(marker) :] or '/'}"


def _location_for_browser(
    location: str, *, base_url: str, target_origin: str, share_token: str
) -> str:
    """Keeps a post-login redirect inside the proxy. A redirect somewhere else entirely
    (an SSO host, say) is returned as the absolute URL it is - Backline has no share
    link for that origin and shouldn't invent one."""
    absolute = str(httpx.URL(base_url).join(location))
    parsed = urlsplit(absolute)
    if f"{parsed.scheme}://{parsed.netloc}" != target_origin:
        return absolute
    rest = parsed.path or "/"
    if parsed.query:
        rest += f"?{parsed.query}"
    return f"/proxy/{share_token}{rest}"


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
    db: AsyncIOMotorDatabase[dict[str, Any]],
    *,
    share_token: str,
    path: str,
    query_string: str,
    incoming: ProxyRequest | None = None,
) -> ProxiedResponse:
    """Proxy/link mode (03-System-Architecture.md §3.3): fetches the target site's own
    response server-side and, only for HTML, injects the Review SDK and rewrites
    same-origin links to keep subsequent navigation on the proxy. Non-HTML (images,
    CSS, JS, fonts) passes through unmodified.

    Forms and the session they establish are carried too (docs/tdr/0026), so a reviewer
    can sign in to the site being reviewed from inside the canvas and go on to review
    the pages behind its login. `docs/tdr/0008` still covers what this deliberately
    doesn't handle: JS-driven navigation, CSS url() rewriting, and anything that needs a
    real general-purpose reverse proxy."""
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

    request = incoming or ProxyRequest()
    method = request.method.upper()

    # SSRF guard (target_origin is validated as a non-private IP literal at save time,
    # but a hostname's DNS can still resolve internally, and a redirect can repoint to
    # an internal address mid-request) - resolve and reject before every hop, following
    # redirects manually instead of letting httpx auto-follow them unchecked.
    try:
        assert_safe_to_fetch(upstream_url)
    except ValueError as exc:
        raise ExternalServiceError(str(exc)) from exc

    upstream_headers = {"User-Agent": "BacklineProxy/1.0", "Origin": target_origin}
    if request.content_type:
        upstream_headers["Content-Type"] = request.content_type
    referer = _upstream_referer(
        request.referer, share_token=share_token, target_origin=target_origin
    )
    if referer:
        upstream_headers["Referer"] = referer

    try:
        async with httpx.AsyncClient(
            timeout=15.0, follow_redirects=False, headers=upstream_headers
        ) as client:
            # Seeded from the reviewer's browser so an established session keeps
            # working on every later request; httpx then keeps the jar up to date
            # across redirect hops, which is where a login's cookie usually arrives.
            upstream_host = httpx.URL(upstream_url).host
            for name, value in _cookies_for_upstream(request.cookie_header, share_token).items():
                client.cookies.set(name, value, domain=upstream_host)

            if method != "GET":
                # A form submission is answered with the redirect itself rather than
                # followed here: the reviewer's browser makes the next hop, so the
                # frame's URL ends up on the page it's actually showing (and the
                # session cookie rides along on this response).
                upstream = await client.request(method, upstream_url, content=request.body)
                location = upstream.headers.get("location")
                if upstream.status_code in (301, 302, 303, 307, 308) and location:
                    return ProxiedResponse(
                        status_code=303,
                        content_type="text/plain",
                        body=b"",
                        set_cookies=_session_cookie_headers(client.cookies.jar, share_token),
                        location=_location_for_browser(
                            location,
                            base_url=upstream_url,
                            target_origin=target_origin,
                            share_token=share_token,
                        ),
                    )
            else:
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
                    raise ExternalServiceError(
                        "Too many redirects while reaching the reviewed site."
                    )
            set_cookies = _session_cookie_headers(client.cookies.jar, share_token)
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
            status_code=upstream.status_code,
            content_type=content_type,
            body=rewritten.encode(),
            set_cookies=set_cookies,
        )

    return ProxiedResponse(
        status_code=upstream.status_code,
        content_type=content_type,
        body=upstream.content,
        set_cookies=set_cookies,
    )
