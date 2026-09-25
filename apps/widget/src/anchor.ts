import { computeIdentity, getDirectText, getStableAttributes } from "./node-identity";
import { computeSimhash } from "./simhash";
import type { AnchorPayload, DomFingerprint } from "./types";

// Tier 1 only (08-Anchor-Engine.md §8.2) - Tier 2 text-similarity fallback and Tier 3
// visual fingerprint are the Recovery Engine's concern (Milestone 8's diff pipeline),
// not capture time. This must stay fast (< 50ms, 07-Review-SDK.md §7.7) since it runs
// synchronously on tap.

function nthOfTypeIndex(el: Element): number {
  let index = 1;
  let sibling = el.previousElementSibling;
  while (sibling) {
    if (sibling.tagName === el.tagName) index += 1;
    sibling = sibling.previousElementSibling;
  }
  return index;
}

function selectorSegment(el: Element): string {
  const tag = el.tagName.toLowerCase();
  if (el.id) return `${tag}#${el.id}`;
  return `${tag}:nth-of-type(${nthOfTypeIndex(el)})`;
}

function buildSelectorPath(el: Element): string {
  const segments: string[] = [];
  let current: Element | null = el;
  while (current && current !== document.body) {
    segments.unshift(selectorSegment(current));
    current = current.parentElement;
  }
  return `body > ${segments.join(" > ")}`;
}

/**
 * The reverse of computeAnchor's dom_fingerprint.selector_path: finds the live element
 * an existing, previously-stored anchor refers to, so its pin can be rendered on this
 * page load. Best-effort only, by design - this is not the Anchor/Recovery Engine's
 * multi-tier matching (08-Anchor-Engine.md), just "does this exact selector still
 * resolve to exactly one element." A missing/stale match simply means that comment's
 * pin doesn't render this load; the comment itself is untouched, still visible on the
 * dashboard Board, and can still be recovered/re-anchored there.
 */
export function resolveAnchorElement(anchor: AnchorPayload): Element | null {
  try {
    return document.querySelector(anchor.dom_fingerprint.selector_path);
  } catch {
    return null;
  }
}

/**
 * Resolve an existing anchor after client-rendered content has had time to appear.
 *
 * The widget can initialize before an SPA finishes hydrating or fetching the section
 * that owns a comment. A one-shot query made pin visibility depend on that race. This
 * bounded observer/poll combination catches late DOM insertion and class/style-driven
 * rendering without waiting forever when an anchor is genuinely stale.
 */
export function waitForAnchorElement(
  anchor: AnchorPayload,
  timeoutMs = 8_000,
): Promise<Element | null> {
  const immediate = resolveAnchorElement(anchor);
  if (immediate) return Promise.resolve(immediate);

  return new Promise((resolve) => {
    let settled = false;
    const observer = new MutationObserver(check);

    function finish(element: Element | null): void {
      if (settled) return;
      settled = true;
      observer.disconnect();
      clearInterval(pollId);
      clearTimeout(timeoutId);
      resolve(element);
    }

    function check(): void {
      const element = resolveAnchorElement(anchor);
      if (element) finish(element);
    }

    observer.observe(document.documentElement, {
      childList: true,
      subtree: true,
      attributes: true,
    });
    const pollId = setInterval(check, 500);
    const timeoutId = setTimeout(() => finish(null), timeoutMs);
  });
}

function clamp01(value: number): number {
  return Math.min(1, Math.max(0, value));
}

/**
 * Fraction of `el`'s own box that the click landed at. Page (document) coordinates in,
 * matching pageX/pageY - the same convention renderPin/openComposer use.
 */
export function clickOffsetPct(
  el: Element,
  clickX: number,
  clickY: number,
): { x: number; y: number } {
  const rect = el.getBoundingClientRect();
  return {
    x: rect.width > 0 ? clamp01((clickX - (rect.left + window.scrollX)) / rect.width) : 0,
    y: rect.height > 0 ? clamp01((clickY - (rect.top + window.scrollY)) / rect.height) : 0,
  };
}

/** The reverse of clickOffsetPct: the stored fraction back into a live page position. */
export function anchorPointFor(el: Element, anchor: AnchorPayload): { x: number; y: number } {
  const rect = el.getBoundingClientRect();
  const pct = anchor.dom_fingerprint.click_offset_pct ?? { x: 0, y: 0 };
  return {
    x: rect.left + window.scrollX + rect.width * pct.x,
    y: rect.top + window.scrollY + rect.height * pct.y,
  };
}

/** clickX/clickY are page (document) coordinates - pageX/pageY, not clientX/clientY. */
export async function computeAnchor(
  el: Element,
  clickX: number,
  clickY: number,
): Promise<AnchorPayload> {
  const tag = el.tagName.toLowerCase();
  const attributes = getStableAttributes(el);

  // node_hash/ancestor_path_hash use the exact same scheme captureSnapshot() uses
  // (docs/tdr/0004-anchor-snapshot-shared-hash-scheme.md) - without this, the Anchor
  // Engine's matcher could never find this element in a later snapshot, even
  // unchanged, since the hashes wouldn't be computed the same way.
  const { nodeHash, ancestorPathHash } = await computeIdentity(el);

  // Direct text only, matching what a snapshot node's own `text` field holds - not
  // el.textContent, which would include descendant elements' text and so wouldn't
  // match the snapshot's per-node text for anything with nested markup.
  const normalizedText = getDirectText(el).toLowerCase();

  const domFingerprint: DomFingerprint = {
    selector_path: buildSelectorPath(el),
    tag,
    attributes,
    node_hash: nodeHash,
    ancestor_path_hash: ancestorPathHash,
    click_offset_pct: clickOffsetPct(el, clickX, clickY),
  };

  return {
    tier: 1,
    type: "point",
    dom_fingerprint: domFingerprint,
    text_fingerprint: {
      normalized_text: normalizedText,
      text_similarity_hash: computeSimhash(normalizedText),
    },
  };
}

export async function computeRegionAnchor(
  el: Element,
  rect: { x: number; y: number; width: number; height: number }
): Promise<AnchorPayload> {
  const tag = el.tagName.toLowerCase();
  const attributes = getStableAttributes(el);
  const { nodeHash, ancestorPathHash } = await computeIdentity(el);
  const normalizedText = getDirectText(el).toLowerCase();
  
  const elRect = el.getBoundingClientRect();
  const region_box_pct = {
    x: elRect.width > 0 ? clamp01((rect.x - (elRect.left + window.scrollX)) / elRect.width) : 0,
    y: elRect.height > 0 ? clamp01((rect.y - (elRect.top + window.scrollY)) / elRect.height) : 0,
    width: elRect.width > 0 ? clamp01(rect.width / elRect.width) : 0,
    height: elRect.height > 0 ? clamp01(rect.height / elRect.height) : 0,
  };

  return {
    tier: 1,
    type: "region",
    dom_fingerprint: {
      selector_path: buildSelectorPath(el),
      tag,
      attributes,
      node_hash: nodeHash,
      ancestor_path_hash: ancestorPathHash,
      region_box_pct,
    },
    text_fingerprint: {
      normalized_text: normalizedText,
      text_similarity_hash: computeSimhash(normalizedText),
    },
  };
}
