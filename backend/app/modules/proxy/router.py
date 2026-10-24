import asyncio
import gzip
import html

from fastapi import APIRouter, Request, Response
from fastapi.responses import HTMLResponse

from app.core.config import get_settings
from app.core.db import get_db
from app.core.errors import BacklineError, ValidationError
from app.core.rate_limit import check_rate_limit, get_client_ip
from app.core.redis_client import get_redis
from app.modules.proxy import service as proxy_service
from app.modules.proxy.preview_middleware import PREVIEW_HOST_STATE_KEY
from app.modules.proxy.service import MAX_PROXY_BODY_BYTES, ProxiedResponse, ProxyRequest
from app.modules.session_sync import service as session_sync_service

router = APIRouter(tags=["proxy"])

# httpx hands the service a decompressed body, so without this every script and
# stylesheet went to the reviewer's browser at full size - often 3-5x the bytes the
# site itself would have sent.
_COMPRESSIBLE_TYPES = (
    "text/",
    "application/javascript",
    "application/x-javascript",
    "application/json",
    "application/ld+json",
    "application/manifest+json",
    "application/xml",
    "image/svg+xml",
)
_MIN_COMPRESS_BYTES = 1024
_COMPRESS_OFF_LOOP_BYTES = 64 * 1024


async def _read_body(request: Request) -> bytes:
    """Bounded twice: the declared length first, so an oversized upload is refused
    before it's read into memory, then the bytes actually received, since
    Content-Length is only a claim."""
    if request.method in ("GET", "HEAD"):
        return b""
    declared = request.headers.get("content-length")
    if declared:
        try:
            if int(declared) > MAX_PROXY_BODY_BYTES:
                raise ValidationError("That form submission is too large to proxy.")
        except ValueError:
            raise ValidationError("Malformed Content-Length.") from None
    body = bytearray()
    async for chunk in request.stream():
        if len(body) + len(chunk) > MAX_PROXY_BODY_BYTES:
            raise ValidationError("That form submission is too large to proxy.")
        body.extend(chunk)
    return bytes(body)


async def _maybe_compress(request: Request, result: ProxiedResponse) -> tuple[bytes, bool]:
    body = result.body
    has_range = any(name == "content-range" for name, _ in result.extra_headers)
    if (
        len(body) < _MIN_COMPRESS_BYTES
        or result.status_code in (204, 206, 304)
        or has_range
        or "gzip" not in request.headers.get("accept-encoding", "").lower()
        or not result.content_type.lower().startswith(_COMPRESSIBLE_TYPES)
    ):
        return body, False
    if len(body) >= _COMPRESS_OFF_LOOP_BYTES:
        return await asyncio.to_thread(gzip.compress, body, 5), True
    return gzip.compress(body, 5), True


async def _proxy(share_token: str, path: str, request: Request) -> Response:
    settings = get_settings()
    # Per link as well as per IP: a single page load through the proxy is every one of
    # its scripts, images and API calls, and an agency's reviewers commonly share one
    # office IP - one bucket for all of that was what cut pages off mid-load.
    await check_rate_limit(
        get_redis(),
        key=f"rate-limit:proxy:{share_token}:{get_client_ip(request)}",
        limit=settings.proxy_rate_limit_per_minute,
        window_seconds=60,
    )
    try:
        result = await _fetch(share_token, path, request)
    except BacklineError as exc:
        if _wants_page(request):
            return _error_page(exc)
        raise
    body, compressed = await _maybe_compress(request, result)
    response = Response(
        content=body,
        status_code=result.status_code,
        media_type=result.content_type,
        headers={"location": result.location} if result.location else None,
    )
    for name, value in result.extra_headers:
        response.headers[name] = value
    if compressed:
        response.headers["content-encoding"] = "gzip"
        response.headers["vary"] = "accept-encoding"
    for cookie in result.set_cookies:
        response.headers.append("set-cookie", cookie)
    if request.method == "HEAD":
        # _bounded_request does not download the GET representation. Starlette's
        # empty Response would otherwise advertise a false Content-Length: 0.
        if "content-length" in response.headers:
            del response.headers["content-length"]
    return response


def _wants_page(request: Request) -> bool:
    """A browser navigation (the review iframe, or a link opened in it) rather than a
    script's fetch: it gets a readable page instead of the API's JSON error."""
    destination = request.headers.get("sec-fetch-dest", "")
    if destination in ("document", "iframe", "frame"):
        return True
    return request.method == "GET" and "text/html" in request.headers.get("accept", "")


