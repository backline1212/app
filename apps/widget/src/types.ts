// Mirrors the backend's Pydantic schemas (Rule 3, 02-Engineering-Principles.md) closely
// enough for the SDK's own use - the widget bundle stays dependency-free rather than
// pulling in @backline/types, so these are hand-kept in sync, not generated.

export interface BacklineConfig {
  shareToken: string;
  apiBaseUrl?: string;
}

export interface NodeRecord {
  tag: string;
  attributes: Record<string, string>;
  text: string;
  bounding_box: { x: number; y: number; w: number; h: number };
  computed_style_subset: Record<string, string>;
  role: string | null;
  accessible_name: string | null;
  node_hash: string;
  ancestor_path_hash: string;
  // SimHash of `text`, for approximate matching when a node's text changes slightly
  // between revisions (08-Anchor-Engine.md §8.1, Milestone 5's anchor_engine matcher).
  text_similarity_hash: string;
}

export interface NodeTreeEntry {
  node_id: string;
  tag: string;
  children: NodeTreeEntry[];
}

export interface NormalizedSnapshot {
  viewport: { width: number; height: number };
  node_tree: NodeTreeEntry;
  nodes_index: Record<string, NodeRecord>;
  full_page_hash: string;
}

export interface DomFingerprint {
  selector_path: string;
  tag: string;
  attributes: Record<string, string>;
  // Same hash scheme as NodeRecord above (docs/tdr/0004-anchor-snapshot-shared-hash-scheme.md) -
  // required for the Anchor Engine to compare an anchor against a snapshot's nodes_index at all.
  node_hash: string;
  ancestor_path_hash: string;
  // Where within the anchored element the reviewer actually clicked, as a 0-1 fraction
  // of its box. selector_path resolves no finer than a whole element, so a click on one
  // word partway through a paragraph anchors to that entire <p> - without this, a reload
  // re-rendered every such pin at the paragraph's top-left corner instead of the clicked
  // word. Stored as a fraction rather than pixels so it still lands proportionally
  // inside the element after a reflow (different viewport, late-loading font).
  // Optional: comments created before this field existed have no value, and fall back to
  // the corner - the same (honest) behavior they were created with.
  click_offset_pct?: { x: number; y: number };
  region_box_pct?: { x: number; y: number; width: number; height: number };
}

export interface AnchorPayload {
  tier: 1;
  type?: "point" | "region";
  dom_fingerprint: DomFingerprint;
  text_fingerprint: {
    normalized_text: string;
    text_similarity_hash: string;
  };
}

export interface AttachmentRecord {
  filename: string;
  url: string;
  content_type: string;
}

// Subset of the backend's CommentOut (packages/types/src/openapi.ts) - just the fields
// the widget needs to place a comment's pin and show it in its read-only card.
export interface CommentRecord {
  id: string;
  page_id: string;
  parent_id: string | null;
  author_type: "member" | "guest";
  author_id: string;
  author_name: string;
  body: string;
  created_at: string;
  anchor: AnchorPayload;
  attachments: AttachmentRecord[];
  tags: string[];
}
