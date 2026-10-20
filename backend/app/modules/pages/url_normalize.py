from urllib.parse import urlsplit, urlunsplit


def has_routing_fragment(raw_url: str) -> bool:
    """Recognized route formats; ordinary anchors/OAuth fragments are not pages."""
    return urlsplit(raw_url).fragment.startswith(("/", "!/"))


def normalize_url(raw_url: str) -> str:
    """09-Snapshot-Engine.md doesn't specify the exact normalization algorithm - this
    lowercases scheme/host and strips a trailing slash (except the root path), but keeps
    the query string (stripping it risks colliding distinct pages, e.g. `?page=2`
    pagination). Keep #/ and #!/ routes as distinct pages, preserving their case,
    query-like suffixes and encoding. Other fragments remain same-page anchors.
    Existing fragment-less records remain readable; never guess which old merged
    comments belonged to a hash route or move their history automatically."""
    parts = urlsplit(raw_url)
    scheme = (parts.scheme or "https").lower()
    netloc = parts.netloc.lower()
    path = parts.path
    if len(path) > 1 and path.endswith("/"):
        path = path.rstrip("/")
    if not path:
        path = "/"
    fragment = parts.fragment if has_routing_fragment(raw_url) else ""
    return urlunsplit((scheme, netloc, path, parts.query, fragment))
