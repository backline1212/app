import { Avatar } from "@backline/ui";
import { useEffect, useRef, useState, type ReactNode, type RefObject } from "react";
import { createPortal } from "react-dom";
import { useFloatingPosition } from "../../../lib/use-floating-position";
import { useOnClickOutside } from "../../../lib/use-click-outside";
import type { MemberOut } from "../../workspaces/api";

// design/index.html's tickets toolbar: SORT BY (tsortPop), GROUP BY (tgrpPop) and the
// multi-select SHOW WORK FOR (whoPop) popovers, rebuilt to the same markup and styles.
const SORT_OPTIONS: { id: string; label: string }[] = [
  { id: "due", label: "Due date" },
  { id: "priority", label: "Priority" },
  { id: "status", label: "Status" },
  { id: "newest", label: "Newest" },
  { id: "oldest", label: "Oldest" },
  { id: "project", label: "Project" },
  { id: "assignee", label: "Assignee" },
  { id: "tag", label: "Tag" },
];

const GROUP_OPTIONS: { id: string; label: string }[] = [
  { id: "none", label: "No grouping" },
  { id: "status", label: "Status" },
  { id: "project", label: "Project" },
  { id: "assignee", label: "Assignee" },
  { id: "priority", label: "Priority" },
  { id: "tag", label: "Tag" },
];

// The design's person marks are soft pastel squares; pick one per person, stably.
const MARK_COLORS = ["#C9CFC9", "#F3D9C6", "#F1DCE0", "#C9E4F5", "#D8E9D2", "#DCD4EF", "#FBF1D6"];
function markColor(seed: string) {
  let h = 0;
  for (const ch of seed) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return MARK_COLORS[h % MARK_COLORS.length];
}
function initials(name: string) {
  return name.trim().split(/\s+/).slice(0, 2).map((p) => p[0]?.toUpperCase() ?? "").join("") || "?";
}

function Tick() {
  return (
    <span className="bl-pop-tick" aria-hidden="true">
      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4">
        <path d="M20 6L9 17l-5-5" />
      </svg>
    </span>
  );
}

function Checkbox() {
  return (
    <span className="bl-pop-cbx" aria-hidden="true">
      <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3">
        <path d="M20 6L9 17l-5-5" />
      </svg>
    </span>
  );
}

function Popover({ anchor, popRef, className, children }: { anchor: RefObject<HTMLButtonElement>; popRef: RefObject<HTMLDivElement>; className?: string; children: ReactNode }) {
  const pos = useFloatingPosition(anchor, popRef, true);
  return createPortal(
    <div ref={popRef} className={`bl-pop ${className ?? ""}`} role="menu" style={{ position: "fixed", top: pos?.top ?? -9999, left: pos?.left ?? -9999, visibility: pos ? "visible" : "hidden" }}>
      {children}
    </div>,
    document.body,
  );
}

export interface TicketToolbarProps {
  sort: string;
  onSort: (value: string) => void;
  group: string;
  onGroup: (value: string) => void;
  showGroup: boolean;
  members: MemberOut[];
  assignees: string[];
  onAssignees: (value: string[]) => void;
  /** Tickets per person (user id or "unassigned") under the current filters. */
  counts: Record<string, number>;
  /** Tickets under the current filters for anyone at all. */
  totalAny: number;
}

