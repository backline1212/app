// Keeps a pin visually attached to its target element even while that element itself
// moves - a CSS transform/animation-driven carousel or marquee, for instance, where the
// element never leaves the DOM (so resolveAnchorElement/the click's own element
// reference keeps finding it) but its on-screen position changes every frame, unrelated
// to page scroll (which position:absolute + pageX/pageY already handle - see ui.ts).
// Without this, a pin captured the moment its card was under the cursor stays glued to
// that now-stale page position forever, and a completely different card ends up
// visually "owning" the comment once the animation moves on.
//
// Also hides the pin while its target is scrolled out of the viewport entirely
// (intersectsViewport below), rather than letting it trail along above/below the
// visible area as the page scrolls - a real complaint found by hand: a pin on a card
// that scrolled away stayed visible flying up/down the page after it, looking broken,
// instead of just disappearing until that card scrolls back into view.
//
// One shared requestAnimationFrame loop for every tracked pin (not one loop per pin) -
// a page with several comments open at once still only pays for a single rAF callback,
// which just iterates the tracked set and re-reads each target's own
// getBoundingClientRect(). A dirty-check (only touching the DOM when the position
// actually changed) keeps a page with zero moving elements essentially free after the
// first frame.
/** The tracked element's top-left page coordinate and current rendered size. */
export interface AnchorBox {
  x: number;
  y: number;
  width: number;
  height: number;
}

interface TrackedAnchor {
  resolve: () => Element | null;
  onUpdate: (box: AnchorBox | null) => void;
  lastKey: string;
}

const tracked = new Set<TrackedAnchor>();
let rafId: number | null = null;

// An element scrolled entirely out of the viewport isn't "moved" the way a carousel
// card is - a pin that stayed visible while its target scrolled away would just be
// floating over unrelated content with nothing to actually point at, or (worse, for a
// page that scrolls far) sitting absurdly far off past the edge of whatever's on
// screen. So a target with zero overlap with the current viewport is treated the same
// as "can't be found" - hidden - and reappears the moment it scrolls back into view.
function intersectsViewport(rect: DOMRect): boolean {
  return (
    rect.bottom > 0 &&
    rect.top < window.innerHeight &&
    rect.right > 0 &&
    rect.left < window.innerWidth
  );
}

function tick(): void {
  for (const anchor of tracked) {
    const el = anchor.resolve();
    const rect = el?.getBoundingClientRect();
    if (rect && intersectsViewport(rect)) {
      const x = rect.left + window.scrollX;
      const y = rect.top + window.scrollY;
      const key = `${x}:${y}:${rect.width}:${rect.height}`;
      if (key !== anchor.lastKey) {
        anchor.lastKey = key;
        anchor.onUpdate({ x, y, width: rect.width, height: rect.height });
      }
    } else if (anchor.lastKey !== "gone") {
      anchor.lastKey = "gone";
      anchor.onUpdate(null);
    }
  }
  rafId = tracked.size > 0 ? requestAnimationFrame(tick) : null;
}

/**
 * `resolve` is called every frame to get the current live element - a direct element
 * reference for a pin just created this session (`() => target`), or
 * `resolveAnchorElement(anchor)` for one loaded from the server. `onUpdate` fires only
 * when the resolved element's position or size actually changes, with `null` if the element
 * currently can't be found at all (e.g. removed from the DOM) *or* is scrolled
 * completely outside the viewport - callers typically hide the pin in that case rather
 * than leaving it at its last known position or letting it trail off past the edge of
 * the screen. Returns a function that stops tracking - call it when the pin itself is
 * removed.
 */
export function trackAnchor(
  resolve: () => Element | null,
  onUpdate: (box: AnchorBox | null) => void,
): () => void {
  const entry: TrackedAnchor = { resolve, onUpdate, lastKey: "" };
  tracked.add(entry);
  if (rafId === null) rafId = requestAnimationFrame(tick);
  return () => {
    tracked.delete(entry);
  };
}
