import { Avatar } from "@backline/ui";
import {
  type CSSProperties,
  type KeyboardEvent as ReactKeyboardEvent,
  type PointerEvent as ReactPointerEvent,
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";

import { EmptyArt } from "../../../../components/illustrations";
import { roleLabel } from "../../../../lib/project-roles";
import type { AccessMatrixOut, MemberOut, WorkspaceOut } from "../../api";
import {
  WORKSPACE_ROLE_LABEL,
  buildOrgTree,
  chainOf,
  descendantsOf,
  teamsOf,
} from "../team-utils";
import { ROOT_ID, type LayoutNode, layoutOrg } from "./layout";
import { MiniMap } from "./MiniMap";
import { MAX_ZOOM, MIN_ZOOM, useCamera } from "./use-camera";

interface OrgChartProps {
  workspace: WorkspaceOut;
  members: MemberOut[];
  matrix: AccessMatrixOut | undefined;
  myUserId: string | undefined;
  /** Owners and admins draw reporting lines by dragging a card onto its manager. */
  canEditLines: boolean;
  selectedUserId: string | null;
  onSelect: (userId: string | null) => void;
  onReassign: (userId: string, managerUserId: string | null) => void;
  lensProjectId: string | null;
  onLensChange: (projectId: string | null) => void;
  team: string | null;
  onTeamChange: (team: string | null) => void;
}

interface DragState {
  userId: string;
  pointerId: number;
  startX: number;
  startY: number;
  x: number;
  y: number;
  active: boolean;
  targetId: string | null;
  valid: boolean;
}

const DRAG_THRESHOLD = 6;
const EDGE_PAN_ZONE = 48;

/** How well someone matches a search, lower is better; null when they don't. A name
 * that starts with the query beats one that merely contains it ("emi" finds Emily
 * before Yusuf Demir), and names beat titles, teams and emails. */
function matchScore(member: MemberOut, query: string): number | null {
  const q = query.trim().toLowerCase();
  if (!q) return null;
  const name = member.name.toLowerCase();
  if (name.startsWith(q)) return 0;
  if (name.split(/\s+/).some((word) => word.startsWith(q))) return 1;
  if (name.includes(q)) return 2;
  const title = (member.title ?? "").toLowerCase();
  const team = (member.team ?? "").toLowerCase();
  if (title.startsWith(q) || team.startsWith(q)) return 3;
  if (title.includes(q) || team.includes(q) || member.email.toLowerCase().includes(q)) return 4;
  return null;
}

function matches(member: MemberOut, query: string): boolean {
  return matchScore(member, query) !== null;
}

export function OrgChart({
  workspace,
  members,
  matrix,
  myUserId,
  canEditLines,
  selectedUserId,
  onSelect,
  onReassign,
  lensProjectId,
  onLensChange,
  team,
  onTeamChange,
}: OrgChartProps) {
  const stageRef = useRef<HTMLDivElement>(null);
  const nodeRefs = useRef(new Map<string, HTMLElement>());
  const { camera, cameraRef, smooth, set, fit, centerOn, zoomBy, panBy, size } = useCamera(stageRef);

  const [collapsed, setCollapsed] = useState<Set<string>>(() => new Set());
  const [activeId, setActiveId] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [searchIndex, setSearchIndex] = useState(0);
  const [drag, setDrag] = useState<DragState | null>(null);
  const [intro, setIntro] = useState(true);
  const [fullscreen, setFullscreen] = useState(false);
  const [flyTo, setFlyTo] = useState<string | null>(null);
  const suppressClick = useRef(false);
  const fitted = useRef(false);

  const tree = useMemo(() => buildOrgTree(members), [members]);
  const layout = useMemo(() => layoutOrg(tree, collapsed), [tree, collapsed]);
  const teams = useMemo(() => teamsOf(members), [members]);
  const lensProject = matrix?.projects.find((p) => p.id === lensProjectId) ?? null;
  const activeProjects = useMemo(() => (matrix?.projects ?? []).filter((p) => !p.archived), [matrix]);
  const explicitLines = members.filter((m) => m.manager_user_id && tree.byUser.get(m.user_id)?.inferred === false).length;

  // ── Highlighting ───────────────────────────────────────────────────────────
  const pathIds = useMemo(
    () => new Set(selectedUserId ? chainOf(tree, selectedUserId) : []),
    [tree, selectedUserId],
  );
  const isDim = useCallback(
    (userId: string) => {
      const member = tree.byUser.get(userId)?.member;
      if (!member) return false;
      if (lensProject && !lensProject.roles[userId]) return true;
      if (team && member.team !== team) return true;
      return false;
    },
    [tree, lensProject, team],
  );
  const dragBlocked = useMemo(
    () => (drag?.active ? new Set([drag.userId, ...descendantsOf(tree, drag.userId)]) : null),
    [drag?.active, drag?.userId, tree],
  );

  // ── Stage height: fill the window below wherever the stage starts ─────────
  const [stageTop, setStageTop] = useState(300);
  useLayoutEffect(() => {
    const measure = () => {
      const top = stageRef.current?.getBoundingClientRect().top;
      if (top !== undefined) setStageTop(Math.max(0, top + window.scrollY));
    };
    measure();
    window.addEventListener("resize", measure);
    return () => window.removeEventListener("resize", measure);
  }, []);

  /** The opening view: the whole chart when it's readable at that size, otherwise
   * the top of the chart at a readable zoom - the way people read an org chart. */
  const overview = useCallback(
    (animate: boolean) => {
      const { w, h } = size();
      const pad = 56;
      const fitK = Math.min((w - pad * 2) / layout.width, (h - pad * 2) / layout.height, 1);
      if (fitK >= 0.72) {
        fit({ x: 0, y: 0, w: layout.width, h: layout.height }, animate, 1);
        return;
      }
      const k = Math.min(1, Math.max(0.72, (w - pad * 2) / layout.width));
      const root = layout.byId.get(ROOT_ID);
      const centerX = root ? root.x + root.w / 2 : layout.width / 2;
      set({ k, x: w / 2 - centerX * k, y: pad + 16 }, animate);
    },
    [fit, set, size, layout],
  );

  useLayoutEffect(() => {
    if (fitted.current || layout.nodes.length === 0) return;
    fitted.current = true;
    overview(false);
  }, [overview, layout]);

  useEffect(() => {
    const timer = window.setTimeout(() => setIntro(false), 1900);
    return () => window.clearTimeout(timer);
  }, []);

  useEffect(() => {
    const onChange = () => {
      setFullscreen(document.fullscreenElement === stageRef.current);
      requestAnimationFrame(() => fit({ x: 0, y: 0, w: layout.width, h: layout.height }, true, 1));
    };
    document.addEventListener("fullscreenchange", onChange);
    return () => document.removeEventListener("fullscreenchange", onChange);
  }, [fit, layout.width, layout.height]);

  useEffect(() => {
    if (!flyTo) return;
    const node = layout.byId.get(flyTo);
    if (!node) return;
    centerOn({ x: node.x + node.w / 2, y: node.y + node.h / 2 }, Math.max(cameraRef.current.k, 0.95));
    nodeRefs.current.get(flyTo)?.focus({ preventScroll: true });
    setFlyTo(null);
  }, [flyTo, layout, centerOn, cameraRef]);

  /** Show `userId` - opening any collapsed manager above them - and glide to them. */
  const reveal = useCallback(
    (userId: string) => {
      const above = new Set(chainOf(tree, userId).slice(1));
      setCollapsed((current) => {
        if (![...above].some((id) => current.has(id))) return current;
        return new Set([...current].filter((id) => !above.has(id)));
      });
      setActiveId(userId);
      setFlyTo(userId);
    },
    [tree],
  );

  // Opening someone from elsewhere (the People list, a ?person= link) brings them in view.
  const lastSelected = useRef<string | null>(null);
  useEffect(() => {
    if (selectedUserId && selectedUserId !== lastSelected.current && tree.byUser.has(selectedUserId)) {
      reveal(selectedUserId);
    }
    lastSelected.current = selectedUserId;
  }, [selectedUserId, reveal, tree]);

  // ── Wheel: pan, and ctrl/⌘ (or a trackpad pinch) to zoom ───────────────────
  useEffect(() => {
    const stage = stageRef.current;
    if (!stage) return;
    const onWheel = (event: WheelEvent) => {
      if ((event.target as HTMLElement).closest(".org-ui")) return;
      event.preventDefault();
      const rect = stage.getBoundingClientRect();
      if (event.ctrlKey || event.metaKey) {
        const unit = event.deltaMode === 1 ? 32 : 1;
        zoomBy(Math.exp(-event.deltaY * unit * 0.0022), event.clientX - rect.left, event.clientY - rect.top);
      } else {
        panBy(-event.deltaX, -event.deltaY);
      }
    };
    stage.addEventListener("wheel", onWheel, { passive: false });
    return () => stage.removeEventListener("wheel", onWheel);
  }, [zoomBy, panBy]);

  // ── Background pan and two-finger pinch ───────────────────────────────────
  const pointers = useRef(new Map<number, { x: number; y: number }>());
  const pinch = useRef<{ distance: number } | null>(null);

  function onStagePointerDown(event: ReactPointerEvent<HTMLDivElement>) {
    const target = event.target as HTMLElement;
    if (target.closest(".org-node, .org-ui, .org-toggle")) return;
    stageRef.current?.setPointerCapture(event.pointerId);
    pointers.current.set(event.pointerId, { x: event.clientX, y: event.clientY });
    if (pointers.current.size === 2) {
      const [a, b] = [...pointers.current.values()];
      pinch.current = { distance: Math.hypot(a.x - b.x, a.y - b.y) };
    }
  }

  function onStagePointerMove(event: ReactPointerEvent<HTMLDivElement>) {
    const previous = pointers.current.get(event.pointerId);
    if (!previous) return;
    const next = { x: event.clientX, y: event.clientY };
    pointers.current.set(event.pointerId, next);
    if (pointers.current.size === 2 && pinch.current) {
      const [a, b] = [...pointers.current.values()];
      const distance = Math.hypot(a.x - b.x, a.y - b.y);
      const rect = stageRef.current!.getBoundingClientRect();
      zoomBy(distance / pinch.current.distance, (a.x + b.x) / 2 - rect.left, (a.y + b.y) / 2 - rect.top);
      pinch.current = { distance };
      return;
    }
    panBy(next.x - previous.x, next.y - previous.y);
  }

  function onStagePointerUp(event: ReactPointerEvent<HTMLDivElement>) {
    pointers.current.delete(event.pointerId);
    if (pointers.current.size < 2) pinch.current = null;
  }

  // ── Drag a card onto someone to set who they report to ────────────────────
  const dropTargetAt = useCallback(
    (clientX: number, clientY: number, userId: string): { id: string | null; valid: boolean } => {
      const el = document.elementFromPoint(clientX, clientY)?.closest<HTMLElement>("[data-org-id]");
      const id = el?.dataset.orgId ?? null;
      if (!id) return { id: null, valid: false };
      const person = tree.byUser.get(userId);
      const currentManager = person && !person.inferred ? person.parentId : null;
      const blocked = new Set([userId, ...descendantsOf(tree, userId)]);
      if (blocked.has(id)) return { id, valid: false };
      if (id === ROOT_ID) return { id, valid: currentManager !== null };
      return { id, valid: id !== currentManager };
    },
    [tree],
  );

  function onCardPointerDown(event: ReactPointerEvent<HTMLElement>, member: MemberOut) {
    if (!canEditLines || member.role === "owner" || event.button !== 0) return;
    setDrag({
      userId: member.user_id,
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      x: event.clientX,
      y: event.clientY,
      active: false,
      targetId: null,
      valid: false,
    });
  }

  const dragRef = useRef(drag);
  dragRef.current = drag;
  const dragging = drag !== null;
  // A layout effect, so the listeners are in place before the browser can deliver the
  // pointerup of a quick click.
  useLayoutEffect(() => {
    if (!dragging) return;
    let frame = 0;
    let edge = { dx: 0, dy: 0 };
    const tick = () => {
      if (edge.dx || edge.dy) panBy(edge.dx, edge.dy);
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    const onMove = (event: PointerEvent) => {
      const current = dragRef.current;
      if (!current || event.pointerId !== current.pointerId) return;
      if (event.pointerType === "mouse" && event.buttons === 0) {
        setDrag(null); // the button came up somewhere we didn't hear about
        return;
      }
      const moved = Math.hypot(event.clientX - current.startX, event.clientY - current.startY);
      const active = current.active || moved > DRAG_THRESHOLD;
      const target = active ? dropTargetAt(event.clientX, event.clientY, current.userId) : { id: null, valid: false };
      const rect = stageRef.current?.getBoundingClientRect();
      edge = { dx: 0, dy: 0 };
      if (active && rect) {
        if (event.clientX < rect.left + EDGE_PAN_ZONE) edge.dx = 9;
        else if (event.clientX > rect.right - EDGE_PAN_ZONE) edge.dx = -9;
        if (event.clientY < rect.top + EDGE_PAN_ZONE) edge.dy = 9;
        else if (event.clientY > rect.bottom - EDGE_PAN_ZONE) edge.dy = -9;
      }
      setDrag({ ...current, x: event.clientX, y: event.clientY, active, targetId: target.id, valid: target.valid });
    };
    const onUp = (event: PointerEvent) => {
      const current = dragRef.current;
      if (!current || event.pointerId !== current.pointerId) return;
      if (current.active) {
        suppressClick.current = true;
        window.setTimeout(() => (suppressClick.current = false), 0);
        if (current.valid && current.targetId) {
          onReassign(current.userId, current.targetId === ROOT_ID ? null : current.targetId);
        }
      }
      setDrag(null);
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setDrag(null);
    };
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    window.addEventListener("pointercancel", onUp);
    window.addEventListener("keydown", onKey);
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      window.removeEventListener("pointercancel", onUp);
      window.removeEventListener("keydown", onKey);
    };
  }, [dragging, dropTargetAt, onReassign, panBy]);

  // ── Keyboard: move between people, zoom, fit ──────────────────────────────
  const visiblePeople = layout.nodes.filter((node) => node.kind === "person");
  const focusNode = useCallback(
    (id: string | null) => {
      if (!id) return;
      setActiveId(id);
      const node = layout.byId.get(id);
      const el = nodeRefs.current.get(id);
      el?.focus({ preventScroll: true });
      if (!node) return;
      const { w, h } = size();
      const cam = cameraRef.current;
      const sx = node.x * cam.k + cam.x;
      const sy = node.y * cam.k + cam.y;
      if (sx < 24 || sy < 24 || sx + node.w * cam.k > w - 24 || sy + node.h * cam.k > h - 24) {
        centerOn({ x: node.x + node.w / 2, y: node.y + node.h / 2 });
      }
    },
    [layout, size, cameraRef, centerOn],
  );

  function neighbour(node: LayoutNode, direction: "up" | "down" | "left" | "right"): string | null {
    if (direction === "up") return node.parentId && node.parentId !== ROOT_ID ? node.parentId : null;
    if (direction === "down") return visiblePeople.find((n) => n.parentId === node.id)?.id ?? null;
    const siblings = visiblePeople.filter((n) => n.parentId === node.parentId).sort((a, b) => a.x - b.x || a.y - b.y);
    const index = siblings.findIndex((n) => n.id === node.id);
    const next = siblings[index + (direction === "right" ? 1 : -1)];
    if (next) return next.id;
    const sameDepth = visiblePeople
      .filter((n) => n.depth === node.depth && (direction === "right" ? n.x > node.x : n.x < node.x))
      .sort((a, b) => (direction === "right" ? a.x - b.x : b.x - a.x));
    return sameDepth[0]?.id ?? null;
  }

  function onWorldKeyDown(event: ReactKeyboardEvent<HTMLDivElement>) {
    if ((event.target as HTMLElement).closest("input, select, textarea")) return;
    const current = activeId ? layout.byId.get(activeId) : undefined;
    const keys: Record<string, "up" | "down" | "left" | "right"> = {
      ArrowUp: "up",
      ArrowDown: "down",
      ArrowLeft: "left",
      ArrowRight: "right",
    };
    if (keys[event.key]) {
      event.preventDefault();
      focusNode(current ? neighbour(current, keys[event.key]) ?? current.id : visiblePeople[0]?.id ?? null);
    } else if ((event.key === "Enter" || event.key === " ") && current?.person) {
      event.preventDefault();
      onSelect(current.id);
    } else if (event.key === "+" || event.key === "=") {
      zoomBy(1.2, undefined, undefined, true);
    } else if (event.key === "-") {
      zoomBy(1 / 1.2, undefined, undefined, true);
    } else if (event.key === "0") {
      fit({ x: 0, y: 0, w: layout.width, h: layout.height });
    } else if (event.key === "Escape") {
      onSelect(null);
    }
  }

  // ── Search ─────────────────────────────────────────────────────────────────
  const results = useMemo(
    () =>
      members
        .map((member) => ({ member, score: matchScore(member, query) }))
        .filter((entry): entry is { member: MemberOut; score: number } => entry.score !== null)
        .sort((a, b) => a.score - b.score || a.member.name.localeCompare(b.member.name))
        .slice(0, 6)
        .map((entry) => entry.member),
    [members, query],
  );
  function choose(member: MemberOut) {
    setQuery("");
    reveal(member.user_id);
    onSelect(member.user_id);
  }

  function toggle(userId: string) {
    setCollapsed((current) => {
      const next = new Set(current);
      if (next.has(userId)) next.delete(userId);
      else next.add(userId);
      return next;
    });
  }

  const expandAll = () => setCollapsed(new Set());
  const collapseAll = () =>
    setCollapsed(new Set(members.filter((m) => (tree.byUser.get(m.user_id)?.children.length ?? 0) > 0 && m.role !== "owner").map((m) => m.user_id)));

  function toggleFullscreen() {
    const stage = stageRef.current;
    if (!stage) return;
    if (document.fullscreenElement) void document.exitFullscreen();
    else void stage.requestFullscreen?.().catch(() => undefined);
  }

  if (members.length === 0) {
    return (
      <div className="bl-empty">
        <EmptyArt kind="people" />
        <h2>No one here yet</h2>
        <p>Invite your team and they'll appear on the chart.</p>
      </div>
    );
  }

  const stageStyle = {
    "--stage-top": `${stageTop}px`,
    "--gx": `${camera.x}px`,
    "--gy": `${camera.y}px`,
    "--gs": `${24 * camera.k}px`,
  } as CSSProperties;
  const worldStyle = {
    transform: `translate(${camera.x}px, ${camera.y}px) scale(${camera.k})`,
    width: layout.width,
    height: layout.height,
  } as CSSProperties;
  const dragMember = drag?.active ? tree.byUser.get(drag.userId)?.member : undefined;
  const dropName =
    drag?.targetId === ROOT_ID ? "no one (clear the line)" : drag?.targetId ? tree.byUser.get(drag.targetId)?.member.name : null;

  return (
    <div
      ref={stageRef}
      className={`org-stage${smooth ? " is-gliding" : ""}${intro ? " is-intro" : ""}${drag?.active ? " is-dragging" : ""}${fullscreen ? " is-fullscreen" : ""}`}
      style={stageStyle}
      onPointerDown={onStagePointerDown}
      onPointerMove={onStagePointerMove}
      onPointerUp={onStagePointerUp}
      onPointerCancel={onStagePointerUp}
    >
      <div
        className="org-world"
        style={worldStyle}
        role="tree"
        aria-label={`${workspace.name} org chart`}
        onKeyDown={onWorldKeyDown}
      >
        <svg className="org-edges" width={layout.width} height={layout.height} aria-hidden="true">
          {layout.edges.map((edge) => {
            const onPath = pathIds.has(edge.to) && (pathIds.has(edge.from) || edge.from === ROOT_ID);
            const dim = edge.to !== ROOT_ID && isDim(edge.to);
            return (
              <path
                key={edge.id}
                d={edge.d}
                className={`org-edge${edge.inferred ? " is-inferred" : ""}${onPath ? " is-path" : ""}${dim ? " is-dim" : ""}`}
                style={{ "--len": edge.length, "--d": `${Math.min(edge.depth * 120 + 60, 900)}ms` } as CSSProperties}
              />
            );
          })}
        </svg>

        {layout.nodes.map((node) => {
          const delay = { "--d": `${Math.min(node.depth * 120 + node.order * 16, 1000)}ms` };
          if (node.kind === "root") {
            const blockedTarget = drag?.active && drag.targetId === ROOT_ID;
            return (
              <div
                key={node.id}
                data-org-id={ROOT_ID}
                className={`org-node org-root${blockedTarget ? (drag?.valid ? " is-drop" : " is-nodrop") : ""}`}
                style={{ left: node.x, top: node.y, width: node.w, height: node.h, ...delay } as CSSProperties}
              >
                <span className="org-root-mark" aria-hidden="true">{workspace.name.slice(0, 1).toUpperCase()}</span>
                <span className="org-root-copy">
                  <strong>{workspace.name}</strong>
                  <small>
                    {members.length} {members.length === 1 ? "person" : "people"}
                    {activeProjects.length ? ` · ${activeProjects.length} project${activeProjects.length === 1 ? "" : "s"}` : ""}
                  </small>
                </span>
              </div>
            );
          }
          const member = node.person!.member;
          const isCollapsed = collapsed.has(member.user_id);
          const lensRole = lensProject?.roles[member.user_id];
          const dim = isDim(member.user_id);
          const isTarget = drag?.active && drag.targetId === member.user_id;
          const blocked = dragBlocked?.has(member.user_id);
          const classes = [
            "org-node",
            "org-person",
            `role-${member.role}`,
            selectedUserId === member.user_id ? "is-selected" : "",
            pathIds.has(member.user_id) && selectedUserId !== member.user_id ? "is-path" : "",
            dim ? "is-dim" : "",
            member.user_id === myUserId ? "is-me" : "",
            isTarget ? (drag?.valid ? "is-drop" : "is-nodrop") : "",
            blocked ? "is-dragged" : "",
            matches(member, query) ? "is-match" : "",
          ]
            .filter(Boolean)
            .join(" ");
          return (
            <div
              key={node.id}
              data-org-id={member.user_id}
              className={classes}
              style={{ left: node.x, top: node.y, width: node.w, height: node.h, ...delay } as CSSProperties}
            >
              <div
                ref={(el) => {
                  if (el) nodeRefs.current.set(member.user_id, el);
                  else nodeRefs.current.delete(member.user_id);
                }}
                className="org-card"
                role="treeitem"
                aria-level={node.depth}
                aria-selected={selectedUserId === member.user_id}
                aria-expanded={node.childCount > 0 ? !isCollapsed : undefined}
                aria-label={`${member.name}${member.title ? `, ${member.title}` : ""}, ${WORKSPACE_ROLE_LABEL[member.role] ?? member.role}`}
                tabIndex={(activeId ?? visiblePeople[0]?.id) === member.user_id ? 0 : -1}
                onFocus={() => setActiveId(member.user_id)}
                onPointerDown={(event) => onCardPointerDown(event, member)}
                onClick={() => {
                  if (suppressClick.current) return;
                  // Already in view - only selections made elsewhere move the camera.
                  lastSelected.current = member.user_id;
                  onSelect(member.user_id);
                }}
              >
                <span className="org-avatar">
                  <Avatar name={member.name} avatarUrl={member.avatar_url} size={40} />
                  {member.invite_pending && <i className="org-pending" title="Invited, hasn't signed in yet" />}
                </span>
                <span className="org-id">
                  <strong>
                    {member.name}
                    {member.user_id === myUserId && <em className="org-you">You</em>}
                  </strong>
                  <small className={member.title ? undefined : "is-placeholder"}>{member.title || "No title yet"}</small>
                </span>
                <span className="org-meta">
                  {lensProject ? (
                    <span className={`org-lens-role${lensRole ? ` lens-${lensRole}` : " lens-none"}`}>
                      {lensRole ? roleLabel(lensRole) : "No access"}
                    </span>
                  ) : (
                    member.team && <span className="org-team">{member.team}</span>
                  )}
                  <span className={`org-role role-${member.role}`}>{WORKSPACE_ROLE_LABEL[member.role] ?? member.role}</span>
                </span>
              </div>
              {node.childCount > 0 && (
                <button
                  type="button"
                  className={`org-toggle${isCollapsed ? " is-collapsed" : ""}`}
                  aria-label={isCollapsed ? `Show ${member.name}'s ${node.hiddenCount} reports` : `Hide ${member.name}'s reports`}
                  onClick={(event) => {
                    event.stopPropagation();
                    toggle(member.user_id);
                  }}
                >
                  {isCollapsed ? `+${node.hiddenCount}` : node.childCount}
                  <svg viewBox="0 0 12 12" aria-hidden="true">
                    <path d={isCollapsed ? "M3 4.5 6 7.5 9 4.5" : "M3 7.5 6 4.5 9 7.5"} />
                  </svg>
                </button>
              )}
            </div>
          );
        })}
      </div>

      {/* ── Overlays ─────────────────────────────────────────────────────── */}
      <div className="org-ui org-toolbar">
        <div className="org-search">
          <svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="11" cy="11" r="7" /><path d="m20 20-3.5-3.5" /></svg>
          <input
            value={query}
            onChange={(event) => {
              setQuery(event.target.value);
              setSearchIndex(0);
            }}
            onKeyDown={(event) => {
              if (event.key === "ArrowDown") {
                event.preventDefault();
                setSearchIndex((i) => Math.min(i + 1, results.length - 1));
              } else if (event.key === "ArrowUp") {
                event.preventDefault();
                setSearchIndex((i) => Math.max(i - 1, 0));
              } else if (event.key === "Enter" && results[searchIndex]) {
                event.preventDefault();
                choose(results[searchIndex]);
              } else if (event.key === "Escape") {
                setQuery("");
              }
            }}
            placeholder="Find a person, title or team"
            aria-label="Find a person on the chart"
            role="combobox"
            aria-expanded={results.length > 0}
            aria-controls="org-search-results"
            aria-activedescendant={results[searchIndex] ? `org-result-${results[searchIndex].user_id}` : undefined}
          />
          {query.trim() && (
            <div className="org-results" id="org-search-results" role="listbox">
              {results.length === 0 && <p>No one matches “{query.trim()}”.</p>}
              {results.map((member, index) => (
                <button
                  key={member.user_id}
                  id={`org-result-${member.user_id}`}
                  type="button"
                  role="option"
                  aria-selected={index === searchIndex}
                  className={index === searchIndex ? "is-active" : undefined}
                  onMouseEnter={() => setSearchIndex(index)}
                  onClick={() => choose(member)}
                >
                  <Avatar name={member.name} avatarUrl={member.avatar_url} size={24} />
                  <span>
                    <strong>{member.name}</strong>
                    <small>{[member.title, member.team].filter(Boolean).join(" · ") || member.email}</small>
                  </span>
                </button>
              ))}
            </div>
          )}
        </div>
        <label className="org-select">
          <span>Project</span>
          <select value={lensProjectId ?? ""} onChange={(event) => onLensChange(event.target.value || null)} aria-label="Highlight who can open a project">
            <option value="">Everyone</option>
            {activeProjects.map((project) => (
              <option key={project.id} value={project.id}>
                {project.name}
                {project.visibility === "private" ? " (private)" : ""}
              </option>
            ))}
          </select>
        </label>
        {teams.length > 0 && (
          <label className="org-select">
            <span>Team</span>
            <select value={team ?? ""} onChange={(event) => onTeamChange(event.target.value || null)} aria-label="Highlight a team">
              <option value="">All teams</option>
              {teams.map((name) => (
                <option key={name} value={name}>{name}</option>
              ))}
            </select>
          </label>
        )}
      </div>

      <div className="org-ui org-controls" role="toolbar" aria-label="Chart view">
        <button type="button" onClick={() => zoomBy(1 / 1.25, undefined, undefined, true)} aria-label="Zoom out" disabled={camera.k <= MIN_ZOOM + 0.001}>
          <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12h14" /></svg>
        </button>
        <span className="org-zoom" aria-live="polite">{Math.round(camera.k * 100)}%</span>
        <button type="button" onClick={() => zoomBy(1.25, undefined, undefined, true)} aria-label="Zoom in" disabled={camera.k >= MAX_ZOOM - 0.001}>
          <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12h14M12 5v14" /></svg>
        </button>
        <i className="org-sep" aria-hidden="true" />
        <button type="button" onClick={() => fit({ x: 0, y: 0, w: layout.width, h: layout.height })} aria-label="Fit the whole chart" title="Fit the whole chart (0)">
          <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 8V5a1 1 0 0 1 1-1h3M16 4h3a1 1 0 0 1 1 1v3M20 16v3a1 1 0 0 1-1 1h-3M8 20H5a1 1 0 0 1-1-1v-3" /><rect x="9" y="9" width="6" height="6" rx="1" /></svg>
        </button>
        {myUserId && tree.byUser.has(myUserId) && (
          <button type="button" onClick={() => reveal(myUserId)} aria-label="Find me on the chart" title="Find me">
            <svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="3" /><path d="M12 2v4M12 18v4M2 12h4M18 12h4" /></svg>
          </button>
        )}
        <button type="button" onClick={collapsed.size ? expandAll : collapseAll} aria-label={collapsed.size ? "Expand everyone" : "Collapse teams"} title={collapsed.size ? "Expand all" : "Collapse all"}>
          <svg viewBox="0 0 24 24" aria-hidden="true">
            {collapsed.size ? <path d="M7 10l5-5 5 5M7 14l5 5 5-5" /> : <path d="M7 5l5 5 5-5M7 19l5-5 5 5" />}
          </svg>
        </button>
        <button type="button" onClick={toggleFullscreen} aria-label={fullscreen ? "Exit full screen" : "Full screen"} title={fullscreen ? "Exit full screen" : "Full screen"}>
          <svg viewBox="0 0 24 24" aria-hidden="true">
            {fullscreen ? <path d="M4 14h6v6M20 10h-6V4M14 10l7-7M3 21l7-7" /> : <path d="M14 4h6v6M10 20H4v-6M20 4l-7 7M4 20l7-7" />}
          </svg>
        </button>
      </div>

      <div className="org-ui org-legend">
        {lensProject ? (
          <>
            <strong>{lensProject.name}</strong>
            <span>{lensProject.visibility === "private" ? "Private project" : `Everyone gets ${roleLabel(lensProject.default_role).toLowerCase()}`}</span>
            <ul>
              {(["manager", "editor", "commenter", "viewer"] as const).map((role) => (
                <li key={role}><i className={`lens-${role}`} />{roleLabel(role)}</li>
              ))}
              <li><i className="lens-none" />No access</li>
            </ul>
          </>
        ) : (
          <>
            <ul>
              <li><i className="line-solid" />Reports to</li>
              <li><i className="line-dashed" />No manager set</li>
            </ul>
            <span>
              {explicitLines} of {Math.max(members.length - 1, 0)} reporting lines set
              {canEditLines ? " · drag a card onto someone to change it" : ""}
            </span>
          </>
        )}
      </div>

      <MiniMap
        layout={layout}
        camera={camera}
        stageSize={size}
        isDim={isDim}
        selectedUserId={selectedUserId}
        onNavigate={(point) => centerOn(point, undefined, false)}
      />

      {dragMember && drag && (
        <div className={`org-ghost${drag.valid ? " is-valid" : ""}`} style={{ left: drag.x, top: drag.y } as CSSProperties} aria-hidden="true">
          <Avatar name={dragMember.name} avatarUrl={dragMember.avatar_url} size={24} />
          <span>
            <strong>{dragMember.name}</strong>
            <small>{dropName ? (drag.valid ? `Reports to ${dropName}` : "Can't report there") : "Drop on their manager"}</small>
          </span>
        </div>
      )}
    </div>
  );
}
