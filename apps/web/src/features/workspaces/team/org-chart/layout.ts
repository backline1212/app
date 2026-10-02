import type { OrgPerson, OrgTree } from "../team-utils";

// Geometry of the org chart, in world units (CSS pixels at 100% zoom).
export const NODE_W = 236;
export const NODE_H = 92;
export const ROOT_W = 292;
export const ROOT_H = 74;
const GAP_X = 26;
const GAP_Y = 70;
// A manager with this many reports, none of whom have reports of their own, gets them
// stacked in columns under them instead of one very wide row - the way real org charts
// keep a team of twelve readable.
const STACK_MIN = 4;
const STACK_ROW_GAP = 14;
const STACK_INDENT = 26;
const CORNER = 10;

export const ROOT_ID = "__workspace__";

export interface LayoutNode {
  id: string;
  kind: "root" | "person";
  person?: OrgPerson;
  x: number;
  y: number;
  w: number;
  h: number;
  depth: number;
  /** Position among everything laid out, for the staggered entrance. */
  order: number;
  parentId: string | null;
  /** Reports hidden because this node (or one above it) is collapsed. */
  hiddenCount: number;
  childCount: number;
}

export interface LayoutEdge {
  id: string;
  from: string;
  to: string;
  d: string;
  /** Approximate path length, for the line-drawing entrance. */
  length: number;
  inferred: boolean;
  depth: number;
}

export interface OrgLayout {
  nodes: LayoutNode[];
  edges: LayoutEdge[];
  width: number;
  height: number;
  byId: Map<string, LayoutNode>;
}

interface Box {
  id: string;
  kind: "root" | "person";
  person?: OrgPerson;
  w: number;
  h: number;
  children: Box[];
  stacked: boolean;
  cols: number;
  /** Subtree width. */
  span: number;
  hiddenCount: number;
}

function countAll(person: OrgPerson): number {
  return person.children.reduce((sum, child) => sum + 1 + countAll(child), 0);
}

function boxFor(person: OrgPerson, collapsed: Set<string>): Box {
  const isCollapsed = collapsed.has(person.member.user_id);
  const children = isCollapsed ? [] : person.children.map((child) => boxFor(child, collapsed));
  return {
    id: person.member.user_id,
    kind: "person",
    person,
    w: NODE_W,
    h: NODE_H,
    children,
    stacked: false,
    cols: 1,
    span: 0,
    hiddenCount: isCollapsed ? countAll(person) : 0,
  };
}

function measure(box: Box): number {
  if (box.children.length === 0) {
    box.span = box.w;
    return box.span;
  }
  const allLeaves = box.children.every((child) => child.children.length === 0);
  if (allLeaves && box.children.length >= STACK_MIN) {
    const n = box.children.length;
    box.stacked = true;
    box.cols = n > 12 ? 3 : n > 6 ? 2 : 1;
    const stackWidth = STACK_INDENT + box.cols * NODE_W + (box.cols - 1) * GAP_X;
    box.children.forEach(measure);
    box.span = Math.max(box.w, stackWidth);
    return box.span;
  }
  const total = box.children.reduce((sum, child) => sum + measure(child), 0) + GAP_X * (box.children.length - 1);
  box.span = Math.max(box.w, total);
  return box.span;
}

/** A vertical-then-horizontal-then-vertical connector with rounded corners. */
function elbow(x1: number, y1: number, x2: number, y2: number, midY: number): string {
  if (Math.abs(x2 - x1) < 1) return `M${x1},${y1} V${y2}`;
  const dir = x2 > x1 ? 1 : -1;
  const r = Math.min(CORNER, Math.abs(x2 - x1) / 2, midY - y1, y2 - midY);
  return `M${x1},${y1} V${midY - r} Q${x1},${midY} ${x1 + dir * r},${midY} H${x2 - dir * r} Q${x2},${midY} ${x2},${midY + r} V${y2}`;
}