export function TicketToolbar({ sort, onSort, group, onGroup, showGroup, members, assignees, onAssignees, counts, totalAny }: TicketToolbarProps) {
  const [open, setOpen] = useState<"sort" | "group" | "who" | null>(null);
  const ref = useRef<HTMLDivElement>(null);
  const sortRef = useRef<HTMLButtonElement>(null);
  const groupRef = useRef<HTMLButtonElement>(null);
  const whoRef = useRef<HTMLButtonElement>(null);
  const popRef = useRef<HTMLDivElement>(null);
  useOnClickOutside([ref, popRef], () => setOpen(null));

  useEffect(() => {
    if (!open) return;
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") setOpen(null);
    }
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [open]);

  function toggle(which: "sort" | "group" | "who") {
    setOpen((prev) => (prev === which ? null : which));
  }
  function togglePerson(id: string) {
    onAssignees(assignees.includes(id) ? assignees.filter((a) => a !== id) : [...assignees, id]);
  }

  const nameOf = (id: string) => {
    const m = members.find((x) => x.user_id === id);
    return m?.name || m?.email || "Former member";
  };
  const whoLabel = assignees.length === 0 ? "Anyone" : assignees.length === 1 ? (assignees[0] === "unassigned" ? "Unassigned" : nameOf(assignees[0])) : `${assignees.length} people`;
  const faces = assignees.filter((a) => a !== "unassigned").slice(0, 3);

  return (
    <div ref={ref} className="bl-ticket-toolbar">
      <button ref={sortRef} type="button" className="bl-ghost-btn" aria-haspopup="true" aria-expanded={open === "sort"} onClick={() => toggle("sort")}>
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
          <path d="M3 6h18M7 12h10M11 18h2" />
        </svg>
        {SORT_OPTIONS.find((o) => o.id === sort)?.label ?? "Sort"}
      </button>
      {open === "sort" && (
        <Popover anchor={sortRef} popRef={popRef}>
          <div className="bl-pop-label">SORT BY</div>
          {SORT_OPTIONS.map((o) => (
            <button key={o.id} type="button" role="menuitemradio" aria-checked={sort === o.id} onClick={() => { onSort(o.id); setOpen(null); }}>
              {o.label}
              <Tick />
            </button>
          ))}
        </Popover>
      )}

      {showGroup && (
        <>
          <button ref={groupRef} type="button" className="bl-ghost-btn" aria-haspopup="true" aria-expanded={open === "group"} onClick={() => toggle("group")}>
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
              <path d="M3 5h18M3 12h18M3 19h18" />
            </svg>
            Group: {GROUP_OPTIONS.find((o) => o.id === group)?.label ?? "No grouping"}
          </button>
          {open === "group" && (
            <Popover anchor={groupRef} popRef={popRef}>
              <div className="bl-pop-label">GROUP BY</div>
              {GROUP_OPTIONS.map((o) => (
                <button key={o.id} type="button" role="menuitemradio" aria-checked={group === o.id} onClick={() => { onGroup(o.id); setOpen(null); }}>
                  {o.label}
                  <Tick />
                </button>
              ))}
            </Popover>
          )}
        </>
      )}

      <button ref={whoRef} type="button" className="bl-ghost-btn bl-who-btn" aria-haspopup="true" aria-expanded={open === "who"} onClick={() => toggle("who")}>
        {faces.length === 0 ? (
          <span className="bl-who-any" aria-hidden="true">
            <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M17 21v-2a4 4 0 00-4-4H6a4 4 0 00-4 4v2" />
              <circle cx="9.5" cy="7" r="4" />
            </svg>
          </span>
        ) : (
          <span className="bl-who-stack" aria-hidden="true">
            {faces.map((id) => (
              <Avatar key={id} name={nameOf(id)} avatarUrl={members.find((m) => m.user_id === id)?.avatar_url} size={18} />
            ))}
          </span>
        )}
        {whoLabel}
        <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
          <path d="M6 9l6 6 6-6" />
        </svg>
      </button>
      {open === "who" && (
        <Popover anchor={whoRef} popRef={popRef} className="bl-who-pop">
          <div className="bl-pop-label">SHOW WORK FOR</div>
          <button type="button" className="bl-asg-opt" role="menuitemradio" aria-checked={assignees.length === 0} onClick={() => onAssignees([])}>
            <span className="bl-pop-mk is-none">∗</span>Anyone
            <span className="bl-pop-count">{totalAny}</span>
          </button>
          <div className="bl-pop-sep" />
          {members.map((m) => {
            const name = m.name || m.email;
            return (
              <button key={m.user_id} type="button" className="bl-asg-opt" role="menuitemcheckbox" aria-checked={assignees.includes(m.user_id)} onClick={() => togglePerson(m.user_id)}>
                <Checkbox />
                {m.avatar_url ? (
                  <img className="bl-pop-mk" src={m.avatar_url} alt="" />
                ) : (
                  <span className="bl-pop-mk" style={{ background: markColor(m.user_id) }}>
                    {initials(name)}
                  </span>
                )}
                <span className="bl-pop-name">{name}</span>
                <span className="bl-pop-count">{counts[m.user_id] ?? 0}</span>
              </button>
            );
          })}
          <div className="bl-pop-sep" />
          <button type="button" className="bl-asg-opt" role="menuitemcheckbox" aria-checked={assignees.includes("unassigned")} onClick={() => togglePerson("unassigned")}>
            <Checkbox />
            <span className="bl-pop-mk is-none">—</span>Unassigned
            <span className="bl-pop-count">{counts.unassigned ?? 0}</span>
          </button>
          <div className="bl-who-foot">
            <button type="button" className="bl-who-clear" onClick={() => onAssignees([])}>
              Clear
            </button>
            <button type="button" className="bl-who-done" onClick={() => setOpen(null)}>
              Done
            </button>
          </div>
        </Popover>
      )}
    </div>
  );
}
