"""The project card picture without a server browser (TDR-0196).

Server screenshots stay off until the capture worker's network is isolated (TDR-0065).
Most sites already publish a picture of themselves for link previews: the Open Graph
`og:image` (or `twitter:image`) that chat apps and social networks show, usually the
hero or a designed banner. The worker reads it from the site's public HTML.

Every request goes through the SSRF-guarded client, which connects only to public
addresses it has checked itself, on each redirect too. Only the start page's HTML is
read (size-capped, no scripts run), then one image of a raster type, also size-capped.
"""

import io
from html import unescape
from html.parser import HTMLParser
from urllib.parse import urljoin, urlsplit

import httpx

from app.core.ssrf_guard import guarded_client

MAX_HTML_BYTES = 1_500_000
MAX_IMAGE_BYTES = 8_000_000
# Smaller than this is a logo or an icon, not a picture of the site.
MIN_WIDTH, MIN_HEIGHT = 300, 150
_IMAGE_TYPES = ("image/jpeg", "image/png", "image/webp", "image/gif")
_USER_AGENT = (
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
    "(KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36 Backline-Preview"
)
# Preference order when a page declares several.
_KEYS = (
    "og:image:secure_url",
    "og:image",
    "og:image:url",
    "twitter:image",
    "twitter:image:src",
)


class _HeadImages(HTMLParser):
    def __init__(self) -> None:
        super().__init__(convert_charrefs=True)
        self.found: dict[str, str] = {}
        self.image_src: str | None = None

    def handle_starttag(self, tag: str, attrs: list[tuple[str, str | None]]) -> None:
        values = {name.lower(): (value or "") for name, value in attrs}
        if tag == "meta":
            key = (values.get("property") or values.get("name") or "").strip().lower()
            content = values.get("content", "").strip()
            if key in _KEYS and content and key not in self.found:
                self.found[key] = content
        elif tag == "link" and "image_src" in values.get("rel", "").lower().split():
            self.image_src = self.image_src or values.get("href", "").strip() or None


def image_candidates(html: str, base_url: str) -> list[str]:
    parser = _HeadImages()
    parser.feed(html)
    raw = [parser.found[key] for key in _KEYS if key in parser.found]
    if parser.image_src:
        raw.append(parser.image_src)
    urls: list[str] = []
    for value in raw:
        url = urljoin(base_url, unescape(value))
        if urlsplit(url).scheme in ("http", "https") and url not in urls:
            urls.append(url)
    return urls


async def _read_capped(response: httpx.Response, limit: int) -> bytes:
    chunks: list[bytes] = []
    size = 0
    async for chunk in response.aiter_bytes():
        size += len(chunk)
        if size > limit:
            raise ValueError("The response is larger than a preview may be.")
        chunks.append(chunk)
    return b"".join(chunks)


def usable_picture(data: bytes) -> bool:
    from PIL import Image

    try:
        with Image.open(io.BytesIO(data)) as image:
            width, height = (int(side) for side in image.size)
    except Exception:  # noqa: BLE001 - not an image Pillow can read
        return False
    return bool(width >= MIN_WIDTH and height >= MIN_HEIGHT and width * height <= 40_000_000)


async def social_image(url: str) -> bytes:
    """The site's own share image, as bytes. Raises ValueError when there is none."""
    async with guarded_client(
        timeout=httpx.Timeout(10.0),
        follow_redirects=True,
        max_redirects=5,
        headers={"User-Agent": _USER_AGENT, "Accept-Language": "en-US,en;q=0.8"},
    ) as client:
        async with client.stream("GET", url, headers={"Accept": "text/html"}) as response:
            if response.status_code >= 400:
                raise ValueError(f"The site answered {response.status_code}.")
            if "html" not in response.headers.get("content-type", "").lower():
                raise ValueError("The start page is not an HTML page.")
            body = await _read_capped(response, MAX_HTML_BYTES)
            encoding = response.encoding or "utf-8"
            base = str(response.url)
        html = body.decode(encoding, errors="replace")
        # Share tags live in <head>; don't parse a huge body for them.
        head_end = html.lower().find("</head>")
        candidates = image_candidates(html[: head_end + 7] if head_end >= 0 else html, base)
        for candidate in candidates[:3]:
            try:
                async with client.stream(
                    "GET", candidate, headers={"Accept": "image/*", "Referer": base}
                ) as image:
                    content_type = image.headers.get("content-type", "").split(";")[0].lower()
                    if image.status_code >= 400 or content_type not in _IMAGE_TYPES:
                        continue
                    data = await _read_capped(image, MAX_IMAGE_BYTES)
            except (httpx.HTTPError, ValueError):
                continue
            if usable_picture(data):
                return data
    raise ValueError("This site doesn't publish a share image (og:image) to use as its preview.")
