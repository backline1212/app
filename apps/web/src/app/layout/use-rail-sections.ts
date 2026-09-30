import { useCallback, useEffect, useState } from "react";

// Which collapsible sidebar groups are open. A per-browser display preference, like
// use-theme.ts - not workspace data - so localStorage is the right home, and every
// read/write is guarded because storage can be unavailable (private mode, blocked
// site data) and the rail must still work.
const RAIL_SECTIONS_KEY = "backline_rail_sections";

export type RailSection = "statuses" | "tools" | "workspace";
type RailSectionState = Record<RailSection, boolean>;

const DEFAULTS: RailSectionState = { statuses: true, tools: true, workspace: true };

function storedSections(): RailSectionState {
  try {
    const parsed: unknown = JSON.parse(localStorage.getItem(RAIL_SECTIONS_KEY) ?? "null");
    if (!parsed || typeof parsed !== "object") return DEFAULTS;
    const next = { ...DEFAULTS };
    for (const key of Object.keys(DEFAULTS) as RailSection[]) {
      const value = (parsed as Record<string, unknown>)[key];
      if (typeof value === "boolean") next[key] = value;
    }
    return next;
  } catch {
    return DEFAULTS;
  }
}

export function useRailSections() {
  const [open, setOpen] = useState<RailSectionState>(storedSections);

  useEffect(() => {
    try {
      localStorage.setItem(RAIL_SECTIONS_KEY, JSON.stringify(open));
    } catch {
      // The rail still toggles for this visit when storage is unavailable.
    }
  }, [open]);

  const toggle = useCallback((section: RailSection) => {
    setOpen((current) => ({ ...current, [section]: !current[section] }));
  }, []);

  // Opens a group without flipping it - used when the current route lives inside a
  // collapsed group, so the highlighted link is never hidden.
  const reveal = useCallback((section: RailSection) => {
    setOpen((current) => (current[section] ? current : { ...current, [section]: true }));
  }, []);

  return { open, toggle, reveal };
}
