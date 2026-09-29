export interface Shortcut {
  id: string;
  label: string;
  key: string;
  editable: boolean;
}

export const defaultShortcuts: Shortcut[] = [
  { id: "comment", label: "Add Comment", key: "C", editable: true },
  { id: "draw", label: "Draw Region", key: "D", editable: true },
  { id: "browse", label: "Browse Mode", key: "V", editable: true },
  { id: "hide-dock", label: "Hide Dock", key: "Ctrl .", editable: false },
  { id: "next-page", label: "Next Page", key: "ArrowRight", editable: false },
  { id: "prev-page", label: "Previous Page", key: "ArrowLeft", editable: false },
];

export const SHORTCUTS_STORAGE_KEY = "bl-shortcuts";

/** Reads the reviewer's saved key bindings (falling back to the defaults above) so
 * ProjectOverviewPage's global hotkey listener honors whatever this modal saved -
 * without this, editing a shortcut here would just relabel the key, not rebind it. */
export function loadShortcuts(): Shortcut[] {
  try {
    const saved = localStorage.getItem(SHORTCUTS_STORAGE_KEY);
    if (!saved) return defaultShortcuts;
    const parsed = JSON.parse(saved) as Partial<Shortcut>[];
    // Merge over the defaults rather than trusting the saved list outright, so a
    // shortcut added in a later release (e.g. "draw", added after some reviewers had
    // already saved customizations) still shows up instead of silently vanishing.
    return defaultShortcuts.map((fallback) => {
      const match = parsed.find((s) => s.id === fallback.id);
      return match?.key ? { ...fallback, key: match.key } : fallback;
    });
  } catch {
    return defaultShortcuts;
  }
}