_ERROR_PAGE_HEAD = """<!doctype html><html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Website unavailable</title><style>
body{margin:0;min-height:100vh;display:grid;place-items:center;background:#F4F4F1;
font:14px/1.55 -apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif;color:#20231E}
main{max-width:440px;margin:24px;padding:28px;border:1px solid #D9DCD5;border-radius:6px;
background:#fff;text-align:center}
h1{margin:0 0 8px;font-size:17px}p{margin:0 0 10px;color:#5D635A}
code{font-size:12px;color:#8E3419}</style></head>"""


def _error_page(exc: BacklineError) -> HTMLResponse:
    message = html.escape(exc.message or "The website could not be loaded.")
    body = (
        _ERROR_PAGE_HEAD
        + "<body><main><h1>This website couldn't be loaded for review</h1>"
        + "<p>The review preview couldn't reach the site. It may be down, private, or "
        + "blocking embedded previews.</p>"
        + "<p>Use <b>Open with extension</b> in Backline to review the real website "
        + "in your browser.</p>"
        + f"<p><code>{message}</code></p></main></body></html>"
    )
    return HTMLResponse(body, status_code=exc.status_code)


async def _fetch(share_token: str, path: str, request: Request) -> ProxiedResponse:
    return await proxy_service.fetch_proxied_resource(
        get_db(),
        share_token=share_token,
        path=path,
        query_string=request.url.query,
        incoming=ProxyRequest(
            method=request.method,
            body=await _read_body(request),
            # The whole Cookie header, not a picked-out value: the service is what
            # decides which of these belong to the reviewed site (only its own
            # namespaced ones) and strips the rest.
            cookie_header=request.headers.get("cookie", ""),
            content_type=request.headers.get("content-type"),
            referer=request.headers.get("referer"),
            # The service forwards only an allowlist of these (auth, CSRF, content
            # negotiation, validators) - see _forwarded_headers.
            headers=dict(request.headers),
            preview_host=request.scope.get("state", {}).get(PREVIEW_HOST_STATE_KEY, False),
        ),
    )


# One function per method rather than one api_route(methods=[...]): FastAPI derives an
# operation id from the function name and path, and one function on two methods produces
# a duplicate that openapi-typescript rejects - the same trap
# modules/proxy/fallback_router.py documents. GET/POST are the long-standing, documented
# routes; PUT/PATCH/DELETE are only ever a reviewed site's own scripts (reaching the proxy
# through modules/proxy/interceptor.py), so they stay out of the public API schema.
@router.get("/proxy/{share_token}")
async def proxy_root(share_token: str, request: Request) -> Response:
    return await _proxy(share_token, "/", request)


@router.post("/proxy/{share_token}")
async def proxy_root_post(share_token: str, request: Request) -> Response:
    return await _proxy(share_token, "/", request)


@router.head("/proxy/{share_token}", include_in_schema=False)
async def proxy_root_head(share_token: str, request: Request) -> Response:
    return await _proxy(share_token, "/", request)


# Registered before the catch-all path route below: Starlette tries routes in
# registration order, and `{path:path}` matches greedily enough to swallow this literal
# path too - session-sync (docs/tdr/0041) has to be handled by Backline itself, never
# forwarded upstream as if it were a page on the reviewed site.
@router.get("/proxy/{share_token}/__backline/session-sync", include_in_schema=False)
async def proxy_session_sync_redeem(share_token: str, ticket: str, request: Request) -> Response:
    result = await session_sync_service.redeem_ticket(
        get_db(),
        get_redis(),
        share_token=share_token,
        ticket=ticket,
        preview_host=bool(request.scope.get("state", {}).get(PREVIEW_HOST_STATE_KEY, False)),
    )
    response = Response(content=result.html, media_type="text/html")
    for cookie in result.set_cookies:
        response.headers.append("set-cookie", cookie)
    return response


@router.get("/proxy/{share_token}/{path:path}")
async def proxy_path(share_token: str, path: str, request: Request) -> Response:
    return await _proxy(share_token, path, request)


@router.post("/proxy/{share_token}/{path:path}")
async def proxy_path_post(share_token: str, path: str, request: Request) -> Response:
    return await _proxy(share_token, path, request)


@router.head("/proxy/{share_token}/{path:path}", include_in_schema=False)
async def proxy_path_head(share_token: str, path: str, request: Request) -> Response:
    return await _proxy(share_token, path, request)


@router.put("/proxy/{share_token}/{path:path}", include_in_schema=False)
async def proxy_path_put(share_token: str, path: str, request: Request) -> Response:
    return await _proxy(share_token, path, request)


@router.patch("/proxy/{share_token}/{path:path}", include_in_schema=False)
async def proxy_path_patch(share_token: str, path: str, request: Request) -> Response:
    return await _proxy(share_token, path, request)


@router.delete("/proxy/{share_token}/{path:path}", include_in_schema=False)
async def proxy_path_delete(share_token: str, path: str, request: Request) -> Response:
    return await _proxy(share_token, path, request)
