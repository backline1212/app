import type { CommentStatus } from "../../../board/api";
import { STATUS_META, STATUS_ORDER } from "./types";

export interface StatusChipsProps {
  activeStatus: CommentStatus | null;
  statusCounts: Record<CommentStatus, number>;
  filteredCount: number;
  totalCount: number;
  onSelectAll: () => void;
  onStatusChipClick: (status: CommentStatus) => void;
}

export function StatusChips({
  activeStatus,
  statusCounts,
  filteredCount,
  totalCount,
  onSelectAll,
  onStatusChipClick,
}: StatusChipsProps) {
  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold">
          Comments ({filteredCount}
          {filteredCount !== totalCount ? ` of ${totalCount}` : ""})
        </h3>
        {/* Every status already shows when none is picked, so there's nothing to "select
            all" until one is. */}
        {activeStatus && (
          <button type="button" onClick={onSelectAll} className="bl-text-link">
            Show all statuses
          </button>
        )}
      </div>

      <div className="bl-status-grid" role="group" aria-label="Filter by status">
        {STATUS_ORDER.map((status) => {
          const meta = STATUS_META[status];
          const isActive = activeStatus === status;
          return (
            <button
              key={status}
              type="button"
              onClick={() => onStatusChipClick(status)}
              aria-pressed={isActive}
              className="bl-status-chip"
            >
              <span>
                <span className="bl-status-dot" style={{ background: meta.color }} />
                {meta.label}
              </span>
              <span>{statusCounts[status]}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
