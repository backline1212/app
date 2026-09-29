import { useEffect } from "react";

type TitleSegment = string | null | undefined | false;

/**
 * Sets `document.title` while the component is mounted and restores the previous
 * title on unmount.
 *
 * Takes a single title or context-first segments joined with " · ":
 *
 *   useDocumentTitle("Tickets")                   → "Tickets — Backline"
 *   useDocumentTitle([workspace.name, "Tickets"]) → "Acme · Tickets — Backline"
 *
 * Blank or missing segments are dropped, so data that hasn't loaded yet needs no
 * guard: `[project?.name, "Board"]` reads "Board — Backline" until the project
 * arrives, then "Client Store · Board — Backline".
 */
export function useDocumentTitle(title: TitleSegment | TitleSegment[]): void {
  const resolved = (Array.isArray(title) ? title : [title])
    .map((segment) => (segment ? segment.trim() : ""))
    .filter(Boolean)
    .join(" · ");

  useEffect(() => {
    const prev = document.title;
    document.title = resolved ? `${resolved} — Backline` : "Backline";
    return () => {
      document.title = prev;
    };
  }, [resolved]);
}
