import { type RefObject, useCallback, useEffect, useRef, useState } from "react";

export interface Camera {
  x: number;
  y: number;
  k: number;
}

export const MIN_ZOOM = 0.2;
export const MAX_ZOOM = 1.8;
const FIT_PADDING = 56;

const clampZoom = (k: number) => Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, k));

/**
 * Pan/zoom state for the org chart stage. `smooth` is true for camera moves the app
 * makes (fit, fly to a person) so they glide; drags and wheel zoom stay 1:1 with the
 * hand. Pointer and wheel handling live in OrgChart; this only owns the numbers.
 */
export function useCamera(stageRef: RefObject<HTMLElement>) {
  const [camera, setCamera] = useState<Camera>({ x: 0, y: 0, k: 1 });
  const [smooth, setSmooth] = useState(false);
  const cameraRef = useRef(camera);
  cameraRef.current = camera;
  const smoothTimer = useRef<number>();

  useEffect(() => () => window.clearTimeout(smoothTimer.current), []);

  const set = useCallback((next: Camera, animate: boolean) => {
    window.clearTimeout(smoothTimer.current);
    setSmooth(animate);
    if (animate) smoothTimer.current = window.setTimeout(() => setSmooth(false), 620);
    setCamera({ x: next.x, y: next.y, k: clampZoom(next.k) });
  }, []);

  const size = useCallback(() => {
    const el = stageRef.current;
    return { w: el?.clientWidth ?? 1, h: el?.clientHeight ?? 1 };
  }, [stageRef]);

  /** Fit a world-space box in view. */
  const fit = useCallback(
    (box: { x: number; y: number; w: number; h: number }, animate = true, maxZoom = 1) => {
      const { w, h } = size();
      const k = clampZoom(Math.min((w - FIT_PADDING * 2) / box.w, (h - FIT_PADDING * 2) / box.h, maxZoom));
      set({ k, x: (w - box.w * k) / 2 - box.x * k, y: (h - box.h * k) / 2 - box.y * k }, animate);
    },
    [set, size],
  );

  /** Put a world-space point at the centre of the stage. */
  const centerOn = useCallback(
    (point: { x: number; y: number }, k?: number, animate = true) => {
      const { w, h } = size();
      const zoom = clampZoom(k ?? cameraRef.current.k);
      set({ k: zoom, x: w / 2 - point.x * zoom, y: h / 2 - point.y * zoom }, animate);
    },
    [set, size],
  );

  /** Zoom by `factor` keeping the screen point (sx, sy) still; centre when omitted. */
  const zoomBy = useCallback(
    (factor: number, sx?: number, sy?: number, animate = false) => {
      const { w, h } = size();
      const current = cameraRef.current;
      const px = sx ?? w / 2;
      const py = sy ?? h / 2;
      const k = clampZoom(current.k * factor);
      const ratio = k / current.k;
      set({ k, x: px - (px - current.x) * ratio, y: py - (py - current.y) * ratio }, animate);
    },
    [set, size],
  );

  const panBy = useCallback(
    (dx: number, dy: number) => {
      const current = cameraRef.current;
      set({ ...current, x: current.x + dx, y: current.y + dy }, false);
    },
    [set],
  );

  return { camera, cameraRef, smooth, set, fit, centerOn, zoomBy, panBy, size };
}
