"""SSRF guards shared by every feature that makes a server-side HTTP request to a
URL a workspace member controls (the review proxy and the browser-render worker).
Two layers, because they catch different things:

- `is_public_hostname_literal` - a cheap, DNS-free check for use in pydantic
  validators at save time (`target_origin`, a page URL). Only catches an IP
  literal typed directly (e.g. `http://127.0.0.1`); a real hostname can't be
  checked without a DNS lookup, which doesn't belong in a synchronous validator.
- `assert_safe_to_fetch` - the real guard, called immediately before every actual
  network request (including each redirect hop, since a same-origin-looking
  redirect can repoint to an internal address after the initial check passes).
  Resolves the hostname and rejects it if any resolved address is
  private/loopback/link-local/reserved/multicast/unspecified.
"""

import ipaddress
import socket
from urllib.parse import urlsplit

MAX_REDIRECTS = 5


def _is_blocked_ip(ip_str: str) -> bool:
    ip = ipaddress.ip_address(ip_str)
    return (
        ip.is_private
        or ip.is_loopback
        or ip.is_link_local
        or ip.is_reserved
        or ip.is_multicast
        or ip.is_unspecified
    )


def is_public_hostname_literal(hostname: str) -> bool:
    try:
        ip = ipaddress.ip_address(hostname)
    except ValueError:
        return True
    return not _is_blocked_ip(str(ip))


def assert_safe_to_fetch(url: str) -> None:
    parsed = urlsplit(url)
    if parsed.scheme not in ("http", "https") or not parsed.hostname:
        raise ValueError("Refusing to fetch: not a valid HTTP(S) URL.")
    try:
        addrinfo = socket.getaddrinfo(parsed.hostname, None)
    except socket.gaierror as exc:
        raise ValueError(f"Refusing to fetch: could not resolve host {parsed.hostname}") from exc
    for entry in addrinfo:
        sockaddr = entry[4]
        if _is_blocked_ip(sockaddr[0]):
            raise ValueError(
                "Refusing to fetch: this URL resolves to a private or internal address."
            )
