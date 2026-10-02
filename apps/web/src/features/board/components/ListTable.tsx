import { LayerBadge, RecoveryBadge, StatusBadge } from "@backline/ui";

import { WORKFLOW_STATUSES as STATUSES, STATUS_LABELS } from "../../../lib/workflow";
import type { CommentOut, CommentStatus } from "../api";

interface ListTableProps {
  /** TDR-0056: bulk status changes are for editors and managers. */
  canEdit?: boolean;
  filtered: CommentOut[];
  selected: Set<string>;
  setSelected: (next: Set<string>) => void;
  toggleSelected: (id: string) => void;
  memberName: (userId: string | null) => string | null;
  repliesByParent: Map<string, CommentOut[]>;
  setOpenThreadId: (id: string | null) => void;
  bulkUpdateMutation: {
    mutate: (status: CommentStatus) => void;
  };
}

export function ListTable({
  filtered,
  selected,
  setSelected,
  toggleSelected,
  memberName,
  repliesByParent,
  setOpenThreadId,
  bulkUpdateMutation,
  canEdit = true,
}: ListTableProps) {
  return (
    <div className="bl-board-list">
      {canEdit && selected.size > 0 && (
        <div className="bl-board-bulkbar">
          <span>{selected.size} selected</span>
          <select
            onChange={(e) => {
              if (e.target.value) bulkUpdateMutation.mutate(e.target.value as CommentStatus);
              e.target.value = "";
            }}
            aria-label="Change status for selected comments"
            className="bl-select"
          >
            <option value="">Change status to...</option>
            {STATUSES.map((s) => (
              <option key={s} value={s}>
                {STATUS_LABELS[s]}
              </option>
            ))}
          </select>
        </div>
      )}
      <div className="bl-table-wrap">
      <table className="bl-table">
        <thead>
          <tr>
            <th className="bl-board-check">
              <input
                type="checkbox"
                checked={selected.size > 0 && selected.size === filtered.length}
                onChange={(e) =>
                  setSelected(e.target.checked ? new Set(filtered.map((c) => c.id)) : new Set())
                }
                aria-label="Select all comments"
              />
            </th>
            <th>Comment</th>
            <th>Layer</th>
            <th>Status</th>
            <th>Assignee</th>
            <th>Anchor</th>
          </tr>
        </thead>
        <tbody>
          {filtered.map((comment) => (
            <tr key={comment.id}>
              <td className="bl-board-check">
                <input
                  type="checkbox"
                  checked={selected.has(comment.id)}
                  onChange={() => toggleSelected(comment.id)}
                  aria-label={`Select comment: ${comment.body.slice(0, 60)}`}
                />
              </td>
              <td>
                <button
                  onClick={() => setOpenThreadId(comment.id)}
                  className="bl-board-comment-link"
                >
                  {comment.body}
                  {(repliesByParent.get(comment.id)?.length ?? 0) > 0 && (
                    <span>
                      ({repliesByParent.get(comment.id)?.length})
                    </span>
                  )}
                </button>
              </td>
              <td>
                <LayerBadge layer={comment.layer} />
              </td>
              <td>
                <StatusBadge status={comment.status} />
              </td>
              <td>{memberName(comment.assignee_id) ?? "Unassigned"}</td>
              <td>
                <RecoveryBadge status={comment.recovery_status} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      </div>
    </div>
  );
}
