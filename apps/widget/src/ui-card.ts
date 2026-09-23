// Pieces shared by the two cards that open beside a pin - the new-comment composer
// (ui-composer.ts) and the read-only view of an existing comment (ui-comment-view.ts) -
// so both read as the same box from the design.

export const svg = (paths: string, strokeWidth = 1.8, size = 12): string =>
  `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="${strokeWidth}" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${paths}</svg>`;

// Every tag in the backend's Tag vocabulary (comments/schemas.py) - the composer offers
// the first four, but the dashboard can set any of them on an existing comment.
export const TAG_ICONS: Record<string, string> = {
  Bug: '<path d="M8 6h8M9 3l1.5 3M15 3l-1.5 3"/><rect x="6" y="6" width="12" height="14" rx="6"/><path d="M3 11h3M18 11h3M3 17h3M18 17h3"/>',
  Copy: '<path d="M4 6h16M4 12h10M4 18h13"/>',
  Design: '<path d="M12 19l7-7 3 3-7 7-3-3zM18 13l-1.5-7.5L2 2l3.5 14.5L13 18l5-5zM2 2l7.6 7.6"/><circle cx="11" cy="11" r="2"/>',
  Responsive: '<rect x="2" y="4" width="14" height="10" rx="2"/><rect x="16" y="9" width="6" height="11" rx="1.5"/>',
  Content: '<rect x="3" y="4" width="18" height="16" rx="2"/><path d="M7 9h6M7 13h10"/>',
  Accessibility: '<circle cx="12" cy="5" r="1.6"/><path d="M4 9l8 1.5L20 9M12 10.5V15l-3 6M12 15l3 6"/>',
};

export function escapeHtml(text: string): string {
  return text.replace(/[&<>"']/g, (ch) => `&#${ch.charCodeAt(0)};`);
}

export function initials(name: string): string {
  const words = name.trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return "?";
  const letters = words.length === 1 ? words[0].slice(0, 2) : words[0][0] + words[words.length - 1][0];
  return letters.toUpperCase();
}

/**
 * The dark header row: author avatar, title, page pill and a close "x". `trailingHtml`
 * (already-escaped markup) sits between the page pill and the "x" - the read-only
 * comment view puts the comment's status there.
 */
export function cardHeaderHtml(opts: {
  authorName: string;
  title: string;
  titleClass?: string;
  pagePath: string;
  closeLabel: string;
  trailingHtml?: string;
}): string {
  return `
    <div class="bl-cp-head">
      <span class="bl-cp-av" aria-hidden="true">${escapeHtml(initials(opts.authorName))}</span>
      <span class="bl-cp-title ${opts.titleClass ?? ""}">${escapeHtml(opts.title)}</span>
      <span class="bl-cp-loc" title="${escapeHtml(opts.pagePath)}">${escapeHtml(opts.pagePath)}</span>
      ${opts.trailingHtml ?? ""}
      <button type="button" class="bl-cancel" aria-label="${escapeHtml(opts.closeLabel)}">&times;</button>
    </div>`;
}

const CARD_WIDTH = 344;
const EDGE_GAP = 12;

/**
 * x/y are page (document) coordinates, same as renderPin - the card is position:
 * absolute so it scrolls with the element it's about. Opens beside the point, flipping
 * to its left when there's no room on the right and lifting up when it would run past
 * the bottom of the viewport - the same placement rules as the design's composer. The
 * clamps account for the current scroll position, since window.innerWidth/innerHeight
 * are viewport-sized but x/y are measured from the top of the document.
 */
export function placeCard(card: HTMLElement, x: number, y: number): void {
  const width = Math.min(CARD_WIDTH, window.innerWidth - EDGE_GAP * 2);
  const height = card.offsetHeight;
  const viewRight = window.scrollX + window.innerWidth - EDGE_GAP;
  const viewBottom = window.scrollY + window.innerHeight - EDGE_GAP;
  let left = x + 16;
  if (left + width > viewRight) left = x - width - 16;
  left = Math.max(window.scrollX + EDGE_GAP, Math.min(left, viewRight - width));
  let top = y + 12;
  if (top + height > viewBottom) top = viewBottom - height;
  top = Math.max(window.scrollY + EDGE_GAP, top);
  card.style.left = `${left}px`;
  card.style.top = `${top}px`;
}
