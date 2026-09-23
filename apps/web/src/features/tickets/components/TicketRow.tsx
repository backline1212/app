import { Avatar } from "@backline/ui";
import { isClosed } from "../../../lib/workflow";
import { ticketRef } from "../../../lib/ticket-ref";
import { PRIORITY_META, dueMeta } from "../../projects/panel/comments/types";
import type { MemberOut } from "../../workspaces/api";
import * as api from "../api";
import { StatusSelect } from "./StatusSelect";
import type { TicketUpdateMutation } from "./types";

function memberName(members: MemberOut[], userId: string): string {
  const member = members.find((m) => m.user_id === userId);
  return member?.name || member?.email || "Former member";
}

// The root HTML's dense .tk list row (priority bar, single-line title/subtitle,
// status, up to two tags, stacked assignee faces, due date) - kept alongside the
// existing StatusSelect and priority quick-edit so list mode loses none of the
// inline editing table mode already had (FD-AUD-034 slice instructions: don't
// silently remove an existing feature).
export function TicketRow({
  ticket,
  members,
  update,
  onOpen,
  onFilterTag,
}: {
  ticket: api.Ticket;
  members: MemberOut[];
  update: TicketUpdateMutation;
  onOpen: (id: string) => void;
  onFilterTag: (tag: string) => void;
}) {
  const priority = PRIORITY_META[ticket.priority ?? "medium"];
  const due = dueMeta(ticket.due_at, isClosed(ticket.status));
  const assigneeIds = ticket.assignee_ids?.length ? ticket.assignee_ids : [];

  return (
    <div 
      className="bl-tk" 
      role="button" 
      tabIndex={0} 
      onClick={() => onOpen(ticket.id)}
      onKeyDown={(e) => {
        // Only activate for the row itself - a bubbled Enter/Space from the
        // nested StatusSelect, priority <select>, tag chips, or the
        // "Unassigned" button would otherwise both block their own native
        // keyboard behavior (e.g. Space opening a <select>) and wrongly open
        // the ticket detail on top of it.
        if (e.target !== e.currentTarget) return;
        if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onOpen(ticket.id); }
      }}
    >
      <span className="bl-tk-prio" style={{ background: priority.color }} title={`${priority.label} priority`} />
      <div className="bl-tk-main">
        <span className="bl-ticket-title">
          <span className="bl-tid">{ticketRef(ticket)}</span>
          {ticket.body}
        </span>
        <span className="bl-tk-s">
          {ticket.project_name} · {ticket.is_standalone ? "Team ticket" : (ticket.page_path ?? ticket.page_title)}
        </span>
      </div>
      <span className="bl-tk-status" onClick={(e) => e.stopPropagation()}>
        <StatusSelect ticket={ticket} disabled={update.isPending} onChange={(status) => update.mutate({ id: ticket.id, patch: { status } })} />
      </span>
      <select
        className="bl-select bl-tk-prio-select"
        aria-label={`Priority for ${ticket.body.slice(0, 40)}`}
        disabled={update.isPending}
        value={ticket.priority ?? "medium"}
        onClick={(e) => e.stopPropagation()}
        onChange={(e) => update.mutate({ id: ticket.id, patch: { priority: e.target.value as "high" | "medium" | "low" } })}
      >
        {["high", "medium", "low"].map((p) => (
          <option key={p}>{p}</option>
        ))}
      </select>
      <div className="bl-tk-tags" onClick={(e) => e.stopPropagation()}>
        {ticket.tags?.slice(0, 2).map((tag) => (
          <button type="button" className="bl-chip" key={tag} onClick={() => onFilterTag(tag)}>
            {tag}
          </button>
        ))}
      </div>
      <span className="bl-tk-asg" title={assigneeIds.length ? `Assigned to ${assigneeIds.map((id) => memberName(members, id)).join(", ")}` : "Unassigned"} onClick={(e) => e.stopPropagation()}>
        {assigneeIds.length === 0 ? (
          <button type="button" className="bl-quiet" style={{ border: 0, background: "none", color: "var(--ink-4)", padding: "2px 4px" }} onClick={() => onOpen(ticket.id)}>
            Unassigned
          </button>
        ) : (
          assigneeIds.slice(0, 3).map((id) => (
            <span key={id}>
              <Avatar name={memberName(members, id)} size={22} />
            </span>
          ))
        )}
      </span>
      {due ? (
        <span className={`bl-due-chip bl-tk-due ${due.tone === "late" ? "is-late" : due.tone === "soon" ? "is-soon" : ""}`}>{due.text}</span>
      ) : (
        <span className="bl-tk-due bl-mono">No date</span>
      )}
    </div>
  );
}
