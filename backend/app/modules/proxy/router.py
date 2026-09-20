from fastapi import APIRouter, Request, Response

from app.core.config import get_settings
from app.core.db import get_db
from app.core.errors import ValidationError
from app.core.rate_limit import check_rate_limit, get_client_ip
from app.core.redis_client import get_redis
from app.modules.proxy import service as proxy_service
from app.modules.proxy.service import MAX_PROXY_BODY_BYTES, ProxyRequest

router = APIRouter(tags=["proxy"])


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
    body = await request.body()
    if len(body) > MAX_PROXY_BODY_BYTES:
        raise ValidationError("That form submission is too large to proxy.")
    return body


async def _proxy(share_token: str, path: str, request: Request) -> Response:
    settings = get_settings()
    await check_rate_limit(
        get_redis(),
        key=f"rate-limit:proxy:{get_client_ip(request)}",
        limit=settings.proxy_rate_limit_per_minute,
        window_seconds=60,
    )
    result = await proxy_service.fetch_proxied_resource(
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
        ),
    )
    response = Response(
        content=result.body,
        status_code=result.status_code,
        media_type=result.content_type,
        headers={"location": result.location} if result.location else None,
    )
    for cookie in result.set_cookies:
        response.headers.append("set-cookie", cookie)
    return response


# GET and POST only, same as the fallback router: a form is what a login is, and
# PUT/PATCH/DELETE only ever reach a site through its own JS, which this proxy doesn't
# rewrite anyway (docs/tdr/0008). Separate functions per method rather than one
# api_route(methods=[...]): FastAPI derives an operation id from the function name and
# path, and one function on two methods produces a duplicate that openapi-typescript
# rejects - the same trap modules/proxy/fallback_router.py documents.
@router.get("/proxy/{share_token}")
async def proxy_root(share_token: str, request: Request) -> Response:
    return await _proxy(share_token, "/", request)


@router.post("/proxy/{share_token}")
async def proxy_root_post(share_token: str, request: Request) -> Response:
    return await _proxy(share_token, "/", request)


@router.get("/proxy/{share_token}/{path:path}")
async def proxy_path(share_token: str, path: str, request: Request) -> Response:
    return await _proxy(share_token, path, request)


@router.post("/proxy/{share_token}/{path:path}")
async def proxy_path_post(share_token: str, path: str, request: Request) -> Response:
    return await _proxy(share_token, path, request)
