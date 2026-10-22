import re

from fastapi import APIRouter, Request
from fastapi.responses import RedirectResponse

from app.core.errors import NotFoundError

router = APIRouter(tags=["proxy"])

_PROXY_REFERER = re.compile(r"^https?://[^/]+/proxy/([^/]+)/")


async def _unmatched_path_fallback(full_path: str, request: Request) -> RedirectResponse:
    """Guest-facing safety net for a gap `docs/tdr/0008` already documents as
    deliberately out of scope: the proxy's HTML rewriter only rewrites `href`/`src`/
    `action` attributes present in the server-rendered markup (modules/proxy/rewriter.py)
    - it can't touch a target site's own client-side JS (a live search box doing
    `location.href = "/search?q=..."` on Enter, or markup a client-rendered widget
    injects after the initial load). That still causes a real top-level browser
    navigation, which lands here as a request straight to this API's own origin/root
    instead of through `/proxy/{token}/...`, since the JS built an absolute path with no
    idea it's running inside a proxy.

    A real fix is the service-worker-based interception `docs/tdr/0008` scoped out as a
    multi-week project. This is a much smaller, safe stopgap: the browser's own Referer
    header still carries the `/proxy/{token}/...` page the navigation started from, so
    when it does, redirect back through that same token instead of surfacing a bare
    404 - the common "typed into the reviewed site's own search box" case. Registered
    last (app/main.py) so it only ever catches requests no other route matched; anything
    without a recognizable proxy Referer still 404s, just with this API's normal JSON
    error envelope instead of Starlette's default `{"detail": "..."}` body.
    """
    referer = request.headers.get("referer", "")
    match = _PROXY_REFERER.match(referer)
    if not match:
        raise NotFoundError("Not found.")

    target = f"/proxy/{match.group(1)}/{full_path}"
    if request.url.query:
        target += f"?{request.url.query}"
    # 307: preserves the original method (and body, for a POSTed search form) - a 302/303
    # would silently downgrade a POST to GET on redirect, changing what actually happens.
    return RedirectResponse(target, status_code=307)


# Two separate decorators (not one @router.api_route(methods=["GET", "POST"])) sharing
# the implementation above: FastAPI derives each operation's default id from function
# name + path, and a single function registered for both methods produced the *same*
# id for both - openapi-typescript then choked on the duplicate. Distinct function
# names (and so distinct default ids) side-step that.
@router.get("/{full_path:path}")
async def unmatched_path_fallback_get(full_path: str, request: Request) -> RedirectResponse:
    return await _unmatched_path_fallback(full_path, request)


@router.post("/{full_path:path}")
async def unmatched_path_fallback_post(full_path: str, request: Request) -> RedirectResponse:
    return await _unmatched_path_fallback(full_path, request)


@router.head("/{full_path:path}", include_in_schema=False)
async def unmatched_path_fallback_head(full_path: str, request: Request) -> RedirectResponse:
    return await _unmatched_path_fallback(full_path, request)
