import { Link } from "react-router-dom";
import { WORKFLOW_STATUSES as STATUSES, STATUS_LABELS } from "../../../lib/workflow";
import type { MemberOut } from "../../workspaces/api";
import { CONNECTION_DOT, CONNECTION_LABEL, type Filters } from "./types";

interface BoardHeaderProps {
  connectionStatus: string;
  view: "kanban" | "list";
  setView: (next: "kanban" | "list") => void;
  filters: Filters;
  setFilter: (key: keyof Filters, value: string) => void;
  members: MemberOut[] | undefined;
  pageUrls: string[];
  reviewerCountByUrl: Map<string, number>;
  workspaceSlug: string;
  projectId: string;
  projectName: string | undefined;
}

export function BoardHeader({
  connectionStatus,
  view,
  setView,
  filters,
  setFilter,
  members,
  pageUrls,
  reviewerCountByUrl,
  workspaceSlug,
  projectId,
  projectName,
}: BoardHeaderProps) {
  return (
    <>
      <div className="bl-board-head">
        <div>
          <Link className="bl-quiet bl-back-link" to={`/w/${workspaceSlug}/p/${projectId}`}>
            ← Back to {projectName || "project"}
          </Link>
          <p className="bl-eyebrow">Project workflow</p>
          <div className="bl-board-title-row">
            <h1>Board</h1>
            <span className="bl-connection-state">
            <span
              className={`bl-connection-dot ${CONNECTION_DOT[connectionStatus]}`}
              aria-hidden="true"
            />
            {CONNECTION_LABEL[connectionStatus]}
          </span>
          </div>
          <p>Review, assign, and move every comment through a clear delivery workflow.</p>
        </div>
        <div className="bl-segment" aria-label="Board layout">
          <button
            type="button"
            onClick={() => setView("kanban")}
            aria-pressed={view === "kanban"}
          >
            Kanban
          </button>
          <button
            type="button"
            onClick={() => setView("list")}
            aria-pressed={view === "list"}
          >
            List
          </button>
        </div>
      </div>

      <div className="bl-board-filterbar" aria-label="Board filters">
        <select
          value={filters.status}
          onChange={(e) => setFilter("status", e.target.value)}
          aria-label="Filter by status"
          className="bl-select"
        >
          <option value="">All statuses</option>
          {STATUSES.map((status) => (
            <option key={status} value={status}>
              {STATUS_LABELS[status]}
            </option>
          ))}
        </select>
        <select
          value={filters.layer}
          onChange={(e) => setFilter("layer", e.target.value)}
          aria-label="Filter by layer"
          className="bl-select"
        >
          <option value="">All layers</option>
          <option value="client">Client visible</option>
          <option value="team">Team only</option>
        </select>
        <select
          value={filters.assignee}
          onChange={(e) => setFilter("assignee", e.target.value)}
          aria-label="Filter by assignee"
          className="bl-select"
        >
          <option value="">All assignees</option>
          {(members ?? []).map((member) => (
            <option key={member.id} value={member.user_id}>
              {member.name}
            </option>
          ))}
        </select>
        <select
          value={filters.device}
          onChange={(e) => setFilter("device", e.target.value)}
          aria-label="Filter by device"
          className="bl-select"
        >
          <option value="">All devices</option>
          <option value="desktop">Desktop</option>
          <option value="mobile">Mobile</option>
          <option value="tablet">Tablet</option>
        </select>
        <select
          value={filters.page}
          onChange={(e) => setFilter("page", e.target.value)}
          aria-label="Filter by page"
          className="bl-select"
        >
          <option value="">All pages</option>
          {pageUrls.map((url) => {
            const reviewerCount = reviewerCountByUrl.get(url) ?? 0;
            return (
              <option key={url} value={url}>
                {url}
                {reviewerCount > 0 ? ` (${reviewerCount} reviewing)` : ""}
              </option>
            );
          })}
        </select>
      </div>
    </>
  );
}
