import type { Schemas } from "@backline/types";
import { useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { BulkBar, BulkMenu } from "../../../components/BulkBar";
import { ConfirmDialog } from "../../../components/ConfirmDialog";
import { useToast } from "../../../components/Toast";
import { invalidateTicketsAndDashboard, qk } from "../../../lib/query-keys";
import { bulkSummary, plural, runBulk } from "../../../lib/run-bulk";
import { ticketRef } from "../../../lib/ticket-ref";
import type { Selection } from "../../../lib/use-selection";
import { STATUS_COLORS, STATUS_LABELS, WORKFLOW_STATUSES, isClosed } from "../../../lib/workflow";
import { deleteThread, updateComment } from "../../board/api";
import { PRIORITY_META } from "../../projects/panel/comments/types";
import type { MemberOut } from "../../workspaces/api";
import type * as api from "../api";

const PRIORITIES = ["high", "medium", "low"] as const;

// Bulk actions for the Tickets list and table (TDR-0058). Each change is the same
// per-ticket PATCH/DELETE the row and the detail already use, so permissions, history
// and notifications behave exactly as if the tickets were changed one by one.
export function TicketBulkActions({ selection, tickets, members, workspaceId }: {
  selection: Selection;
  tickets: api.Ticket[];
  members: MemberOut[];
  workspaceId: string;
}) {
  const cache = useQueryClient();
  const { toast } = useToast();
  const [busy, setBusy] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const chosen = tickets.filter((t) => selection.selectedIds.includes(t.id));

  async function refresh(rows: api.Ticket[]) {
    await invalidateTicketsAndDashboard(cache, workspaceId);
    await Promise.all([...new Set(rows.map((t) => t.project_id))].map((id) => cache.invalidateQueries({ queryKey: qk.projectComments(id) })));
  }

  async function apply(label: string, pastTense: string, task: (t: api.Ticket) => Promise<unknown>) {
    const rows = chosen;
    setBusy(`${label} ${plural(rows.length, "ticket")}…`);
    const result = await runBulk(rows, task);
    await refresh(rows);
    setBusy(null);
    const { message, variant } = bulkSummary(result, "ticket", pastTense);
    toast(message, variant);
    // Keep the ones that failed selected, so they can be retried or opened.
    if (result.failed.length === 0) selection.clear();
  }

  function patchAll(label: string, pastTense: string, patch: (t: api.Ticket) => Schemas["CommentUpdate"]) {
    return apply(label, pastTense, (t) => updateComment(t.id, patch(t)));
  }

  const people = [
    ...members.map((m) => ({ id: m.user_id, label: m.name || m.email })),
    { id: "", label: "Unassign" },
  ];

  return (
    <>
      <BulkBar count={selection.count} noun="tickets" onClear={selection.clear} busy={busy}>
        <BulkMenu
          label="Status"
          options={WORKFLOW_STATUSES.map((s) => ({ id: s, label: STATUS_LABELS[s], dot: STATUS_COLORS[s] }))}
          onPick={(status) => {
            const next = status as api.Ticket["status"];
            // Closing a ticket also stops it waiting on anyone, as the detail does.
            void patchAll("Updating", "updated", () => ({ status: next, ...(isClosed(next) ? { waiting_on_ids: [], waiting_on_client: false } : {}) }));
          }}
        />
        <BulkMenu
          label="Priority"
          options={PRIORITIES.map((p) => ({ id: p, label: PRIORITY_META[p].label, dot: PRIORITY_META[p].color }))}
          onPick={(priority) => void patchAll("Updating", "updated", () => ({ priority: priority as (typeof PRIORITIES)[number] }))}
        />
        <BulkMenu
          label="Assign"
          options={people}
          onPick={(userId) => void patchAll(userId ? "Assigning" : "Unassigning", userId ? "assigned" : "unassigned", () => ({ assignee_ids: userId ? [userId] : [] }))}
        />
        <button type="button" className="bl-bulkbar-btn danger" onClick={() => setConfirmDelete(true)}>
          Delete
        </button>
      </BulkBar>
      {confirmDelete && (
        <ConfirmDialog
          title={`Delete ${plural(chosen.length, "ticket")}?`}
          message={
            <>
              <ul className="bl-bulk-list">
                {chosen.slice(0, 5).map((t) => (
                  <li key={t.id}>
                    <span className="bl-tid">{ticketRef(t)}</span>
                    {t.body}
                  </li>
                ))}
                {chosen.length > 5 && <li className="is-more">and {chosen.length - 5} more</li>}
              </ul>
              <p>Each ticket and every reply on it is removed for everyone. This can't be undone.</p>
            </>
          }
          confirmLabel={`Delete ${plural(chosen.length, "ticket")}`}
          destructive
          onCancel={() => setConfirmDelete(false)}
          onConfirm={() => {
            setConfirmDelete(false);
            void apply("Deleting", "deleted", (t) => deleteThread(t.id));
          }}
        />
      )}
    </>
  );
}
