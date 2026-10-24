const PRIVATE_QUERY_KEY = /^(?:access[_-]?token|id[_-]?token|refresh[_-]?token|token|auth(?:orization)?|api[_-]?key|key|secret|client[_-]?secret|sig(?:nature)?|session(?:[_-]?id)?|code|state|password|passcode|pwd|jwt|email|phone|address)$/i;
const PRIVATE_PATH_PARENT = /^(?:token|reset|invite|verify|magic|session)$/i;

function redactParams(raw: string): string {
  const params = new URLSearchParams(raw);
  for (const key of params.keys()) {
    if (PRIVATE_QUERY_KEY.test(key)) params.set(key, "REDACTED");
  }
  return params.toString();
}

function redactPath(raw: string): string {
  const segments = raw.split("/");
  for (let index = 1; index < segments.length; index += 1) {
    if (PRIVATE_PATH_PARENT.test(segments[index - 1]) && segments[index]) segments[index] = "REDACTED";
  }
  return segments.join("/");
}

/** Display only. Never use this value for page identity, navigation or capture. */
export function redactReviewUrl(address: string): string {
  try {
    const url = new URL(address);
    url.username = "";
    url.password = "";
    url.pathname = redactPath(url.pathname);
    if (url.search) url.search = redactParams(url.search.slice(1));
    if (url.hash.startsWith("#/") || url.hash.startsWith("#!/")) {
      const queryStart = url.hash.indexOf("?");
      const route = queryStart === -1 ? url.hash.slice(1) : url.hash.slice(1, queryStart);
      url.hash = `#${redactPath(route)}${queryStart === -1 ? "" : `?${redactParams(url.hash.slice(queryStart + 1))}`}`;
    } else if (url.hash.includes("=")) {
      url.hash = `#${redactParams(url.hash.slice(1))}`;
    }
    return url.toString();
  } catch {
    return "Page address unavailable";
  }
}

// Image and PDF files are stored as pages with an internal `backline://assets/<hash>`
// address - an identity key, never something to show a reviewer.
const ASSET_PAGE_PREFIX = "backline://assets/";

export function isAssetPageAddress(address: string): boolean {
  return address.startsWith(ASSET_PAGE_PREFIX);
}

/** Keep nonsecret route/query context visible when pages share a pathname. */
export function reviewPagePath(address: string): string {
  if (isAssetPageAddress(address)) return "File";
  try {
    const url = new URL(redactReviewUrl(address));
    return url.pathname + url.search + url.hash;
  } catch {
    return "Page address unavailable";
  }
}

/** Redact an API ticket's relative page path before showing it in a card. */
export function reviewTicketPath(path: string | null | undefined): string | null {
  if (!path) return null;
  return reviewPagePath(`https://display.invalid${path.startsWith("/") ? "" : "/"}${path}`);
}

export function hasReviewHashRoute(address: string): boolean {
  try { const hash = new URL(address).hash; return hash.startsWith("#/") || hash.startsWith("#!/"); }
  catch { return false; }
}

export function reviewPageLabel(page: { title: string | null; url_normalized: string }): string {
  if (isAssetPageAddress(page.url_normalized)) return page.title || "Untitled file";
  const path = reviewPagePath(page.url_normalized);
  try {
    const url = new URL(page.url_normalized);
    return page.title ? `${page.title}${url.hash || url.search ? ` · ${path}` : ""}` : path;
  } catch { return page.title || path; }
}
