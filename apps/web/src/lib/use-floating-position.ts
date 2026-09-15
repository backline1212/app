import { useLayoutEffect, useState, type RefObject } from "react";

export interface FloatingPosition {
  top: number;
  left: number;
}

/**
 * Positions a portaled floating element (dropdown/popover/calendar) against a
 * trigger's real screen position, clamped to the viewport - so it can never
 * render off-screen or get clipped by a scrolling ancestor (a dialog, a table
 * wrapper, a side panel) the way a plain `position:absolute` child would.
 * Returns null until the first measurement is in, so callers can keep the
 * element invisible for that one frame instead of flashing it at (0,0).
 */
export function useFloatingPosition(
  triggerRef: RefObject<HTMLElement>,
  floatingRef: RefObject<HTMLElement>,
  open: boolean,
): FloatingPosition | null {
  const [pos, setPos] = useState<FloatingPosition | null>(null);

  useLayoutEffect(() => {
    if (!open) return;

    function reposition() {
      const trigger = triggerRef.current;
      if (!trigger) return;
      const rect = trigger.getBoundingClientRect();
      const floating = floatingRef.current;
      const width = floating?.offsetWidth ?? 280;
      const height = floating?.offsetHeight ?? 340;
      const margin = 8;

      let left = rect.left;
      if (left + width > window.innerWidth - margin) {
        left = Math.max(margin, window.innerWidth - width - margin);
      }

      let top = rect.bottom + 4;
      if (top + height > window.innerHeight - margin) {
        const above = rect.top - height - 4;
        top = above >= margin ? above : Math.max(margin, window.innerHeight - height - margin);
      }

      setPos({ top, left });
    }

    reposition();
    window.addEventListener("resize", reposition);
    window.addEventListener("scroll", reposition, true);
    return () => {
      window.removeEventListener("resize", reposition);
      window.removeEventListener("scroll", reposition, true);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  return pos;
}
