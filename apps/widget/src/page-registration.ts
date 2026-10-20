import type { ApiClient } from "./api-client";
import { captureSnapshot } from "./dom-snapshot";
import { WidgetApiError } from "./api-client";

interface RegisterPageResponse {
  id: string;
}

// On a share link's own preview origin (docs/tdr/0040) the pathname is already the real
// one. On the legacy proxy path, window.location is /proxy/{shareToken}/{realPath},
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
  // The dashboard canvas's own parameters, not part of the reviewed page's address -
  // left in, the same page registered once per canvas browser choice and again for
  // every guest (whose URL never carries them).
  search.delete("blMode");
  search.delete("blBrowser");
  const qs = search.toString();
  return new URL(targetOrigin).origin + pathname + (qs ? `?${qs}` : "");
}

export async function registerCurrentPage(
  api: ApiClient,
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
  api: ApiClient,
  pageId: string,
  expectedDocumentUrl = location.href,
): Promise<void> {
  if (location.href !== expectedDocumentUrl) throw new Error("The page changed. Reopen review on the current page before capturing a version.");
  const snapshot = await captureSnapshot();
  if (location.href !== expectedDocumentUrl) throw new Error("The page changed during version capture. Reopen review on the current page.");
  await api.request(`/api/v1/pages/${pageId}/snapshots`, {
    method: "POST",
    body: JSON.stringify(snapshot),
  });
}

const captureGeneration = new WeakMap<ShadowRoot, number>();

/** Version capture stays independent of commenting, with visible failure/retry. */
export function capturePageVersion(api: ApiClient, pageId: string, shadow: ShadowRoot, expectedDocumentUrl: string): void {
  const generation = (captureGeneration.get(shadow) ?? 0) + 1;
  captureGeneration.set(shadow, generation);
  shadow.querySelector("[data-backline-capture-notice]")?.remove();
  let running = false;
  const current = () => shadow.host.isConnected && captureGeneration.get(shadow) === generation && location.href === expectedDocumentUrl;
  function notice(message: string, pending: boolean) {
    if (!current()) return;
    shadow.querySelector("[data-backline-capture-notice]")?.remove();
    const panel = document.createElement("div");
    panel.setAttribute("data-backline-capture-notice", "true");
    panel.setAttribute("role", "status");
    panel.style.cssText = "position:fixed;right:16px;bottom:100px;z-index:2147483646;width:min(320px,calc(100vw - 32px));max-height:180px;overflow:auto;box-sizing:border-box;padding:12px;background:#fff;color:#20231e;border:1px solid #ccd2c8;border-radius:6px;font:12px/1.5 system-ui;box-shadow:0 4px 20px #0002;pointer-events:auto";
    const text = document.createElement("p");
    text.style.margin = "0 0 8px";
    text.textContent = message;
    panel.appendChild(text);
    if (!pending) {
      const retry = document.createElement("button");
      retry.type = "button"; retry.textContent = "Retry version capture";
      retry.addEventListener("click", () => {
        if (location.href !== expectedDocumentUrl) { text.textContent = "The page changed. Reopen review on the current page before capturing its version."; retry.disabled = true; return; }
        if (!running) void run();
      });
      panel.appendChild(retry);
    }
    const close = document.createElement("button");
    close.type = "button"; close.textContent = "Dismiss"; close.style.marginLeft = "8px";
    close.addEventListener("click", () => panel.remove()); panel.appendChild(close);
    shadow.appendChild(panel);
  }
  async function run() {
    if (running || !current()) return;
    running = true;
    shadow.querySelector("[data-backline-capture-notice]")?.remove();
    const slow = window.setTimeout(() => notice("Page version capture is still awaiting a response. Feedback can still be saved.", true), 20_000);
    try {
      await submitPageSnapshot(api, pageId, expectedDocumentUrl);
      if (current()) shadow.querySelector("[data-backline-capture-notice]")?.remove();
    } catch (error) {
      // Account/session recovery owns auth failures, not this optional capture UI.
      if (!(error instanceof WidgetApiError && [401, 403].includes(error.status))) {
        notice(`Page version could not be captured. Feedback can still be saved. ${error instanceof Error ? error.message : "Try again when the page settles."}`, false);
      }
    } finally { window.clearTimeout(slow); running = false; }
  }
  void run();
}
