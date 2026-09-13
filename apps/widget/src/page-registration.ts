import type { createApiClient } from "./api-client";
import { captureSnapshot } from "./dom-snapshot";

interface RegisterPageResponse {
  id: string;
}

// In proxy mode, window.location is the proxy's own URL (/proxy/{shareToken}/{realPath}),
// not the reviewed site's - fetch_proxied_resource (backend/app/modules/proxy/service.py)
// forwards `path` to the target origin verbatim, so stripping the "/proxy/{shareToken}"
// prefix and swapping in the real target_origin recovers the reviewed site's actual URL.
// In snippet mode this prefix is simply absent and the URL passes through unchanged.
// Without this, every page registered from proxy mode records a Backline-internal proxy
// URL instead of the site's own path - harmless for anchoring (which never reads it) but
// wrong for anything display-facing, like the dashboard's Comments panel grouping
// comments by page.
export function realPageUrl(shareToken: string, targetOrigin: string): string {
  const prefix = `/proxy/${shareToken}`;
  let pathname = window.location.pathname;
  if (pathname.startsWith(prefix)) {
    pathname = pathname.slice(prefix.length) || "/";
  }
  const search = new URLSearchParams(window.location.search);
  search.delete("blMode");
  const qs = search.toString();
  return targetOrigin.replace(/\/+$/, "") + pathname + (qs ? `?${qs}` : "");
}

export async function registerCurrentPage(
  api: ReturnType<typeof createApiClient>,
  projectId: string,
  url: string,
): Promise<string> {
  const page = await api.request<RegisterPageResponse>("/api/v1/pages", {
    method: "POST",
    body: JSON.stringify({
      project_id: projectId,
      url,
      title: document.title || null,
    }),
  });
  return page.id;
}

export async function submitPageSnapshot(
  api: ReturnType<typeof createApiClient>,
  pageId: string,
): Promise<void> {
  const snapshot = await captureSnapshot();
  await api.request(`/api/v1/pages/${pageId}/snapshots`, {
    method: "POST",
    body: JSON.stringify(snapshot),
  });
}
