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
- `GuardedNetworkBackend` / `guarded_transport` - closes the DNS-rebinding gap the
  check-then-fetch pair leaves: the host is resolved once at connect time, every
  address is checked, and the socket connects to the checked address itself (TLS
  still uses the original hostname for SNI and certificate checks). Use it for every
  client that fetches a member-controlled URL.
"""

import asyncio
import ipaddress
import socket
from collections.abc import Iterable
from typing import Any
from urllib.parse import urlsplit

import httpcore
import httpx

MAX_REDIRECTS = 5


def _is_blocked_ip(ip_str: str) -> bool:
    from app.core.config import get_settings

    settings = get_settings()
    if settings.allow_private_network_targets and settings.environment == "local":
        return False
    ip = ipaddress.ip_address(ip_str.split("%", 1)[0])
    if isinstance(ip, ipaddress.IPv6Address) and ip.ipv4_mapped is not None:
        ip = ip.ipv4_mapped
    return (
        # Anything not globally routable: also covers carrier-grade NAT (100.64/10),
        # benchmarking and documentation ranges the flags below don't.
        not ip.is_global
        or ip.is_private
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


class GuardedNetworkBackend(httpcore.AsyncNetworkBackend):
    """Connects only to public addresses, and only to the address it checked."""

    def __init__(self) -> None:
        self._inner = httpcore.AnyIOBackend()

    async def connect_tcp(
        self,
        host: str,
        port: int,
        timeout: float | None = None,
        local_address: str | None = None,
        socket_options: Iterable[Any] | None = None,
    ) -> httpcore.AsyncNetworkStream:
        try:
            infos = await asyncio.get_running_loop().getaddrinfo(
                host, port, type=socket.SOCK_STREAM
            )
        except socket.gaierror as exc:
            raise httpcore.ConnectError(f"Could not resolve host {host}") from exc
        addresses = list(dict.fromkeys(str(info[4][0]) for info in infos))
        if not addresses or any(_is_blocked_ip(address) for address in addresses):
            raise httpcore.ConnectError(
                "Refusing to connect: this host resolves to a private or internal address."
            )
        last_error: Exception | None = None
        for address in addresses:
            try:
                return await self._inner.connect_tcp(
                    address,
                    port,
                    timeout=timeout,
                    local_address=local_address,
                    socket_options=socket_options,
                )
            except httpcore.ConnectError as exc:
                last_error = exc
        raise last_error or httpcore.ConnectError(f"Could not connect to {host}")

    async def connect_unix_socket(
        self,
        path: str,
        timeout: float | None = None,
        socket_options: Iterable[Any] | None = None,
    ) -> httpcore.AsyncNetworkStream:
        raise httpcore.ConnectError("Unix sockets are not allowed.")

    async def sleep(self, seconds: float) -> None:
        await self._inner.sleep(seconds)


def guarded_transport(**kwargs: Any) -> httpx.AsyncHTTPTransport:
    """An httpx transport whose connections go through GuardedNetworkBackend."""
    transport = httpx.AsyncHTTPTransport(**kwargs)
    pool = transport._pool  # noqa: SLF001 - httpx has no public hook for the backend
    if not hasattr(pool, "_network_backend"):
        raise RuntimeError("httpx/httpcore changed: cannot install the SSRF connect guard.")
    pool._network_backend = GuardedNetworkBackend()  # noqa: SLF001
    return transport


def guarded_client(**kwargs: Any) -> httpx.AsyncClient:
    """A one-off AsyncClient for a member- or admin-supplied URL."""
    return httpx.AsyncClient(transport=guarded_transport(), **kwargs)
