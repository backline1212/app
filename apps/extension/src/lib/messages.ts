import type { ExtensionConnection } from "./storage";

// The popup and content script never touch chrome.storage directly - they go through
// the background service worker via these messages, so there's one owner of the
// connection state (storage.ts's own docstring explains why).
export type AnnotationMode = "point" | "region";

// Read from `chrome.cookies.getAll` in background.ts, which only the background service
// worker (not a content script or the popup) can call - it's the one place that sees a
// site's HttpOnly cookies (docs/tdr/0041).
export interface SessionCookieIn {
  name: string;
  value: string;
  path: string;
  expires: number | null;
  http_only: boolean;
}

export type ExtensionMessage =
  | { type: "get-connection" }
  | { type: "set-connection"; connection: ExtensionConnection }
  | { type: "clear-connection" }
  | { type: "activate-annotation"; mode: AnnotationMode }
  // Sent by the popup once it already knows which project matches the active tab's
  // origin - reading cookies (chrome.cookies) and localStorage (chrome.scripting) both
  // have to happen in the background worker/active tab, never the popup itself.
  | { type: "sync-session"; tabId: number; projectId: string; targetOrigin: string };

export interface ConnectionResponse {
  connection: ExtensionConnection | null;
}

export interface SyncSessionResponse {
  ok: boolean;
  error?: string;
}
