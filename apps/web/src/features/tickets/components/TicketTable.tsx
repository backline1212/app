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
  selectedIds,
  onToggle,
  onToggleAll,
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
  selectedIds: ReadonlySet<string>;
  onToggle: (id: string) => void;
  onToggleAll: (ids: string[], selected: boolean) => void;
}) {
  const selectable = tickets.filter((t) => update.canEdit(t)).map((t) => t.id);
  const allSelected = selectable.length > 0 && selectable.every((id) => selectedIds.has(id));
  const someSelected = selectable.some((id) => selectedIds.has(id));
  // No bare "table" class on the wrapper: that is Tailwind's display:table utility,
  // which made it a table box - one that ignores overflow-x, so on a phone the whole
  // page scrolled sideways instead of just the table.
  return (
    <div className="bl-table-wrap bl-tickets bl-ttable">
      <table className="bl-table">
        <thead>
          <tr>
            <th className="bl-col-select">
              {selectable.length > 0 && <input type="checkbox" aria-label="Select all tickets in this list" checked={allSelected}
                ref={(el) => { if (el) el.indeterminate = someSelected && !allSelected; }}
                onChange={(e) => onToggleAll(selectable, e.target.checked)} />}
            </th>
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
              <tr key={t.id} className={`${isClosed(t.status) ? "is-closed" : ""}${selectedIds.has(t.id) ? " is-selected" : ""}` || undefined} onClick={() => onOpen(t.id)}>
                <td className="bl-col-select" onClick={(e) => e.stopPropagation()}>
                  {update.canEdit(t) && <input type="checkbox" aria-label={`Select ticket ${ticketRef(t)}`} checked={selectedIds.has(t.id)} onChange={() => onToggle(t.id)} />}
                </td>
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
                  <StatusSelect ticket={t} disabled={update.isPending || !update.canEdit(t)} onChange={(status) => update.mutate({ id: t.id, patch: { status } })} />
                </td>
                <td>
                  <PrioritySelect ticket={t} disabled={update.isPending || !update.canEdit(t)} onChange={(priority) => update.mutate({ id: t.id, patch: { priority } })} />
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
                  <DatePicker disabled={update.isPending || !update.canEdit(t)} value={t.due_at} onChange={(value) => update.mutate({ id: t.id, patch: { due_at: value } })} triggerClassName={`bl-due bl-due-trigger ${due?.tone ?? ""}`}>
                    {due ? due.text : "Set date"}
                  </DatePicker>
                </td>
                <td className="bl-col-actions">
                  {update.canEdit(t) && <button type="button" className="bl-row-delete" disabled={update.isPending} aria-label={`Delete ticket ${ticketRef(t)}`} title="Delete ticket" onClick={(e) => { e.stopPropagation(); onDelete(t); }}>
                    <TrashIcon />
                  </button>}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
