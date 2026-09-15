import { useEffect, RefObject } from "react";

export function useOnClickOutside<T extends HTMLElement>(
  refs: RefObject<T> | RefObject<T>[],
  handler: (event: MouseEvent | TouchEvent) => void
) {
  useEffect(() => {
    const list = Array.isArray(refs) ? refs : [refs];
    const listener = (event: MouseEvent | TouchEvent) => {
      const mounted = list.map((ref) => ref.current).filter((el): el is T => el !== null);
      // Matches the original single-ref behavior: if nothing tracked is mounted yet,
      // do nothing rather than treating the click as "outside".
      if (mounted.length === 0) return;
      // Do nothing if clicking inside any tracked element (e.g. a trigger plus its
      // portaled popover, which no longer shares a DOM subtree with the trigger).
      const target = event.target as Node;
      if (mounted.some((el) => el.contains(target))) return;
      handler(event);
    };

    document.addEventListener("mousedown", listener);
    document.addEventListener("touchstart", listener);

    return () => {
      document.removeEventListener("mousedown", listener);
      document.removeEventListener("touchstart", listener);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [handler, ...(Array.isArray(refs) ? refs : [refs])]);
}
