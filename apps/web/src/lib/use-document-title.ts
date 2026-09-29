import { useEffect } from "react";

/**
 * Sets `document.title` while the component is mounted and restores
 * the previous title on unmount.
 *
 * Accepts either a single title string or an array of breadcrumb segments
 * that are joined with ` · `:
 *
 *   useDocumentTitle("Tickets")             → "Tickets — Backline"
 *   useDocumentTitle(["My Project", "Board"]) → "My Project · Board — Backline"
 *
 * Empty/blank segments are silently dropped so callers don't need to guard
 * against data that hasn't loaded yet:
 *
 *   useDocumentTitle([project?.name, "Board"]) → "Board — Backline" initially,
 *                                                "Acme Site · Board — Backline" once loaded.
 */
export function useDocumentTitle(title: string | (string | undefined | null | false)[]): void {
  const resolved = Array.isArray(title)
    ? title.filter((s): s is string => typeof s === "string" && s.trim().length > 0).join(" · ")
    : title;

  useEffect(() => {
    const prev = document.title;
    document.title = resolved ? `${resolved} — Backline` : "Backline";
    return () => {
      document.title = prev;
    };
  }, [resolved]);
}
