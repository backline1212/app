import { Avatar } from "@backline/ui";
import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { FilterIcon, SortIcon } from "../../projects/panel/icons";
import { PersonIcon } from "../../../components/icons";
import { useFloatingPosition } from "../../../lib/use-floating-position";
import { useOnClickOutside } from "../../../lib/use-click-outside";
import type { MemberOut } from "../../workspaces/api";

// Mirrors the root HTML's SORT BY / GROUP BY / SHOW WORK FOR popovers (tsortPop,
// tgrpPop, whoPop), reusing the exact popover/menu-row visual language the
// CommentsTab side panel already established (FilterSortBar.tsx) rather than
// inventing a second one - only the option lists are ticket-specific.
const SORT_OPTIONS: { id: string; label: string }[] = [
  { id: "newest", label: "Newest" },
  { id: "oldest", label: "Oldest" },
  { id: "due", label: "Due date" },
  { id: "priority", label: "Priority" },
  { id: "status", label: "Status" },
  { id: "project", label: "Project" },
];

const GROUP_OPTIONS: { id: string; label: string }[] = [
  { id: "none", label: "No grouping" },
  { id: "status", label: "Status" },
  { id: "project", label: "Project" },
  { id: "assignee", label: "Assignee" },
  { id: "priority", label: "Priority" },
  { id: "tag", label: "Tag" },
];

