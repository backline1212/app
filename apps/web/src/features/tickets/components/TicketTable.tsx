import { Avatar } from "@backline/ui";
import { isClosed } from "../../../lib/workflow";
import { ticketRef } from "../../../lib/ticket-ref";
import { dueMeta } from "../../projects/panel/comments/types";
import type { MemberOut } from "../../workspaces/api";
import * as api from "../api";
import { DatePicker } from "./DatePicker";
import { TrashIcon } from "./DeleteTicket";
import { PrioritySelect, StatusSelect } from "./StatusSelect";
import type { TicketUpdateMutation } from "./types";

function memberName(members: MemberOut[], userId: string): string {
  const member = members.find((m) => m.user_id === userId);
  return member?.name || member?.email || "Former member";
}

function SortArrow() {
  return (
    <span className="bl-th-ar" aria-hidden="true">
      ▾
    </span>
  );
}

// A column header that is also the same sort control the toolbar's Sort popover
// drives (root HTML's th.srt / data-tsort) - clicking "PROJECT" and picking
// "Project" from the Sort popover land on the same state.
function SortableHeader({ label, sortKey, sort, onSort }: { label: string; sortKey: string; sort: string; onSort: (v: string) => void }) {
  return (
    <th>
      <button type="button" className="bl-th-sort" onClick={() => onSort(sortKey)}>
        {label}
        {sort === sortKey && <SortArrow />}
      </button>
    </th>
  );
}

export function TicketTable({
  tickets,
  members,
  update,
  sort,
  onSort,
  onOpen,
  onFilterProject,
  onFilterTag,
  onDelete,
}: {
  tickets: api.Ticket[];
  members: MemberOut[];
  update: TicketUpdateMutation;
  sort: string;
  onSort: (value: string) => void;
  onOpen: (id: string) => void;
  onFilterProject: (projectId: string) => void;
  onFilterTag: (tag: string) => void;
  onDelete: (ticket: api.Ticket) => void;
}) {
  return (
    <div className="bl-table-wrap bl-tickets table bl-ttable">
      <table className="bl-table">
        <thead>
          <tr>
            <th className="bl-col-num">ID</th>
            <th>Ticket</th>
            <SortableHeader label="Project" sortKey="project" sort={sort} onSort={onSort} />
            <SortableHeader label="Status" sortKey="status" sort={sort} onSort={onSort} />
            <SortableHeader label="Priority" sortKey="priority" sort={sort} onSort={onSort} />
            <th>Tags</th>
            <th>Assignee</th>
            <SortableHeader label="Due" sortKey="due" sort={sort} onSort={onSort} />
            <th className="bl-col-actions"><span className="sr-only">Actions</span></th>
          </tr>
        </thead>
        <tbody>
          {tickets.map((t) => {
            const due = dueMeta(t.due_at, isClosed(t.status));
            const assignees = t.assignee_ids ?? [];
            return (
              <tr key={t.id} className={isClosed(t.status) ? "is-closed" : undefined} onClick={() => onOpen(t.id)}>
                <td className="bl-col-num">{ticketRef(t)}</td>
                <td className="bl-col-ticket">
                  <button type="button" className="bl-ticket-title" onClick={(e) => { e.stopPropagation(); onOpen(t.id); }}>
                    {t.body}
                  </button>
                </td>
                <td className="bl-col-project">
                  <button type="button" className="bl-cellf" onClick={(e) => { e.stopPropagation(); onFilterProject(t.project_id); }}>
                    {t.project_name}
                  </button>
                </td>
                <td>
                  <StatusSelect ticket={t} disabled={update.isPending} onChange={(status) => update.mutate({ id: t.id, patch: { status } })} />
                </td>
                <td>
                  <PrioritySelect ticket={t} disabled={update.isPending} onChange={(priority) => update.mutate({ id: t.id, patch: { priority } })} />
                </td>
                <td>
                  <div className="bl-tcell-tags">
                    {t.tags?.map((tag) => (
                      <button type="button" className="bl-tag" key={tag} onClick={(e) => { e.stopPropagation(); onFilterTag(tag); }}>
                        {tag}
                      </button>
                    ))}
                  </div>
                </td>
                <td>
                  {assignees.length ? (
                    <div className="bl-tcell-tags">
                      {assignees.map((id) => {
                        const name = memberName(members, id);
                        return (
                          <span className="bl-cell-who" key={id}>
                            <Avatar name={name} size={20} />
                            {name}
                          </span>
                        );
                      })}
                    </div>
                  ) : (
                    <span className="bl-cell-none">Unassigned</span>
                  )}
                </td>
                <td onClick={(e) => e.stopPropagation()}>
                  <DatePicker value={t.due_at} onChange={(value) => update.mutate({ id: t.id, patch: { due_at: value } })} triggerClassName={`bl-due bl-due-trigger ${due?.tone ?? ""}`}>
                    {due ? due.text : "Set date"}
                  </DatePicker>
                </td>
                <td className="bl-col-actions">
                  <button type="button" className="bl-row-delete" aria-label={`Delete ticket ${ticketRef(t)}`} title="Delete ticket" onClick={(e) => { e.stopPropagation(); onDelete(t); }}>
                    <TrashIcon />
                  </button>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
