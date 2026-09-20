import { useCallback, useEffect, useRef, useState } from "react";
import type { KeyboardEvent, PointerEvent, RefObject } from "react";

// Matches ViewportMenu's own custom-size floor, so dragging can never reach a width the
// custom-viewport field would reject.
const MIN_WIDTH = 280;
// Letting go within this many pixels of the canvas edge drops the explicit width again
// and hands the frame back to "Fit canvas" (100% of the container) instead of pinning
// it at a width that only looks full.
const FIT_SNAP = 24;
const KEY_STEP = 20;
const KEY_STEP_COARSE = 100;

export type ResizePhase = "drag" | "commit";

interface CanvasResizerProps {
  /** The preview frame being resized - measured here, never mutated here. */
  shellRef: RefObject<HTMLDivElement | null>;
  /** The padded stage whose content box caps how wide the frame is allowed to get. */
  stageRef: RefObject<HTMLDivElement | null>;
  /** Footer zoom. The shell carries `zoom`, so pointer travel arrives in rendered
   * pixels and has to be divided back down to the CSS pixels a width is set in. */
  zoom: number;
  /** The explicit width in effect, or null while the frame fills the container. */
  width: number | null;
  /** "drag" fires continuously while the pointer is down (the caller keeps it in
   * component state); "commit" fires once the size settles and can be persisted. */
  onResize: (width: number | null, phase: ResizePhase) => void;
}

function measureAvailable(stage: HTMLDivElement | null, zoom: number): number {
  if (!stage) return MIN_WIDTH;
  const styles = window.getComputedStyle(stage);
  const inner = stage.clientWidth - parseFloat(styles.paddingLeft) - parseFloat(styles.paddingRight);
  return Math.max(MIN_WIDTH, Math.round(inner / zoom));
}

/** Chrome DevTools-style width handle on the right edge of the preview frame. The
 * frame stays centred in the stage, so a drag moves both of its edges - the pointer
 * delta is doubled to keep the edge the reviewer grabbed under the pointer. */
export function CanvasResizer({ shellRef, stageRef, zoom, width, onResize }: CanvasResizerProps) {
  const dragRef = useRef<{ pointerId: number; startX: number; startWidth: number; max: number } | null>(null);
  const [dragging, setDragging] = useState(false);
  const [focused, setFocused] = useState(false);
  const [available, setAvailable] = useState(() => measureAvailable(stageRef.current, zoom));

  useEffect(() => {
    const stage = stageRef.current;
    if (!stage) return;
    const update = () => setAvailable(measureAvailable(stage, zoom));
    update();
    const observer = new ResizeObserver(update);
    observer.observe(stage);
    return () => observer.disconnect();
  }, [stageRef, zoom]);

  const resolve = useCallback((next: number, max: number): number | null => {
    if (next >= max - FIT_SNAP) return null;
    return Math.round(Math.min(max, Math.max(MIN_WIDTH, next)));
  }, []);

  function widthFrom(clientX: number, drag: { startX: number; startWidth: number; max: number }) {
    return resolve(drag.startWidth + ((clientX - drag.startX) / zoom) * 2, drag.max);
  }

  function onPointerDown(event: PointerEvent<HTMLDivElement>) {
    const shell = shellRef.current;
    if (event.button !== 0 || !shell) return;
    event.preventDefault();
    dragRef.current = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startWidth: shell.getBoundingClientRect().width / zoom,
      max: measureAvailable(stageRef.current, zoom),
    };
    event.currentTarget.setPointerCapture(event.pointerId);
    setDragging(true);
  }

  function onPointerMove(event: PointerEvent<HTMLDivElement>) {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    onResize(widthFrom(event.clientX, drag), "drag");
  }

  function onPointerUp(event: PointerEvent<HTMLDivElement>) {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    dragRef.current = null;
    setDragging(false);
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
    onResize(widthFrom(event.clientX, drag), "commit");
  }

  function onKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    const max = measureAvailable(stageRef.current, zoom);
    const current = width ?? max;
    const step = event.shiftKey ? KEY_STEP_COARSE : KEY_STEP;
    let next: number | null = null;
    if (event.key === "ArrowLeft") next = resolve(current - step, max);
    else if (event.key === "ArrowRight") next = resolve(current + step, max);
    else if (event.key === "End") next = resolve(MIN_WIDTH, max);
    else if (event.key !== "Home") return;
    event.preventDefault();
    onResize(next, "commit");
  }

  const shown = width ?? available;

  return (
    <div
      role="separator"
      aria-orientation="vertical"
      aria-label="Resize the preview width"
      aria-valuemin={MIN_WIDTH}
      aria-valuemax={available}
      aria-valuenow={shown}
      aria-valuetext={`${shown} pixels wide${width === null ? " — fit to canvas" : ""}`}
      tabIndex={0}
      className={`bl-canvas-resizer${dragging ? " is-dragging" : ""}`}
      title="Drag to resize the preview — double-click to fit"
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerUp}
      onDoubleClick={() => onResize(null, "commit")}
      onKeyDown={onKeyDown}
      onFocus={() => setFocused(true)}
      onBlur={() => setFocused(false)}
    >
      {(dragging || focused) && (
        <span className="bl-canvas-resizer-value" aria-hidden="true">{shown} px</span>
      )}
    </div>
  );
}
