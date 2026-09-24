import { isClosed } from "../../../lib/workflow";
import { ticketRef } from "../../../lib/ticket-ref";
import { dueMeta } from "../../projects/panel/comments/types";
import type { MemberOut } from "../../workspaces/api";
import * as api from "../api";
import { StatusSelect } from "./StatusSelect";
import type { TicketUpdateMutation } from "./types";

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
}: {
  tickets: api.Ticket[];
  members: MemberOut[];
  update: TicketUpdateMutation;
  sort: string;
  onSort: (value: string) => void;
  onOpen: (id: string) => void;
  onFilterProject: (projectId: string) => void;
  onFilterTag: (tag: string) => void;
}) {
  return (
    <div className="bl-table-wrap bl-tickets table">
      <table className="bl-table">
        <thead>
          <tr>
            <th className="bl-col-num">ID</th>
            <th>Ticket</th>
            <SortableHeader label="Project" sortKey="project" sort={sort} onSort={onSort} />
            <SortableHeader label="Status" sortKey="status" sort={sort} onSort={onSort} />
            <SortableHeader label="Priority" sortKey="priority" sort={sort} onSort={onSort} />
            <th>Tags</th>
            <th>Assignees</th>
            <SortableHeader label="Due date" sortKey="due" sort={sort} onSort={onSort} />
          </tr>
        </thead>
        <tbody>
          {tickets.map((t) => {
            const due = dueMeta(t.due_at, isClosed(t.status));
            return (
              <tr key={t.id}>
                <td className="bl-col-num">{ticketRef(t)}</td>
                <td>
                  <button type="button" className="bl-ticket-title" onClick={() => onOpen(t.id)}>
                    {t.body}
                  </button>
                  <small>{t.is_standalone ? "Team ticket" : t.page_title}</small>
                </td>
                <td style={{ color: "var(--ink-3)" }}>
                  <button type="button" className="bl-cellf" onClick={() => onFilterProject(t.project_id)}>
                    {t.project_name}
                  </button>
                </td>
                <td>
                  <StatusSelect ticket={t} disabled={update.isPending} onChange={(status) => update.mutate({ id: t.id, patch: { status } })} />
                </td>
                <td>
                  <select
                    className="bl-select"
                    aria-label={`Priority for ${t.body.slice(0, 40)}`}
                    disabled={update.isPending}
                    value={t.priority ?? "medium"}
                    onChange={(e) => update.mutate({ id: t.id, patch: { priority: e.target.value as "high" | "medium" | "low" } })}
                  >
                    {["high", "medium", "low"].map((p) => (
                      <option key={p}>{p}</option>
                    ))}
                  </select>
                </td>
                <td>
                  <div className="bl-chip-row">
                    {t.tags?.map((tag) => (
                      <button type="button" className="bl-chip" key={tag} onClick={() => onFilterTag(tag)}>
                        {tag}
                      </button>
                    ))}
                  </div>
                </td>
                <td>
                  <button type="button" className="bl-quiet" onClick={() => onOpen(t.id)}>
                    {t.assignee_ids?.length
                      ? t.assignee_ids.map((id) => members.find((m) => m.user_id === id)?.name ?? "Former member").join(", ")
                      : "Unassigned"}
                  </button>
                </td>
                <td>
                  <input
                    type="date"
                    className="bl-date"
                    aria-label={`Due date for ${t.body.slice(0, 40)}`}
                    value={t.due_at?.slice(0, 10) ?? ""}
                    disabled={update.isPending}
                    onChange={(e) => update.mutate({ id: t.id, patch: { due_at: e.target.value ? `${e.target.value}T00:00:00Z` : null } })}
                  />
                  {due && (
                    <span className={`bl-due-chip ${due.tone === "late" ? "is-late" : due.tone === "soon" ? "is-soon" : ""}`} style={{ marginTop: 4, display: "inline-flex" }}>
                      {due.text}
                    </span>
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
