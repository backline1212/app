import { sha256 } from "./hash";

const PRIVATE_SELECTOR = 'input,textarea,select,[contenteditable=""],[contenteditable="true"],[contenteditable="plaintext-only"],[data-backline-private]';

export function isPrivateReviewElement(el: Element): boolean {
  return el.closest(PRIVATE_SELECTOR) !== null;
}

// Shared by dom-snapshot.ts (whole-page walk, at load time) and anchor.ts (single
// element, at click time) - both must compute node identity the same way, or an
// anchor's hashes can never match the corresponding node in a later snapshot, even for
// a completely unchanged page (docs/tdr/0004-anchor-snapshot-shared-hash-scheme.md).

export function getDirectText(el: Element): string {
  if (isPrivateReviewElement(el)) return "";
  let text = "";
  for (const child of el.childNodes) {
    if (child.nodeType === Node.TEXT_NODE) {
      text += child.textContent ?? "";
    }
  }
  return text.replace(/\s+/g, " ").trim();
}

export function getStableAttributes(el: Element): Record<string, string> {
  if (isPrivateReviewElement(el)) return {};
  const attrs: Record<string, string> = {};
  const id = el.getAttribute("id");
  if (id) attrs.id = id;
  const testId = el.getAttribute("data-testid");
  if (testId) attrs["data-testid"] = testId;
  const className = el.getAttribute("class");
  if (className) attrs.class = className;
  return attrs;
}

// 09-Snapshot-Engine.md §9.6: sha256(tag + sorted(stable_attributes) + normalized_text).
export async function computeNodeHash(el: Element): Promise<string> {
  const tag = el.tagName.toLowerCase();
  const attributes = getStableAttributes(el);
  const text = getDirectText(el);
  return sha256(`${tag}|${JSON.stringify(attributes)}|${text.toLowerCase()}`);
}

function ancestorChainFromBody(el: Element): Element[] {
  if (el === document.body) return [document.body];

  const chain: Element[] = [el];
  let current = el.parentElement;
  while (current && current !== document.body) {
    chain.unshift(current);
    current = current.parentElement;
  }
  chain.unshift(document.body);
  return chain;
}

export interface NodeIdentity {
  nodeHash: string;
  ancestorPathHash: string;
}

// Reproduces exactly what a full-page captureSnapshot() walk (dom-snapshot.ts) would
// have computed for `el`, without walking the rest of the page - dom-snapshot.ts's own
// root ancestor hash is sha256("root"), and each level chains
// sha256(parent_ancestor_hash|node_hash) top-down from <body>.
export async function computeIdentity(el: Element): Promise<NodeIdentity> {
  const chain = ancestorChainFromBody(el);
  let ancestorPathHash = await sha256("root");
  let nodeHash = "";
  for (const node of chain) {
    nodeHash = await computeNodeHash(node);
    ancestorPathHash = await sha256(`${ancestorPathHash}|${nodeHash}`);
  }
  return { nodeHash, ancestorPathHash };
}