/** Parent bottom -> bus -> a spine left of a stacked column -> into a card's left edge. */
function stackPath(px: number, py: number, busY: number, spineX: number, cy: number, cx: number): string {
  const dir = spineX > px ? 1 : -1;
  const r = Math.min(CORNER, Math.abs(spineX - px) / 2 || CORNER, busY - py);
  const toBus =
    Math.abs(spineX - px) < 1
      ? `M${px},${py} V${cy - CORNER}`
      : `M${px},${py} V${busY - r} Q${px},${busY} ${px + dir * r},${busY} H${spineX - dir * CORNER} Q${spineX},${busY} ${spineX},${busY + CORNER} V${cy - CORNER}`;
  return `${toBus} Q${spineX},${cy} ${spineX + CORNER},${cy} H${cx}`;
}

function approxLength(d: string): number {
  const nums = d.match(/-?\d+(\.\d+)?/g)?.map(Number) ?? [];
  // Good enough for a dash animation: sum of jumps between consecutive points.
  let length = 0;
  for (let i = 2; i + 1 < nums.length; i += 2) {
    length += Math.abs(nums[i] - nums[i - 2]) + Math.abs(nums[i + 1] - nums[i - 1]);
  }
  return Math.max(60, Math.round(length));
}

export function layoutOrg(tree: OrgTree, collapsed: Set<string>): OrgLayout {
  const root: Box = {
    id: ROOT_ID,
    kind: "root",
    w: ROOT_W,
    h: ROOT_H,
    children: tree.roots.map((person) => boxFor(person, collapsed)),
    stacked: false,
    cols: 1,
    span: 0,
    hiddenCount: 0,
  };
  measure(root);

  const nodes: LayoutNode[] = [];
  const edges: LayoutEdge[] = [];
  // Children placed in a stacked column, whose connector runs down a spine instead.
  const stackedChildren = new Set<string>();
  let order = 0;
  let maxBottom = 0;

  const edgesFor = (child: LayoutNode, px: number, py: number): string => {
    if (stackedChildren.has(child.id)) {
      const spineX = child.x - STACK_INDENT / 2 - 2;
      return stackPath(px, py, py + GAP_Y * 0.28, spineX, child.y + child.h / 2, child.x);
    }
    return elbow(px, py, child.x + child.w / 2, child.y, py + GAP_Y / 2);
  };

  const place = (box: Box, left: number, top: number, depth: number, parent: LayoutNode | null, inferred: boolean) => {
    const node: LayoutNode = {
      id: box.id,
      kind: box.kind,
      person: box.person,
      x: left + (box.span - box.w) / 2,
      y: top,
      w: box.w,
      h: box.h,
      depth,
      order: order++,
      parentId: parent?.id ?? null,
      hiddenCount: box.hiddenCount,
      childCount: box.person?.children.length ?? box.children.length,
    };
    nodes.push(node);
    maxBottom = Math.max(maxBottom, node.y + node.h);
    if (parent) {
      const px = parent.x + parent.w / 2;
      const py = parent.y + parent.h;
      const d = edgesFor(node, px, py);
      edges.push({ id: `${parent.id}->${node.id}`, from: parent.id, to: node.id, d, length: approxLength(d), inferred, depth });
    }

    const childTop = node.y + node.h + GAP_Y;
    if (box.stacked) {
      const n = box.children.length;
      const rows = Math.ceil(n / box.cols);
      const stackWidth = STACK_INDENT + box.cols * NODE_W + (box.cols - 1) * GAP_X;
      const gridLeft = left + (box.span - stackWidth) / 2 + STACK_INDENT;
      box.children.forEach((child, index) => {
        const col = Math.floor(index / rows);
        const row = index % rows;
        child.span = NODE_W;
        stackedChildren.add(child.id);
        place(
          child,
          gridLeft + col * (NODE_W + GAP_X),
          childTop - GAP_Y * 0.45 + row * (NODE_H + STACK_ROW_GAP),
          depth + 1,
          node,
          Boolean(child.person?.inferred),
        );
      });
      return;
    }
    let cursor = left + (box.span - (box.children.reduce((s, c) => s + c.span, 0) + GAP_X * (box.children.length - 1))) / 2;
    box.children.forEach((child) => {
      place(child, cursor, childTop, depth + 1, node, Boolean(child.person?.inferred));
      cursor += child.span + GAP_X;
    });
  };

  place(root, 0, 0, 0, null, false);

  const width = Math.max(root.span, ...nodes.map((n) => n.x + n.w));
  return {
    nodes,
    edges,
    width,
    height: maxBottom,
    byId: new Map(nodes.map((n) => [n.id, n])),
  };
}
