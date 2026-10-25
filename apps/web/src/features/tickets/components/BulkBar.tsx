import type { Schemas } from "@backline/types";
import { useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { ApiError } from "../../../lib/api-client";
import { invalidateTicketsAndDashboard } from "../../../lib/query-keys";
import { ticketRef } from "../../../lib/ticket-ref";
import { STATUS_LABELS, WORKFLOW_STATUSES } from "../../../lib/workflow";
import { updateComment } from "../../board/api";
import { PRIORITY_META } from "../../projects/panel/comments/types";
import type { MemberOut } from "../../workspaces/api";
import type * as api from "../api";

type Patch = Schemas["CommentUpdate"];
type Change = { ticket: Pick<api.Ticket, "id" | "ticket_number">; patch: Patch; revision: number };

/** The values a patch is about to replace, so the change can be undone. */
function previousValues(ticket: api.Ticket, patch: Patch): Patch {
  const before: Patch = {};
  if (patch.status !== undefined) before.status = ticket.status as Patch["status"];
  if (patch.priority !== undefined) before.priority = (ticket.priority ?? "medium") as Patch["priority"];
  if (patch.assignee_ids !== undefined) before.assignee_ids = ticket.assignee_ids ?? [];
  return before;
}

/** One ticket after another; each refusal is reported for that ticket alone. */
async function applyChanges(changes: Change[], onProgress: (done: number) => void) {
  const failures: string[] = [];
  const failedIds: string[] = [];
  const saved: { id: string; revision: number }[] = [];
  for (const [index, change] of changes.entries()) {
    try {
      const result = await updateComment(change.ticket.id, change.patch, change.revision);
      saved.push({ id: change.ticket.id, revision: result.revision ?? 0 });
    } catch (error) {
      failedIds.push(change.ticket.id);
      const reason = error instanceof ApiError && error.status === 409
        ? "changed by someone else; reload and try again"
        : error instanceof Error ? error.message : "could not be updated";
      failures.push(`${ticketRef(change.ticket)} ${reason}`);
    }
    onProgress(index + 1);
  }
  return { failures, failedIds, saved };
}

/**
 * Triage for several tickets at once. Each change is the same per-ticket update the
 * row controls make (permission, revision and notification checks included), sent
 * one after another so a conflict or refusal is reported for that ticket alone.
 */
export function BulkBar({
  workspaceId,
  selected,
  members,
  onClear,
  onDone,
}: {
  workspaceId: string;
  selected: api.Ticket[];
  members: MemberOut[];
  onClear: () => void;
  onDone: (result: BulkResult) => void;
}) {
  const cache = useQueryClient();
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  const busy = progress !== null;

  async function apply(patch: Patch) {
    if (busy || selected.length === 0) return;
    const targets = [...selected];
    setProgress({ done: 0, total: targets.length });
    const { failures, failedIds, saved } = await applyChanges(
      targets.map((ticket) => ({ ticket, patch, revision: ticket.revision ?? 0 })),
      (done) => setProgress({ done, total: targets.length }),
    );
    setProgress(null);
    await invalidateTicketsAndDashboard(cache, workspaceId).catch(() => undefined);
    const reverts = saved.map(({ id, revision }) => {
      const ticket = targets.find((t) => t.id === id)!;
      return { ticket, patch: previousValues(ticket, patch), revision };
    });
    onDone({ updated: saved.length, failures, failedIds, reverts });
  }

  function onSelect(event: React.ChangeEvent<HTMLSelectElement>, toPatch: (value: string) => Patch) {
    const value = event.target.value;
    event.target.value = "";
    if (value) void apply(toPatch(value));
  }

  return (
    <div className="bl-bulk-bar" role="region" aria-label="Bulk actions">
      <strong>{selected.length} selected</strong>
      <label>
        <span className="sr-only">Set status for the selected tickets</span>
        <select disabled={busy} defaultValue="" onChange={(e) => onSelect(e, (status) => ({ status: status as Patch["status"] }))}>
          <option value="">Set status…</option>
          {WORKFLOW_STATUSES.map((status) => <option key={status} value={status}>{STATUS_LABELS[status]}</option>)}
        </select>
      </label>
      <label>
        <span className="sr-only">Set priority for the selected tickets</span>
        <select disabled={busy} defaultValue="" onChange={(e) => onSelect(e, (priority) => ({ priority: priority as Patch["priority"] }))}>
          <option value="">Set priority…</option>
          {Object.entries(PRIORITY_META).map(([value, meta]) => <option key={value} value={value}>{meta.label}</option>)}
        </select>
      </label>
      <label>
        <span className="sr-only">Assign the selected tickets</span>
        <select disabled={busy} defaultValue="" onChange={(e) => onSelect(e, (userId) => ({ assignee_ids: userId === "none" ? [] : [userId] }))}>
          <option value="">Assign to…</option>
          <option value="none">Nobody (unassign)</option>
          {members.map((member) => <option key={member.user_id} value={member.user_id}>{member.name || member.email}</option>)}
        </select>
      </label>
      <button type="button" className="bl-quiet" disabled={busy} onClick={onClear}>Clear selection</button>
      <span className="bl-bulk-status" role="status" aria-live="polite">
        {progress ? `Updating ${progress.done} of ${progress.total}…` : ""}
      </span>
    </div>
  );
}

export interface BulkResult {
  updated: number;
  failures: string[];
  failedIds: string[];
  /** Puts back what this change replaced, ticket by ticket. */
  reverts: Change[];
  undone?: boolean;
}

/** What the last bulk change did; tickets that weren't changed stay selected. */
export function BulkResultNote({ workspaceId, result, onDismiss, onUndone }: {
  workspaceId: string;
  result: BulkResult;
  onDismiss: () => void;
  onUndone: (result: BulkResult) => void;
}) {
  const cache = useQueryClient();
  const [undoing, setUndoing] = useState(false);
  async function undo() {
    if (undoing) return;
    setUndoing(true);
    const { failures, failedIds, saved } = await applyChanges(result.reverts, () => undefined);
    await invalidateTicketsAndDashboard(cache, workspaceId).catch(() => undefined);
    setUndoing(false);
    onUndone({ updated: saved.length, failures, failedIds, reverts: [], undone: true });
  }
  return (
    <div className="bl-bulk-result" role="status">
      <span>{result.updated} {result.updated === 1 ? "ticket" : "tickets"} {result.undone ? "put back" : "updated"}{result.failures.length ? ` · ${result.failures.length} not changed${result.undone ? "" : " (still selected)"}` : ""}</span>
      {result.failures.length > 0 && (
        <ul>
          {result.failures.slice(0, 5).map((failure) => <li key={failure}>{failure}</li>)}
          {result.failures.length > 5 && <li>…and {result.failures.length - 5} more</li>}
        </ul>
      )}
      {result.reverts.length > 0 && <button type="button" className="bl-quiet" disabled={undoing} onClick={() => void undo()}>{undoing ? "Undoing…" : "Undo"}</button>}
      <button type="button" className="bl-quiet" disabled={undoing} onClick={onDismiss}>Dismiss</button>
    </div>
  );
}
