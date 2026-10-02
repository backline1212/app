import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { getTopOpenDialog } from "./dialog-stack";

// Multi-select for a list of rows (TDR-0058). Selection only ever covers what is on
// screen: `visibleIds` is the current page in display order, and anything selected that
// drops out of it (a filter changed, a row was deleted) stops counting at once. A new
// `scopeKey` (filters, page, view) starts over, so a bulk action can never reach a row
// the person can no longer see.
export function useSelection(visibleIds: readonly string[], scopeKey: string) {
  const [picked, setPicked] = useState<ReadonlySet<string>>(() => new Set());
  const [scope, setScope] = useState(scopeKey);
  const anchor = useRef<string | null>(null);
  if (scope !== scopeKey) {
    setScope(scopeKey);
    setPicked(new Set());
    anchor.current = null;
  }

  const selectedIds = useMemo(() => visibleIds.filter((id) => picked.has(id)), [visibleIds, picked]);
  const count = selectedIds.length;
  const allSelected = visibleIds.length > 0 && count === visibleIds.length;

  const clear = useCallback(() => {
    setPicked(new Set());
    anchor.current = null;
  }, []);

  // Shift-click selects (or clears) every row between the last one clicked and this
  // one, matching the target row's new state - the convention of mail and file lists.
  const toggle = useCallback(
    (id: string, range = false) => {
      // Read the anchor now: the updater below runs on the next render, after the
      // anchor has already moved to `id`.
      const from = anchor.current ? visibleIds.indexOf(anchor.current) : -1;
      setPicked((prev) => {
        const next = new Set(prev);
        const on = !prev.has(id);
        const to = visibleIds.indexOf(id);
        if (range && from !== -1 && to !== -1) {
          const [start, end] = from < to ? [from, to] : [to, from];
          for (const rowId of visibleIds.slice(start, end + 1)) {
            if (on) next.add(rowId);
            else next.delete(rowId);
          }
        } else if (on) next.add(id);
        else next.delete(id);
        return next;
      });
      anchor.current = id;
    },
    [visibleIds],
  );

  const toggleAll = useCallback(() => {
    setPicked(allSelected ? new Set() : new Set(visibleIds));
    anchor.current = null;
  }, [allSelected, visibleIds]);

  // Escape clears the selection, unless a dialog is open - there it closes the dialog.
  useEffect(() => {
    if (count === 0) return;
    function onKeyDown(event: KeyboardEvent) {
      if (event.key !== "Escape" || event.defaultPrevented || getTopOpenDialog()) return;
      clear();
    }
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [count, clear]);

  return {
    selectedIds,
    count,
    allSelected,
    someSelected: count > 0 && !allSelected,
    isSelected: (id: string) => picked.has(id),
    toggle,
    toggleAll,
    clear,
  };
}

export type Selection = ReturnType<typeof useSelection>;
