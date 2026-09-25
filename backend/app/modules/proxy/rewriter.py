import re
from urllib.parse import urlsplit

# Attribute-value rewriting via regex rather than a full HTML parser (no new heavy
# dependency for a "4-5 day" milestone item, 20-Build-Plan.md) - deliberately scoped to
# the common case: root-relative and same-origin-absolute href/src/action attributes.
# What a page's own scripts request after load (fetch/XHR/history.pushState, elements
# added later) is interceptor.py's job, injected by this same function (docs/tdr/0035).
# Still not handled here: CSS url(...) references, srcset, or malformed/unusual HTML -
# those reach the reviewed site through fallback_router.py's Referer redirect instead.
_ATTR_PATTERN = re.compile(
    r'(?P<attr>\b(?:href|src|action)=)(?P<quote>["\'])(?P<value>[^"\']*)(?P=quote)', re.IGNORECASE
)

_SKIP_PREFIXES = ("#", "//", "mailto:", "tel:", "javascript:", "data:")


def _bare_host(netloc: str) -> str:
    """`acme.com` and `www.acme.com` are the same reviewed site - a project saved as one
    is routinely served (and links to itself) as the other."""
    netloc = netloc.lower()
    return netloc[4:] if netloc.startswith("www.") else netloc


def _rewrite_url(value: str, *, target_origin: str, proxy_prefix: str) -> str:
    if not value or value.startswith(_SKIP_PREFIXES):
        return value

    if value.startswith("/"):
        return f"{proxy_prefix}{value}"

    parsed_target = urlsplit(target_origin)
    parsed_value = urlsplit(value)
    if parsed_value.scheme and parsed_value.netloc:
        if _bare_host(parsed_value.netloc) == _bare_host(parsed_target.netloc):
            rest = parsed_value.path or "/"
            if parsed_value.query:
                rest += f"?{parsed_value.query}"
            if parsed_value.fragment:
                rest += f"#{parsed_value.fragment}"
            return f"{proxy_prefix}{rest}"
        # Different origin entirely (a CDN, a third-party widget, etc.) - left as-is;
        # it simply won't be proxied, which is safe (just slower/direct), not broken.
        return value

    # A bare relative path like "about" or "../foo" - resolve it against the current
    # request path so it still routes through the proxy rather than 404ing there.
    return value


_HEAD_OPEN = re.compile(r"<head\b[^>]*>", re.IGNORECASE)
_HTML_OPEN = re.compile(r"<html\b[^>]*>", re.IGNORECASE)


def _inject_first(html: str, script: str) -> str:
    """As early in the document as possible, so a script that patches the page's own
    network APIs (interceptor.py) is installed before any of the site's scripts run."""
    if not script:
        return html
    for pattern in (_HEAD_OPEN, _HTML_OPEN):
        found = pattern.search(html)
        if found:
            return html[: found.end()] + script + html[found.end() :]
    return script + html


def rewrite_html(
    html: str,
    *,
    target_origin: str,
    proxy_prefix: str,
    widget_script_tag: str,
    head_script: str = "",
) -> str:
    """`proxy_prefix` is `/proxy/{share_token}` - every rewritten root-relative or
    same-origin link is prefixed with it so subsequent navigation stays on Backline's
    proxy instead of jumping back to the real site directly."""

    def _replace(match: re.Match[str]) -> str:
        value = match.group("value")
        new_value = _rewrite_url(value, target_origin=target_origin, proxy_prefix=proxy_prefix)
        quote = match.group("quote")
        return f"{match.group('attr')}{quote}{new_value}{quote}"

    # The interceptor goes in after attribute rewriting so the regex never sees (or
    # rewrites) the proxy paths inside the injected script itself.
    rewritten = _inject_first(_ATTR_PATTERN.sub(_replace, html), head_script)

    body_close = re.search(r"</body\s*>", rewritten, re.IGNORECASE)
    if body_close:
        idx = body_close.start()
        return rewritten[:idx] + widget_script_tag + rewritten[idx:]
    return rewritten + widget_script_tag
