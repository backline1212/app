// Where a comment's pin or drawn area sits on its automatic screenshot (TDR-0197), as
// fractions of the image. Recorded the moment the screenshot is taken, so it matches
// that image even if the reviewer scrolls before posting; the dashboard draws it when
// the live preview can't load the site.

export interface ScreenshotMarker {
  x: number;
  y: number;
  w?: number;
  h?: number;
}

/** A pin's point or a drawn area, in page coordinates (CSS px) as the overlay places it. */
export interface PageBox {
  left: number;
  top: number;
  width?: number;
  height?: number;
}

const markers = new WeakMap<Blob, ScreenshotMarker>();
const clamp = (value: number): number => Math.min(1, Math.max(0, Number.isFinite(value) ? value : 0));

function markerFor(box: PageBox): ScreenshotMarker {
  const width = window.innerWidth || 1;
  const height = window.innerHeight || 1;
  const x = clamp((box.left - window.scrollX) / width);
  const y = clamp((box.top - window.scrollY) / height);
  if (!box.width || !box.height) return { x, y };
  return {
    x,
    y,
    w: clamp((box.left + box.width - window.scrollX) / width) - x,
    h: clamp((box.top + box.height - window.scrollY) / height) - y,
  };
}

/** Wraps a screenshot function so each image it returns remembers where `box` was. */
export function withMarker(capture: () => Promise<Blob | null>, box: () => PageBox | null): () => Promise<Blob | null> {
  return async () => {
    const at = box();
    const marker = at ? markerFor(at) : null;
    const blob = await capture();
    if (blob && marker) markers.set(blob, marker);
    return blob;
  };
}

export function markerOf(blob: Blob | null | undefined): ScreenshotMarker | null {
  return (blob && markers.get(blob)) || null;
}

/** A blacked-out copy of a screenshot keeps the original's marker. */
export function carryMarker(from: Blob, to: Blob): void {
  const marker = markers.get(from);
  if (marker) markers.set(to, marker);
}

export function pinBox(pin: HTMLElement): PageBox | null {
  const left = parseFloat(pin.style.left);
  const top = parseFloat(pin.style.top);
  return Number.isFinite(left) && Number.isFinite(top) ? { left, top } : null;
}