function Tick() {
  return (
    <svg viewBox="0 0 16 16" width="12" height="12" fill="none" aria-hidden="true">
      <path d="M3 8.5 6.5 12 13 4" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
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
}

export function TicketToolbar({
  sort,
  onSort,
  group,
  onGroup,
  showGroup,
  members,
  assignees,
  onAssignees,
}: TicketToolbarProps) {
  const [open, setOpen] = useState<"sort" | "group" | "who" | null>(null);
  const ref = useRef<HTMLDivElement>(null);
  const sortTriggerRef = useRef<HTMLButtonElement>(null);
  const groupTriggerRef = useRef<HTMLButtonElement>(null);
  const whoTriggerRef = useRef<HTMLButtonElement>(null);
  // Only one of the three popovers is ever open at a time, so one ref covers whichever
  // is currently portaled (see the render below - each is escaped to <body> so it can't
  // be clipped/overflow the viewport the way a plain absolutely-positioned child inside
  // this toolbar's row can).
  const popoverRef = useRef<HTMLDivElement>(null);
  const activeTriggerRef = open === "sort" ? sortTriggerRef : open === "group" ? groupTriggerRef : whoTriggerRef;
  const popoverPos = useFloatingPosition(activeTriggerRef, popoverRef, open !== null);
  useOnClickOutside([ref, popoverRef], () => setOpen(null));

  useEffect(() => {
    if (!open) return;
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") setOpen(null);
    }
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [open]);

  // The dashboard ticket-list API takes a single assignee value (TicketFilters.assignee:
  // str | None), unlike the reference's in-memory multi-person filter - so this stays a
  // single pick (selecting a second person replaces the first) rather than offering a
  // multi-select the backend cannot actually honor.
  function selectAssignee(id: string) {
    onAssignees(assignees[0] === id ? [] : [id]);
  }

  const whoLabel = assignees.length === 0 ? "Anyone" : assignees[0] === "unassigned" ? "Unassigned" : (members.find((m) => m.user_id === assignees[0])?.name ?? "1 person");

  return (
    <div ref={ref} className="bl-ticket-toolbar">
      <div className="bl-comment-popover-anchor">
        <button
          ref={sortTriggerRef}
          type="button"
          className="bl-review-control"
          aria-haspopup="true"
          aria-expanded={open === "sort"}
          onClick={() => setOpen((prev) => (prev === "sort" ? null : "sort"))}
        >
          <SortIcon width={13} height={13} />
          {SORT_OPTIONS.find((o) => o.id === sort)?.label ?? "Sort"}
        </button>
        {open === "sort" && createPortal(
          <div
            ref={popoverRef}
            className="bl-comment-popover"
            role="menu"
            style={{ position: "fixed", top: popoverPos?.top ?? -9999, left: popoverPos?.left ?? -9999, visibility: popoverPos ? "visible" : "hidden" }}
          >
            <div className="bl-review-popover-label">Sort by</div>
            {SORT_OPTIONS.map((option) => (
              <button
                key={option.id}
                type="button"
                role="menuitemradio"
                aria-checked={sort === option.id}
                className="bl-review-menu-row"
                onClick={() => {
                  onSort(option.id);
                  setOpen(null);
                }}
              >
                {option.label}
                {sort === option.id && <Tick />}
              </button>
            ))}
          </div>,
          document.body
        )}
      </div>

      {showGroup && (
        <div className="bl-comment-popover-anchor">
          <button
            ref={groupTriggerRef}
            type="button"
            className="bl-review-control"
            aria-haspopup="true"
            aria-expanded={open === "group"}
            onClick={() => setOpen((prev) => (prev === "group" ? null : "group"))}
          >
            <FilterIcon width={13} height={13} />
            {GROUP_OPTIONS.find((o) => o.id === group)?.label ?? "Group"}
          </button>
          {open === "group" && createPortal(
            <div
              ref={popoverRef}
              className="bl-comment-popover"
              role="menu"
              style={{ position: "fixed", top: popoverPos?.top ?? -9999, left: popoverPos?.left ?? -9999, visibility: popoverPos ? "visible" : "hidden" }}
            >
              <div className="bl-review-popover-label">Group by</div>
              {GROUP_OPTIONS.map((option) => (
                <button
                  key={option.id}
                  type="button"
                  role="menuitemradio"
                  aria-checked={group === option.id}
                  className="bl-review-menu-row"
                  onClick={() => {
                    onGroup(option.id);
                    setOpen(null);
                  }}
                >
                  {option.label}
                  {group === option.id && <Tick />}
                </button>
              ))}
            </div>,
            document.body
          )}
        </div>
      )}

      <div className="bl-comment-popover-anchor">
        <button
          ref={whoTriggerRef}
          type="button"
          className="bl-review-control"
          aria-haspopup="true"
          aria-expanded={open === "who"}
          onClick={() => setOpen((prev) => (prev === "who" ? null : "who"))}
        >
          <PersonIcon width={13} height={13} />
          {whoLabel}
        </button>
        {open === "who" && createPortal(
          <div
            ref={popoverRef}
            className="bl-comment-popover is-wide"
            role="menu"
            style={{ position: "fixed", top: popoverPos?.top ?? -9999, left: popoverPos?.left ?? -9999, visibility: popoverPos ? "visible" : "hidden" }}
          >
            <div className="bl-review-popover-label">Show work for</div>
            <button
              type="button"
              role="menuitemradio"
              aria-checked={assignees.length === 0}
              className="bl-review-menu-row"
              onClick={() => {
                onAssignees([]);
                setOpen(null);
              }}
            >
              Anyone
              {assignees.length === 0 && <Tick />}
            </button>
            <div style={{ borderTop: "1px solid var(--line-soft)", margin: "4px 0" }} />
            {members.map((member) => (
              <button
                key={member.user_id}
                type="button"
                role="menuitemradio"
                aria-checked={assignees[0] === member.user_id}
                className="bl-review-menu-row"
                onClick={() => {
                  selectAssignee(member.user_id);
                  setOpen(null);
                }}
              >
                <span className="flex items-center gap-2">
                  <Avatar name={member.name || member.email} size={18} />
                  {member.name || member.email}
                </span>
                {assignees[0] === member.user_id && <Tick />}
              </button>
            ))}
            <div style={{ borderTop: "1px solid var(--line-soft)", margin: "4px 0" }} />
            <button
              type="button"
              role="menuitemradio"
              aria-checked={assignees[0] === "unassigned"}
              className="bl-review-menu-row"
              onClick={() => {
                selectAssignee("unassigned");
                setOpen(null);
              }}
            >
              Unassigned
              {assignees[0] === "unassigned" && <Tick />}
            </button>
          </div>,
          document.body
        )}
      </div>
    </div>
  );
}
