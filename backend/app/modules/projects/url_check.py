"""Checks a website project's review URL while it is being entered (TDR-0206).

People type "staging.client.com" or "localhost:3000" without a scheme. Assuming https
broke every http-only staging server, and the project only showed "Loading..." later.
Before the project is saved, the form asks this module: it tries the address the way
it was typed (https when no scheme was given, then http if https doesn't answer) and
says whether it loads, asks for sign-in, is behind bot protection, or can't be reached.

Requests go through the SSRF-guarded client; only status and headers plus the first
20 KB of the body are read.
"""

import re
from dataclasses import dataclass
from typing import Literal

import httpx

from app.core.ssrf_guard import guarded_client
from app.modules.projects.schemas import normalize_origin
from app.modules.proxy.service import _CHALLENGE_MARKERS

UrlCheckStatus = Literal["ok", "sign_in", "blocked", "error_status", "unreachable"]

_SCHEME = re.compile(r"^[a-zA-Z][a-zA-Z0-9+.-]*://")
_SIGN_IN_PATH = re.compile(r"/(log-?in|sign-?in|auth|sso|account/login)\b", re.IGNORECASE)
_USER_AGENT = (
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
    "(KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36 Backline-Check"
)


@dataclass(frozen=True)
class UrlCheck:
    url: str
    status: UrlCheckStatus
    http_status: int | None
    message: str


async def _fetch(url: str) -> tuple[int, str, bool]:
    """(status, final URL, looks like a bot challenge). Raises httpx errors."""
    async with (
        guarded_client(
            timeout=httpx.Timeout(8.0, connect=5.0),
            follow_redirects=True,
            max_redirects=5,
            headers={"User-Agent": _USER_AGENT, "Accept": "text/html,*/*;q=0.8"},
        ) as client,
        client.stream("GET", url) as response,
    ):
        challenged = response.headers.get("cf-mitigated", "").lower() == "challenge"
        if not challenged and response.status_code in (403, 429, 503):
            head = b""
            async for chunk in response.aiter_bytes():
                head += chunk
                if len(head) >= 20_000:
                    break
            text = head.decode("utf-8", errors="replace").lower()
            challenged = any(marker in text for marker in _CHALLENGE_MARKERS)
        return response.status_code, str(response.url), challenged


def _verdict(url: str, status: int, final_url: str, challenged: bool) -> UrlCheck:
    if challenged:
        return UrlCheck(
            url,
            "blocked",
            status,
            "This site uses bot protection, so the in-app preview may not load. Reviewers "
            "can still use Open with extension on the real site.",
        )
    if status in (401, 403) or _SIGN_IN_PATH.search(httpx.URL(final_url).path or ""):
        return UrlCheck(
            url,
            "sign_in",
            status,
            "This page asks for a sign-in. Reviewers sign in on the real site with Open "
            "with extension; the preview shows what a signed-out visitor sees.",
        )
    if status >= 400:
        return UrlCheck(
            url,
            "error_status",
            status,
            f"The site answered with error {status}. Check the address, or save it and "
            "try again once the site is up.",
        )
    return UrlCheck(url, "ok", status, "The page loads.")


async def check_review_url(raw: str) -> UrlCheck:
    """Raises ValueError for an address Backline can't use at all (bad syntax, private
    network in production) - the same rules as saving the project."""
    typed_scheme = bool(_SCHEME.match(raw.strip()))
    normalized = normalize_origin(raw)
    candidates = [normalized]
    if not typed_scheme and normalized.startswith("https://"):
        candidates.append("http://" + normalized.removeprefix("https://"))
    for candidate in candidates:
        try:
            status, final_url, challenged = await _fetch(candidate)
        except (httpx.HTTPError, ValueError, OSError):
            continue
        return _verdict(candidate, status, final_url, challenged)
    return UrlCheck(
        normalized,
        "unreachable",
        None,
        "Backline couldn't reach this address. Check it for typos; if the site is only "
        "reachable on your network or VPN, reviewers can use Open with extension.",
    )
