import { useEffect, useRef, type RefObject } from "react";

/** Resizes a textarea to fit what's been typed, up to whatever max-height its CSS sets,
 * after which it scrolls. `floor` is a height the person chose themselves by dragging
 * the corner: typing can push the box taller than that, but never shorter, so a
 * keystroke doesn't undo their drag. */
export function fitTextarea(textarea: HTMLTextAreaElement, floor = 0): void {
  const styles = getComputedStyle(textarea);
  // scrollHeight is content + padding, so a border-box element needs the border added
  // back and a content-box one needs the padding taken off - otherwise the box lands a
  // few pixels short and shows a scrollbar it doesn't need.
  const adjust =
    styles.boxSizing === "border-box"
      ? parseFloat(styles.borderTopWidth) + parseFloat(styles.borderBottomWidth)
      : -(parseFloat(styles.paddingTop) + parseFloat(styles.paddingBottom));

  textarea.style.height = "auto";
  let next = textarea.scrollHeight + adjust;
  const max = parseFloat(styles.maxHeight);
  if (Number.isFinite(max)) next = Math.min(next, max);
  textarea.style.height = `${Math.max(next, floor)}px`;
}

/** Keeps `ref`'s textarea sized to `value`. Re-measures whenever the value changes. */
export function useAutoGrow(
  ref: RefObject<HTMLTextAreaElement | null>,
  value: unknown,
): void {
  const floorRef = useRef(0);
  const lastSetRef = useRef("");

  useEffect(() => {
    const textarea = ref.current;
    if (!textarea) return;
    // A drag on the native resize corner changes the height with no input event to
    // hang off, so it's spotted here instead: any height this component didn't set is
    // the person's own, and becomes the floor.
    const observer = new ResizeObserver(() => {
      if (textarea.style.height === lastSetRef.current) return;
      floorRef.current = textarea.getBoundingClientRect().height;
      lastSetRef.current = textarea.style.height;
    });
    observer.observe(textarea);
    return () => observer.disconnect();
  }, [ref]);

  useEffect(() => {
    const textarea = ref.current;
    if (!textarea) return;
    fitTextarea(textarea, floorRef.current);
    lastSetRef.current = textarea.style.height;
  }, [ref, value]);
}
