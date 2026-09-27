import { API_BASE_URL } from "../../lib/api-client";

// The canvas iframe is served from its share link's own preview origin (docs/tdr/0040),
// or from the API's origin for a legacy /proxy link. Read off the frame itself so messages
// into it are addressed to exactly where it was loaded rather than to "*".
export function canvasOrigin(frame: HTMLIFrameElement | null | undefined): string {
  try {
    if (frame?.src) return new URL(frame.src).origin;
  } catch {
    // An unparseable src falls back to the legacy origin below.
  }
  return new URL(API_BASE_URL, window.location.origin).origin;
}
