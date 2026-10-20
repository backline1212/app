/** Keep route/query context visible when different review pages share a pathname. */
export function reviewPagePath(address: string): string {
  try {
    const url = new URL(address);
    return url.pathname + url.search + url.hash;
  } catch {
    return address;
  }
}

export function hasReviewHashRoute(address: string): boolean {
  try { const hash = new URL(address).hash; return hash.startsWith("#/") || hash.startsWith("#!/"); }
  catch { return false; }
}

export function reviewPageLabel(page: { title: string | null; url_normalized: string }): string {
  const path = reviewPagePath(page.url_normalized);
  try {
    const url = new URL(page.url_normalized);
    return page.title ? `${page.title}${url.hash || url.search ? ` · ${path}` : ""}` : path;
  } catch { return page.title || path; }
}
