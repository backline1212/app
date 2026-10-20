import { sha256 } from "./hash";
import { getDirectText, getStableAttributes } from "./node-identity";
import { computeSimhash } from "./simhash";
import type { NodeRecord, NodeTreeEntry, NormalizedSnapshot } from "./types";

const STYLE_SUBSET_PROPERTIES = ["display", "font-size", "color", "background-color"] as const;
const MAX_NODES = 5000;
const MAX_DEPTH = 80;
const MAX_TEXT_LENGTH = 20_000;
const MAX_SNAPSHOT_BYTES = 4 * 1024 * 1024;

interface CaptureState { count: number; scanned: number; bytes: number; startedAt: number; documentUrl: string; elements: WeakSet<Element> }

function requireCurrent(state: CaptureState): void {
  if (location.href !== state.documentUrl) throw new Error("The page changed during version capture. Reopen review on the current page.");
  if (performance.now() - state.startedAt > 10_000) throw new Error("This page took too long to capture. Comments still work; retry its version when the page settles.");
}

function getStyleSubset(el: Element): Record<string, string> {
  const computed = window.getComputedStyle(el);
  const subset: Record<string, string> = {};
  for (const prop of STYLE_SUBSET_PROPERTIES) {
    subset[prop] = computed.getPropertyValue(prop);
  }
  return subset;
}

// 09-Snapshot-Engine.md §9.3: non-visible nodes are excluded from the whole-page walk
// (they're only kept when a comment is directly anchored to one - out of scope here,
// this function captures the page-load-time snapshot, not a single anchored element).
function isVisible(el: Element): boolean {
  const rect = el.getBoundingClientRect();
  if (rect.width === 0 && rect.height === 0) return false;
  return window.getComputedStyle(el).display !== "none";
}

async function buildNode(
  el: Element,
  parentAncestorHash: string,
  nodesIndex: Record<string, NodeRecord>,
  state: CaptureState,
  depth: number,
): Promise<NodeTreeEntry> {
  requireCurrent(state);
  if (state.elements.has(el)) throw new Error("The page structure changed during capture. Retry when the page settles.");
  state.elements.add(el);
  state.count += 1;
  if (state.count > MAX_NODES || depth > MAX_DEPTH) throw new Error("This page is too complex for a complete version capture. Comments still work.");
  // Yield to pointer/keyboard work. Counters belong to this capture, so overlapping
  // page captures cannot reset each other's IDs or silently corrupt the tree.
  if (state.count % 40 === 0) { await new Promise(resolve => setTimeout(resolve, 0)); requireCurrent(state); }
  const nodeId = `n_${state.count}`;
  const tag = el.tagName.toLowerCase();
  const attributes = getStableAttributes(el);
  if (el.childNodes.length > 20_000) throw new Error("This page is too complex for a complete version capture. Comments still work.");
  let rawTextLength = 0;
  for (const child of el.childNodes) {
    if (child.nodeType === Node.TEXT_NODE) rawTextLength += child.textContent?.length ?? 0;
    if (rawTextLength > 200_000) throw new Error("A page element is too large for version capture. Comments still work.");
  }
  const text = getDirectText(el);
  if (text.length > MAX_TEXT_LENGTH || Object.values(attributes).some(value => value.length > 4000)) throw new Error("A page element is too large for version capture. Comments still work.");
  const rect = el.getBoundingClientRect();

  // Per-node / ancestor-path hashing (09-Snapshot-Engine.md §9.6) - shared with
  // anchor.ts's single-element computation (docs/tdr/0004).
  const nodeHash = await sha256(`${tag}|${JSON.stringify(attributes)}|${text.toLowerCase()}`);
  const ancestorPathHash = await sha256(`${parentAncestorHash}|${nodeHash}`);

  const children: NodeTreeEntry[] = [];
  // The upfront child-count bound makes this copy bounded; a live collection can
  // otherwise skip siblings when an app removes/reparents elements during awaits.
  for (const child of Array.from(el.children)) {
    state.scanned += 1;
    if (state.scanned > 20_000) throw new Error("This page is too complex for a complete version capture. Comments still work.");
    if (state.scanned % 100 === 0) { await new Promise(resolve => setTimeout(resolve, 0)); requireCurrent(state); }
    if (child.hasAttribute("data-backline-root")) continue;
    if (!isVisible(child)) continue;
    children.push(await buildNode(child, ancestorPathHash, nodesIndex, state, depth + 1));
  }

  const record: NodeRecord = {
    tag,
    attributes,
    text,
    bounding_box: { x: rect.x, y: rect.y, w: rect.width, h: rect.height },
    computed_style_subset: getStyleSubset(el),
    role: el.getAttribute("role"),
    accessible_name: el.getAttribute("aria-label") ?? (text || null),
    node_hash: nodeHash,
    ancestor_path_hash: ancestorPathHash,
    text_similarity_hash: computeSimhash(text),
  };
  if ((record.accessible_name?.length ?? 0) > MAX_TEXT_LENGTH || (record.role?.length ?? 0) > 256) throw new Error("A page element is too large for version capture. Comments still work.");
  state.bytes += new TextEncoder().encode(JSON.stringify(record)).byteLength;
  if (state.bytes > MAX_SNAPSHOT_BYTES - 512_000) throw new Error("This page version exceeds the capture size limit. Comments still work.");
  nodesIndex[nodeId] = record;

  return { node_id: nodeId, tag, children };
}

export async function captureSnapshot(): Promise<NormalizedSnapshot> {
  const state = { count: 0, scanned: 0, bytes: 0, startedAt: performance.now(), documentUrl: location.href, elements: new WeakSet<Element>() };
  const nodesIndex: Record<string, NodeRecord> = {};
  const rootAncestorHash = await sha256("root");
  const nodeTree = await buildNode(document.body, rootAncestorHash, nodesIndex, state, 0);

  const allHashes = Object.values(nodesIndex)
    .map((n) => n.node_hash)
    .join("|");
  const fullPageHash = await sha256(allHashes);

  const snapshot = {
    viewport: { width: window.innerWidth, height: window.innerHeight },
    node_tree: nodeTree,
    nodes_index: nodesIndex,
    full_page_hash: fullPageHash,
  };
  requireCurrent(state);
  if (new TextEncoder().encode(JSON.stringify(snapshot)).byteLength > MAX_SNAPSHOT_BYTES) throw new Error("This page version exceeds the capture size limit. Comments still work.");
  return snapshot;
}
