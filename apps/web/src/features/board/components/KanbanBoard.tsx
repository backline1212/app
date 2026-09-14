import { LayerBadge, RecoveryBadge } from "@backline/ui";
import type { UseMutationResult } from "@tanstack/react-query";

import { WORKFLOW_STATUSES as STATUSES, STATUS_COLORS, STATUS_LABELS } from "../../../lib/workflow";
import type {
  CreateAsanaTaskResult,
  CreateClickUpTaskResult,
  CreateJiraIssueResult,
  CreateTrelloCardResult,
  IntegrationOut,
} from "../../integrations/api";
import type { CommentOut, CommentStatus } from "../api";
import { commentContext } from "./types";

interface KanbanBoardProps {
  filtered: CommentOut[];
  memberName: (userId: string | null) => string | null;
  repliesByParent: Map<string, CommentOut[]>;
  setOpenThreadId: (id: string | null) => void;
  updateMutation: UseMutationResult<
    CommentOut,
    Error,
    { commentId: string; patch: { status?: CommentStatus; assignee_id?: string | null } }
  >;
  taskLinks: Record<string, string>;
  clickupIntegration: IntegrationOut | undefined;
  trelloIntegration: IntegrationOut | undefined;
  jiraIntegration: IntegrationOut | undefined;
  asanaIntegration: IntegrationOut | undefined;
  createClickUpTaskMutation: UseMutationResult<CreateClickUpTaskResult, Error, string>;
  createTrelloCardMutation: UseMutationResult<CreateTrelloCardResult, Error, string>;
  createJiraIssueMutation: UseMutationResult<CreateJiraIssueResult, Error, string>;
  createAsanaTaskMutation: UseMutationResult<CreateAsanaTaskResult, Error, string>;
}

export function KanbanBoard({
  filtered,
  memberName,
  repliesByParent,
  setOpenThreadId,
  updateMutation,
  taskLinks,
  clickupIntegration,
  trelloIntegration,
  jiraIntegration,
  asanaIntegration,
  createClickUpTaskMutation,
  createTrelloCardMutation,
  createJiraIssueMutation,
  createAsanaTaskMutation,
}: KanbanBoardProps) {
  return (
    <div className="bl-kanban-grid">
      {STATUSES.map((status) => (
        <section key={status} className="bl-kanban-column">
          <header className="bl-kanban-column-head">
            <i style={{ background: STATUS_COLORS[status] }} aria-hidden="true" />
            <h2>{STATUS_LABELS[status]}</h2>
            <span>{filtered.filter((c) => c.status === status).length}</span>
          </header>
          <div className="bl-kanban-stack">
            {filtered
              .filter((comment) => comment.status === status)
              .map((comment) => (
                <article
                  key={comment.id}
                  className="bl-kanban-card"
                >
                  {comment.screenshot_url && (
                    <img
                      src={comment.screenshot_url}
                      alt=""
                      className="bl-kanban-shot"
                    />
                  )}
                  <p className="bl-kanban-copy">{comment.body}</p>
                  <div className="bl-chip-row">
                    <LayerBadge layer={comment.layer} />
                    <RecoveryBadge status={comment.recovery_status} />
                  </div>
                  <div className="bl-kanban-meta">
                    <span>{memberName(comment.assignee_id) ?? "Unassigned"}</span>
                    <span>{commentContext(comment).device_type ?? ""}</span>
                  </div>
                  <button
                    type="button"
                    onClick={() => setOpenThreadId(comment.id)}
                    className="bl-text-link"
                  >
                    {(repliesByParent.get(comment.id)?.length ?? 0) > 0
                      ? `View thread (${repliesByParent.get(comment.id)?.length})`
                      : "Reply"}
                  </button>
                  <select
                    value={comment.status}
                    onChange={(e) =>
                      updateMutation.mutate({
                        commentId: comment.id,
                        patch: { status: e.target.value as CommentStatus },
                      })
                    }
                    aria-label="Change comment status"
                    className="bl-select bl-kanban-status"
                  >
                    {STATUSES.map((s) => (
                      <option key={s} value={s}>
                        {STATUS_LABELS[s]}
                      </option>
                    ))}
                  </select>
                  {taskLinks[comment.id] ? (
                    <a
                      href={taskLinks[comment.id]}
                      target="_blank"
                      rel="noreferrer"
                      className="bl-text-link"
                    >
                      View linked task
                    </a>
                  ) : (
                    <div className="bl-kanban-integrations">
                      {clickupIntegration && (
                        <button
                          onClick={() => createClickUpTaskMutation.mutate(comment.id)}
                          disabled={createClickUpTaskMutation.isPending}
                          className="bl-text-link muted"
                        >
                          Send to ClickUp
                        </button>
                      )}
                      {trelloIntegration && (
                        <button
                          onClick={() => createTrelloCardMutation.mutate(comment.id)}
                          disabled={createTrelloCardMutation.isPending}
                          className="bl-text-link muted"
                        >
                          Send to Trello
                        </button>
                      )}
                      {jiraIntegration && (
                        <button
                          onClick={() => createJiraIssueMutation.mutate(comment.id)}
                          disabled={createJiraIssueMutation.isPending}
                          className="bl-text-link muted"
                        >
                          Send to Jira
                        </button>
                      )}
                      {asanaIntegration && (
                        <button
                          onClick={() => createAsanaTaskMutation.mutate(comment.id)}
                          disabled={createAsanaTaskMutation.isPending}
                          className="bl-text-link muted"
                        >
                          Send to Asana
                        </button>
                      )}
                    </div>
                  )}
                </article>
              ))}
            {filtered.filter((comment) => comment.status === status).length === 0 && (
              <p className="bl-kanban-empty">No comments</p>
            )}
          </div>
        </section>
      ))}
    </div>
  );
}
