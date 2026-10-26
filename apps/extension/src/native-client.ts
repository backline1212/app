import type { ApiClient } from "@backline/widget";
import { DASHBOARD_BASE_URL } from "./lib/config";

class NativeMessageError extends Error {
  constructor(message: string, readonly status: number) { super(message); }
}

export function reviewAccessEnded(error: unknown): boolean {
  return error instanceof NativeMessageError && [401, 403, 404, 409].includes(error.status);
}

export function reviewServiceUnavailable(error: unknown): boolean {
  return error instanceof NativeMessageError && error.status === 503;
}

export async function nativeMessage<T>(type: string, fields: Record<string, unknown> = {}): Promise<T> {
  const result = await chrome.runtime.sendMessage({ type, ...fields });
  if (!result?.ok) throw new NativeMessageError(result?.error ?? "Reload this page to reconnect Backline.", Number(result?.status) || 0);
  return result.data as T;
}

export function installDashboardBridge(): void {
  if (window.top !== window || location.origin !== new URL(DASHBOARD_BASE_URL).origin) return;
  window.addEventListener("message", event => {
    if (event.source !== window || event.origin !== location.origin || event.data?.source !== "backline-dashboard") return;
    const { id, action, input } = event.data;
    if (typeof id !== "string" || !["status", "launch"].includes(action)) return;
    void nativeMessage(`native-review-${action}`, { input }).then(
      data => window.postMessage({ source: "backline-extension", id, ok: true, data }, location.origin),
      error => window.postMessage({ source: "backline-extension", id, ok: false, error: error.message, status: error instanceof NativeMessageError ? error.status : 0 }, location.origin),
    );
  });
}

export function readData(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(new Error("Could not read attachment."));
    reader.readAsDataURL(blob);
  });
}

export function createNativeApi(pageUrl: string): ApiClient {
  return {
    request: async <T>(path: string, init: RequestInit = {}): Promise<T> => {
      if (init.method === "POST" && path.endsWith("/comments") && location.href !== pageUrl) {
        throw new Error("The page changed. Cancel this draft and comment on the new page.");
      }
      return nativeMessage<T>("native-review-api", { path, method: init.method ?? "GET", body: init.body });
    },
    upload: async <T>(_path: string, form: FormData): Promise<T> => {
      const file = form.get("file");
      if (!(file instanceof File)) throw new Error("Choose a file to upload.");
      if (file.size > 20_000_000) throw new Error("Choose a file smaller than 20 MB.");
      return nativeMessage<T>("native-review-upload", { file: { data: await readData(file), type: file.type, name: file.name } });
    },
  };
}

export async function uploadNativeScreenshot(api: ApiClient, projectId: string, screenshot: Blob): Promise<string | null> {
  const form = new FormData();
  form.append("project_id", projectId);
  form.append("file", screenshot, "screenshot.jpg");
  try {
    return (await api.upload<{ key: string }>("/api/v1/uploads/direct", form)).key;
  } catch {
    return null;
  }
}

export async function uploadNativeAttachment(api: ApiClient, projectId: string, file: File) {
  const form = new FormData();
  form.append("project_id", projectId);
  form.append("file", file);
  try {
    const { key } = await api.upload<{ key: string }>("/api/v1/uploads/direct", form);
    return { key, filename: file.name, content_type: file.type || "application/octet-stream" };
  } catch {
    return null;
  }
}

// Content a site marks data-backline-private is covered by grey blocks for the
// moment of the capture, as the SDK's DOM capture does.
function maskPrivateAreas(): () => void {
  const masks: HTMLElement[] = [];
  for (const element of Array.from(document.querySelectorAll("[data-backline-private]")).slice(0, 500)) {
    const box = element.getBoundingClientRect();
    if (box.width <= 0 || box.height <= 0 || box.bottom <= 0 || box.right <= 0 || box.top >= innerHeight || box.left >= innerWidth) continue;
    const mask = document.createElement("div");
    mask.style.cssText = `position:fixed;left:${box.left}px;top:${box.top}px;width:${box.width}px;height:${box.height}px;background:#d5dad7;z-index:2147483647;pointer-events:none;`;
    document.documentElement.appendChild(mask);
    masks.push(mask);
  }
  return () => masks.forEach(mask => mask.remove());
}

export async function captureNativeScreenshot(): Promise<Blob | null> {
  const hosts = Array.from(document.querySelectorAll<HTMLElement>("[data-backline-root]"));
  const prior = hosts.map(host => host.style.visibility);
  hosts.forEach(host => { host.style.visibility = "hidden"; });
  const unmask = maskPrivateAreas();
  try {
    await new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve())));
    const data = await nativeMessage<string>("native-review-capture", { url: location.href });
    const binary = atob(data.split(",")[1]);
    return new Blob([Uint8Array.from(binary, char => char.charCodeAt(0))], { type: "image/jpeg" });
  } catch {
    return null; // comment capture_status records failed; never fabricate a screenshot
  } finally {
    unmask();
    hosts.forEach((host, i) => { host.style.visibility = prior[i]; });
  }
}
