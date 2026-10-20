import { useEffect, RefObject } from "react";

export function useFocusTrap(ref: RefObject<HTMLElement>, isActive: boolean = true) {
  useEffect(() => {
    if (!isActive || !ref.current) return;

    const element = ref.current;
    const focusable = () => [...element.querySelectorAll<HTMLElement>(
      'a[href], button, textarea, input:not([type="hidden"]), select, [tabindex]'
    )].filter(item => item.tabIndex >= 0 && !item.matches(":disabled")
      && !item.closest("[hidden], [inert]") && item.getClientRects().length > 0);

    function handleKeyDown(e: KeyboardEvent) {
      if (e.key !== 'Tab' || e.defaultPrevented) return;
      // A nested confirmation owns focus while it is open, even though its DOM
      // events bubble through the containing thread dialog.
      if (e.target instanceof Element && e.target.closest("dialog") !== element.closest("dialog")) return;
      const items = focusable();
      if (!items.length) return;
      const firstElement = items[0];
      const lastElement = items[items.length - 1];

      if (e.shiftKey) {
        if (document.activeElement === firstElement) {
          lastElement.focus();
          e.preventDefault();
        }
      } else {
        if (document.activeElement === lastElement) {
          firstElement.focus();
          e.preventDefault();
        }
      }
    }

    element.addEventListener('keydown', handleKeyDown);

    // Initial focus
    if (!element.contains(document.activeElement)) {
      focusable()[0]?.focus();
    }

    return () => {
      element.removeEventListener('keydown', handleKeyDown);
    };
  }, [ref, isActive]);
}
