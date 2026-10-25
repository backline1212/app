import { Avatar } from "@backline/ui";
import { isClosed } from "../../../lib/workflow";
import { ticketRef } from "../../../lib/ticket-ref";
import { reviewTicketPath } from "../../../lib/review-page-path";
import { PRIORITY_META, dueMeta } from "../../projects/panel/comments/types";
import type { MemberOut } from "../../workspaces/api";
import * as api from "../api";
import { TrashIcon } from "./DeleteTicket";
import { StatusSelect } from "./StatusSelect";
import type { TicketUpdateMutation } from "./types";

function memberName(members: MemberOut[], userId: string): string {
  const member = members.find((m) => m.user_id === userId);
  return member?.name || member?.email || "Former member";
}

// The design's dense .tk list row (priority bar, ID, single-line title/subtitle,
// status pill, up to two tags, stacked assignee faces, due date). Status stays
// editable inline through the pill; priority is edited from the table or the ticket
// detail, as in the design, where the list shows it only as the colored bar.
export function TicketRow({
  ticket,
  members,
  update,
  onOpen,
  onFilterTag,
  onDelete,
  selected,
  onToggle,
}: {
  ticket: api.Ticket;
  members: MemberOut[];
  update: TicketUpdateMutation;
  onOpen: (id: string) => void;
  onFilterTag: (tag: string) => void;
  onDelete: (ticket: api.Ticket) => void;
  selected: boolean;
  onToggle: (id: string) => void;
}) {
  const priority = PRIORITY_META[ticket.priority ?? "medium"];
  const due = dueMeta(ticket.due_at, isClosed(ticket.status));
  const assigneeIds = ticket.assignee_ids?.length ? ticket.assignee_ids : [];

  return (
    // The row is a plain container (clicking anywhere opens the ticket); the title is
    // the keyboard/screen-reader control, so the row's own selects and buttons aren't
    // nested inside another button.
    <div className={`bl-tk${isClosed(ticket.status) ? " is-closed" : ""}${selected ? " is-selected" : ""}`} onClick={() => onOpen(ticket.id)}>
      {update.canEdit(ticket) && <input type="checkbox" className="bl-tk-select" aria-label={`Select ticket ${ticketRef(ticket)}`} checked={selected}
        onClick={(e) => e.stopPropagation()} onChange={() => onToggle(ticket.id)} />}
      <span className="bl-tk-prio" style={{ background: priority.color }} title={`${priority.label} priority`} />
      <span className="bl-tid">{ticketRef(ticket)}</span>
      <div className="bl-tk-main">
        <button type="button" className="bl-ticket-title bl-tk-open" onClick={(event) => { event.stopPropagation(); onOpen(ticket.id); }}>{ticket.body}</button>
        <span className="bl-tk-s">
          {ticket.project_name} · {ticket.is_standalone && !ticket.page_path ? "Team ticket" : (reviewTicketPath(ticket.page_path) ?? ticket.page_title)}
          {ticket.is_standalone && ticket.page_path && " · not pinned"}
        </span>
      </div>
      <StatusSelect ticket={ticket} disabled={update.isPending || !update.canEdit(ticket)} onChange={(status) => update.mutate({ id: ticket.id, patch: { status } })} />
      <div className="bl-tk-tags" onClick={(e) => e.stopPropagation()}>
        {ticket.tags?.slice(0, 2).map((tag) => (
          <button type="button" className="bl-tag" key={tag} onClick={() => onFilterTag(tag)}>
            {tag}
          </button>
        ))}
      </div>
      <span className="bl-tk-asg" title={assigneeIds.length ? `Assigned to ${assigneeIds.map((id) => memberName(members, id)).join(", ")}` : "Unassigned"}>
        {assigneeIds.length === 0 ? (
          <span className="bl-tk-noasg">—</span>
        ) : (
          assigneeIds.slice(0, 3).map((id) => (
            <span key={id}>
              <Avatar name={memberName(members, id)} size={22} />
            </span>
          ))
        )}
      </span>
      <span className={`bl-due ${due?.tone ?? ""}`}>{due ? due.text : "No date"}</span>
      {update.canEdit(ticket) && <button type="button" className="bl-row-delete" disabled={update.isPending} aria-label={`Delete ticket ${ticketRef(ticket)}`} title="Delete ticket" onClick={(e) => { e.stopPropagation(); onDelete(ticket); }}>
        <TrashIcon />
      </button>}
    </div>
  );
}
