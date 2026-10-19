import type { NativeReviewLaunch, NativeReviewStatus } from "@backline/types";

import { API_BASE_URL } from "../../lib/api-client";

export class ExtensionError extends Error {
  constructor(message: string, readonly status = 0) { super(message); }
}

export function isExtensionContextInvalidated(error: unknown): boolean {
  return error instanceof Error && /extension context invalidated/i.test(error.message);
}

export function reviewExtensionProblem(status: NativeReviewStatus): string | null {
  if (typeof status.apiBaseUrl !== "string" || status.apiBaseUrl.replace(/\/$/, "") !== API_BASE_URL.replace(/\/$/, "")) {
    return "This extension is set up for a different Backline server. Replace its files with the download from this page, then reload the extension and Backline.";
  }
  const parts = typeof status.extensionVersion === "string" && /^\d+(\.\d+){2,3}$/.test(status.extensionVersion)
    ? status.extensionVersion.split(".").map(Number) : [];
  const minimum = [0, 4, 1];
  let supported = parts.length >= 3;
  for (let i = 0; supported && i < minimum.length; i += 1) {
    if (parts[i] === minimum[i]) continue;
    supported = parts[i] > minimum[i];
    break;
  }
  return status.version === 2 && supported ? null
    : "Update to the latest Backline extension (0.4.1 or newer). Replace its files with this download, reload its extension card, then reload Backline.";
}

export function extensionRequest<T>(action: "status" | "launch", input?: NativeReviewLaunch, signal?: AbortSignal): Promise<T> {
  return new Promise((resolve, reject) => {
    const id = crypto.randomUUID();
    const timer = window.setTimeout(() => finish(new ExtensionError(action === "status"
      ? "Backline couldn't find the extension in this browser. If it's already installed, reload this Backline tab and check again."
      : "The website hasn't confirmed its review tools. Finish signing in on the website, then try again.")), action === "status" ? 2500 : 30000);
    function finish(error?: Error, data?: T) {
      window.clearTimeout(timer);
      window.removeEventListener("message", receive);
      signal?.removeEventListener("abort", abort);
      if (error) reject(error); else resolve(data as T);
    }
    function abort() { finish(new DOMException("Review launch cancelled", "AbortError")); }
    function receive(event: MessageEvent) {
      if (event.source !== window || event.origin !== window.location.origin
        || event.data?.source !== "backline-extension" || event.data.id !== id) return;
      finish(event.data.ok ? undefined : new ExtensionError(event.data.error, Number(event.data.status) || 0), event.data.data);
    }
    if (signal?.aborted) { abort(); return; }
    signal?.addEventListener("abort", abort, { once: true });
    window.addEventListener("message", receive);
    window.postMessage({ source: "backline-dashboard", id, action, input }, window.location.origin);
  });
}
