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
    const failures: string[] = [];
    const failedIds: string[] = [];
    setProgress({ done: 0, total: targets.length });
    for (const [index, ticket] of targets.entries()) {
      try {
        await updateComment(ticket.id, patch, ticket.revision ?? 0);
      } catch (error) {
        failedIds.push(ticket.id);
        const reason = error instanceof ApiError && error.status === 409
          ? "changed by someone else; reload and try again"
          : error instanceof Error ? error.message : "could not be updated";
        failures.push(`${ticketRef(ticket)} ${reason}`);
      }
      setProgress({ done: index + 1, total: targets.length });
    }
    setProgress(null);
    await invalidateTicketsAndDashboard(cache, workspaceId).catch(() => undefined);
    onDone({ updated: targets.length - failedIds.length, failures, failedIds });
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
}

/** What the last bulk change did; tickets that weren't changed stay selected. */
export function BulkResultNote({ result, onDismiss }: { result: BulkResult; onDismiss: () => void }) {
  return (
    <div className="bl-bulk-result" role="status">
      <span>{result.updated} {result.updated === 1 ? "ticket" : "tickets"} updated{result.failures.length ? ` · ${result.failures.length} not changed (still selected)` : ""}</span>
      {result.failures.length > 0 && (
        <ul>
          {result.failures.slice(0, 5).map((failure) => <li key={failure}>{failure}</li>)}
          {result.failures.length > 5 && <li>…and {result.failures.length - 5} more</li>}
        </ul>
      )}
      <button type="button" className="bl-quiet" onClick={onDismiss}>Dismiss</button>
    </div>
  );
}
