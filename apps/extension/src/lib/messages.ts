import type { ExtensionConnection } from "./storage";

// Popup connection and standalone annotation messages.
export type AnnotationMode = "point" | "region";

export type ExtensionMessage =
  | { type: "get-connection" }
  | { type: "set-connection"; connection: ExtensionConnection }
  | { type: "clear-connection" }
  | { type: "activate-annotation"; mode: AnnotationMode };

export interface ConnectionResponse {
  connection: ExtensionConnection | null;
}
