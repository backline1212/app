import type { ExtensionConnection } from "./storage";

// The popup and content script never touch chrome.storage directly - they go through
// the background service worker via these messages, so there's one owner of the
// connection state (storage.ts's own docstring explains why).
export type AnnotationMode = "point" | "region";

export type ExtensionMessage =
  | { type: "get-connection" }
  | { type: "set-connection"; connection: ExtensionConnection }
  | { type: "clear-connection" }
  | { type: "activate-annotation"; mode: AnnotationMode };

export interface ConnectionResponse {
  connection: ExtensionConnection | null;
}
