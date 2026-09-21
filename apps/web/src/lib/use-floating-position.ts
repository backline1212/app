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
 *
 * If the trigger sits inside a native `<dialog>`, the position is clamped to
 * that dialog's own box instead of the full viewport. A `<dialog open by
 * .showModal()>` renders in the browser's top layer, which paints above the
 * entire regular document regardless of z-index - callers portal into that
 * same `<dialog>` (via `closestDialog(triggerRef)`, below) rather than
 * `document.body` so they render in front of it instead of invisibly behind
 * it, and this clamp keeps them from extending past the dialog's own edges
 * where its `overflow-y:auto` would otherwise clip them.
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

      const boundary = trigger.closest("dialog")?.getBoundingClientRect();
      const minX = (boundary?.left ?? 0) + margin;
      const maxX = (boundary ? boundary.right : window.innerWidth) - margin;
      const minY = (boundary?.top ?? 0) + margin;
      const maxY = (boundary ? boundary.bottom : window.innerHeight) - margin;

      let left = rect.left;
      if (left + width > maxX) left = Math.max(minX, maxX - width);

      let top = rect.bottom + 4;
      if (top + height > maxY) {
        const above = rect.top - height - 4;
        top = above >= minY ? above : Math.max(minY, maxY - height);
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

/** Portal target for a floating element anchored to `triggerRef`: the nearest
 * enclosing `<dialog>` if there is one (so it joins the dialog's own top-layer
 * stacking instead of rendering invisibly behind it), otherwise `document.body`. */
export function closestPortalTarget(triggerRef: RefObject<HTMLElement>): Element {
  return triggerRef.current?.closest("dialog") ?? document.body;
}
