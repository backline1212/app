import { LayerBadge, RecoveryBadge } from "@backline/ui";
import { roleLabel } from "../../lib/project-roles";
import { useProjectRole } from "../projects/use-project";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useRef, useState } from "react";
import { useParams } from "react-router-dom";

import type { Schemas } from "@backline/types";
import { Dialog } from "../../components/Dialog";
import { PaperclipIcon } from "../../components/icons";
import { patchProjectComment } from "../../lib/comment-cache";
import { renderWithMentions } from "../../lib/mentions";
import { qk } from "../../lib/query-keys";
import { isClosed, STATUS_LABELS, WORKFLOW_STATUSES } from "../../lib/workflow";
import { MentionsInput } from "../comments/MentionsInput";
import { COMMENT_TAGS, PRIORITY_META, PRIORITY_ORDER, dueMeta } from "../projects/panel/comments/types";
import { DatePicker } from "../tickets/components/DatePicker";
import { PeoplePicker } from "../tickets/components/PeoplePicker";
import * as workspaceApi from "../workspaces/api";
import * as boardApi from "./api";
import type { CommentLayer, CommentOut } from "./api";
import { aiErrorMessage, summarizeThread, suggestReply } from "../ai/api";
import { usePreparedReply } from "../comments/use-prepared-reply";
import { useReviewDraftGuard } from "../comments/use-review-draft-guard";
import { uploadReplyFiles } from "../comments/reply-uploads";

function formatTime(iso: string): string {
  return new Date(iso).toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function ThreadMessage({ comment }: { comment: CommentOut }) {
  return (
    <article className="bl-message">
      <small>
        {comment.author_name} · {comment.author_type === "guest" ? "Guest" : "Member"} ·{" "}
        {formatTime(comment.created_at)}
      </small>
      <p>{renderWithMentions(comment.body)}</p>
      {comment.screenshot_url && (
        <a href={comment.screenshot_url} target="_blank" rel="noreferrer">
          <img className="bl-screenshot" src={comment.screenshot_url} alt="Captured review context" />
        </a>
      )}
      {comment.attachments.length > 0 && (
        <div className="bl-chip-row" style={{ marginTop: 7 }}>
          {comment.attachments.map((a) => (
            <a key={a.url} className="bl-chip" href={a.url} target="_blank" rel="noreferrer">
              {a.filename} ↗
            </a>
          ))}
        </div>
      )}
    </article>
  );
}

interface CommentThreadPanelProps {
  comment: CommentOut;
  replies: CommentOut[];
  projectId: string;
  onClose: () => void;
}

// A full thread view (16-Dashboard.md's "Thread view"): reply list, a layer-aware
// composer, and the same status/priority/tags/assignee/due-date/waiting-on controls
// TicketDetail.tsx already uses for the same underlying comment record - so a comment
// edited from the workspace ticket board and one edited from here never drift into two
// different sets of fields or two different visual languages.
export function CommentThreadPanel({ comment, replies, projectId, onClose }: CommentThreadPanelProps) {
  // TDR-0056: commenters reply, editors and managers also triage.
  const { canComment, canEdit, role } = useProjectRole(projectId);
  const { workspaceSlug } = useParams();
  const [body, setBody] = useState("");
  const [layer, setLayer] = useState<CommentLayer>(comment.layer);
  const [attachments, setAttachments] = useState<Schemas["AttachmentIn"][]>([]);
  const [mentionedUserIds, setMentionedUserIds] = useState<string[]>([]);
  const [isUploading, setIsUploading] = useState(false);
  const uploading = useRef(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [summary, setSummary] = useState<string | null>(null);
  const [suggestedReplies, setSuggestedReplies] = useState<string[]>([]);
  const [isSummarizing, setIsSummarizing] = useState(false);
  const [isSuggesting, setIsSuggesting] = useState(false);
  const [suggestError, setSuggestError] = useState<string | null>(null);
  const queryClient = useQueryClient();

  // We need the workspace ID to list members. We can get it from the workspace object if available.
  const workspaceQuery = useQuery({
    queryKey: qk.workspaces(),
    // Same cache entry as useWorkspaceContext, so it must hold the full list; `select`
    // narrows it for this component without writing the single workspace back.
    queryFn: workspaceApi.listWorkspaces,
    select: (ws) => ws.find((w) => w.slug === workspaceSlug),
    enabled: !!workspaceSlug,
  });

  const membersQuery = useQuery({
    queryKey: qk.members(workspaceQuery.data?.id),
    queryFn: () => workspaceApi.listMembers(workspaceQuery.data!.id),
    enabled: !!workspaceQuery.data?.id,
  });
  const members = membersQuery.data ?? [];

  const replyMutation = usePreparedReply({
    commentId: comment.id, projectId,
    draft: () => ({ body, layer: comment.layer === "team" ? "team" : layer, attachments, mentioned_user_ids: mentionedUserIds }),
    onSaved: () => {
      setBody("");
      setAttachments([]);
      setMentionedUserIds([]);
      // The board's own comment.created WS handler (BoardPage's upsertComment) will
      // also receive this via the broadcast this create triggers server-side, but that
      // path is fire-and-forget over the socket - upserting here too means the reply
      // the author themselves just posted appears immediately, not after a round trip.
      // Upsert by id, not a blind append: if the WS event already landed first, this
      // would otherwise add a second, duplicate copy of the same reply.
      // A summary/suggestions generated before this reply describe a thread state that
      // no longer exists - leaving them up would read as if they still apply to the
      // (now longer) thread.
      setSummary(null);
      setSuggestedReplies([]);
      setSuggestError(null);
    },
  });
  const guard = useReviewDraftGuard({
    dirty: Boolean(body.trim() || attachments.length || suggestedReplies.length), pending: replyMutation.isPending || isUploading || isSuggesting,
    unconfirmed: replyMutation.locked,
    discard: () => { replyMutation.reset(); setBody(""); setAttachments([]); setMentionedUserIds([]); setSuggestedReplies([]); },
  });

  const updateMutation = useMutation({
    mutationFn: (patch: Schemas["CommentUpdate"]) => boardApi.updateComment(comment.id, patch, comment.revision ?? 0),
    onSuccess: (updated) => {
      patchProjectComment(queryClient, projectId, updated.id, updated);
    },
    onError: () => { void queryClient.invalidateQueries({ queryKey: qk.projectComments(projectId) }); },
  });

  async function handleFileChange(event: React.ChangeEvent<HTMLInputElement>) {
    const files = event.target.files;
    if (!files || files.length === 0 || uploading.current || replyMutation.isFrozen()) return;
    uploading.current = true;
    setIsUploading(true);
    try {
      setUploadError(await uploadReplyFiles(projectId, Array.from(files), 10 - attachments.length, value => setAttachments(current => [...current, value])));
    } finally {
      uploading.current = false;
      setIsUploading(false);
      event.target.value = "";
    }
  }

  function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    if ((!body.trim() && !replyMutation.locked) || uploading.current || isSuggesting) return;
    replyMutation.mutate();
  }

  async function handleSummarize() {
    if (!workspaceQuery.data?.id) return;
    setIsSummarizing(true);
    try {
      const res = await summarizeThread(workspaceQuery.data.id, projectId, comment.id);
      setSummary(res.summary);
    } catch (err) {
      setSummary(aiErrorMessage(err, "Failed to generate summary."));
    } finally {
      setIsSummarizing(false);
    }
  }

  async function handleSuggestReply() {
    if (!workspaceQuery.data?.id) return;
    setIsSuggesting(true);
    setSuggestError(null);
    try {
      const res = await suggestReply(workspaceQuery.data.id, projectId, comment.id);
      setSuggestedReplies(res.suggestions);
    } catch (err) {
      setSuggestError(aiErrorMessage(err, "Could not suggest replies right now."));
    } finally {
      setIsSuggesting(false);
    }
  }

  const closed = isClosed(comment.status);
  const due = dueMeta(comment.due_at, closed);
  const orphaned = comment.recovery_status !== "ok";

  return (
    <Dialog title="Thread" onClose={() => guard.requestLeave(onClose)}>
      {guard.dialog}
      <div className="bl-form">
        {updateMutation.error && <p role="alert" className="bl-error">{updateMutation.error.message} Review the current thread before trying again.</p>}
        <div className="bl-chip-row">
          <LayerBadge layer={comment.layer} />
          {orphaned && <RecoveryBadge status={comment.recovery_status} />}
        </div>

        {!canEdit && role && (
          <p className="bl-cd-readonly">You're a {roleLabel(role).toLowerCase()} on this project. Editors and managers change these.</p>
        )}
        <fieldset className="bl-thread-fields" disabled={!canEdit}>
        <div className="bl-fields">
          <label>
            Status
            <select
              className="bl-input"
              value={comment.status}
              onChange={(e) => {
                const status = e.target.value as CommentOut["status"];
                updateMutation.mutate({
                  status,
                  ...(isClosed(status) ? { waiting_on_ids: [], waiting_on_client: false } : {}),
                });
              }}
            >
              {WORKFLOW_STATUSES.map((status) => (
                <option key={status} value={status}>
                  {STATUS_LABELS[status]}
                </option>
              ))}
            </select>
          </label>
          <label>
            Priority
            <select
              className="bl-input"
              value={comment.priority}
              onChange={(e) => updateMutation.mutate({ priority: e.target.value as Schemas["CommentUpdate"]["priority"] })}
            >
              {PRIORITY_ORDER.map((priority) => (
                <option key={priority} value={priority}>
                  {PRIORITY_META[priority].label}
                </option>
              ))}
            </select>
          </label>
          <label>
            Due date
            <DatePicker value={comment.due_at} onChange={(d) => updateMutation.mutate({ due_at: d })} />
          </label>
        </div>
        {due && (
          <span className={`bl-due-chip ${due.tone === "late" ? "is-late" : due.tone === "soon" ? "is-soon" : ""}`} style={{ alignSelf: "flex-start" }}>
            {due.text}
          </span>
        )}

        <fieldset>
          <legend>Tags</legend>
          <div className="bl-chip-row">
            {COMMENT_TAGS.map((tag) => {
              const active = comment.tags?.includes(tag) ?? false;
              return (
                <label className="bl-chip" key={tag}>
                  <input
                    type="checkbox"
                    checked={active}
                    onChange={() => {
                      const tags = new Set(comment.tags ?? []);
                      if (active) tags.delete(tag);
                      else tags.add(tag);
                      updateMutation.mutate({ tags: Array.from(tags) });
                    }}
                  />
                  {tag}
                </label>
              );
            })}
          </div>
        </fieldset>

        <PeoplePicker
          label="Assignees"
          members={members}
          selected={comment.assignee_ids ?? []}
          onChange={(assignee_ids) => updateMutation.mutate({ assignee_ids })}
        />

        {!closed && (
          <>
            <PeoplePicker
              label="Waiting for a reply from"
              members={members}
              selected={comment.waiting_on_ids ?? []}
              onChange={(waiting_on_ids) => updateMutation.mutate({ waiting_on_ids })}
            />
            <label className="bl-check">
              <input
                type="checkbox"
                checked={comment.waiting_on_client}
                onChange={(e) => updateMutation.mutate({ waiting_on_client: e.target.checked })}
              />
              Waiting on client
            </label>
          </>
        )}

        </fieldset>

        {updateMutation.isError && (
          <p role="alert" className="bl-error">
            Could not save that change.
          </p>
        )}

        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <h2 className="bl-group-title">Conversation</h2>
          {canComment && (
            <button type="button" className="bl-quiet" onClick={handleSummarize} disabled={isSummarizing}>
              {isSummarizing ? "Summarizing..." : "✨ Summarize"}
            </button>
          )}
        </div>

        {summary && (
          <div className="bl-attention" style={{ padding: "10px", marginBottom: "16px", borderRadius: "4px" }}>
            <strong>✨ AI Summary:</strong>
            <p style={{ marginTop: "4px" }}>{summary}</p>
          </div>
        )}

        <ThreadMessage comment={comment} />
        {replies.map((reply) => (
          <ThreadMessage key={reply.id} comment={reply} />
        ))}

        {!canComment ? (
          <div className="bl-form"><p className="bl-inline-note">You can read this thread but not reply. Ask a project manager for commenter access.</p>{(body.trim() || replyMutation.locked) && <><textarea className="bl-input" aria-label="Retained reply draft" value={body} readOnly /><button type="button" className="bl-quiet" onClick={() => void replyMutation.copyText()}>Copy reply text</button>{replyMutation.copyStatus && <p role="status">{replyMutation.copyStatus}</p>}</>}</div>
        ) : (
        <form onSubmit={handleSubmit} className="bl-form bl-flush">
          <label>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              Reply
              <button type="button" className="bl-quiet" onClick={handleSuggestReply} disabled={isSuggesting || replyMutation.locked || replyMutation.isPending}>
                {isSuggesting ? "Suggesting..." : "✨ Suggest Replies"}
              </button>
            </div>
            {suggestError && (
              <p role="alert" className="bl-error" style={{ marginTop: "-4px" }}>
                {suggestError}
              </p>
            )}
            <MentionsInput
              value={body}
              readOnly={replyMutation.locked || replyMutation.isPending}
              maxLength={10_000}
              onChange={(event) => setBody(event.target.value)}
              onMentionedIdsChange={setMentionedUserIds}
              rows={3}
              required
              className="bl-input"
            />
          </label>

          {suggestedReplies.length > 0 && (
            <div className="bl-chip-row" style={{ marginTop: "-8px", marginBottom: "8px" }}>
              {suggestedReplies.map((reply, idx) => (
                <button
                  key={idx}
                  type="button"
                  className="bl-chip bl-quiet"
                  onClick={() => { setBody(reply); setMentionedUserIds([]); }}
                  disabled={replyMutation.locked || replyMutation.isPending}
                >
                  {reply}
                </button>
              ))}
            </div>
          )}

          {attachments.length > 0 && (
            <div className="bl-chip-row">
              {attachments.map((att) => (
                <span key={att.key} className="bl-chip">
                  {att.filename}
                  <button
                    type="button"
                    onClick={() => setAttachments((prev) => prev.filter((a) => a.key !== att.key))}
                    aria-label={`Remove ${att.filename}`}
                    disabled={isUploading || replyMutation.locked || replyMutation.isPending}
                    style={{ background: "none", border: 0, color: "inherit", cursor: "pointer" }}
                  >
                    ×
                  </button>
                </span>
              ))}
            </div>
          )}

          <div className="bl-form-actions">
            <select
              value={comment.layer === "team" ? "team" : layer}
              disabled={comment.layer === "team" || replyMutation.locked || replyMutation.isPending}
              onChange={(event) => setLayer(event.target.value as CommentLayer)}
              aria-label="Reply visibility"
              className="bl-select"
              style={{ marginRight: "auto" }}
            >
              <option value="client">Client visible</option>
              <option value="team">Team only</option>
            </select>
            <label className="bl-quiet" style={{ display: "inline-flex", alignItems: "center", gap: 6, cursor: "pointer" }}>
              {isUploading ? (
                "Uploading…"
              ) : (
                <>
                  <PaperclipIcon width="14" height="14" /> Attach
                </>
              )}
              <input type="file" multiple onChange={handleFileChange} className="hidden" disabled={isUploading || replyMutation.locked || replyMutation.isPending} />
            </label>
            <button className="bl-button" disabled={replyMutation.isPending || isUploading || isSuggesting || !body.trim()}>
              {replyMutation.isPending ? "Posting…" : replyMutation.locked ? "Retry reply save" : "Post reply"}
            </button>
          </div>
          {replyMutation.isError && (
            <p role="alert" className="bl-error">
              {replyMutation.error?.message} {replyMutation.locked && "Saving is unconfirmed. Retry sends the original reply; check Backline before posting it again."}
            </p>
          )}
          {uploadError && <p role="alert" className="bl-error">{uploadError}</p>}
          {(body.trim() || replyMutation.locked) && <button type="button" className="bl-quiet" onClick={() => void replyMutation.copyText()}>Copy reply text</button>}
          {replyMutation.copyStatus && <p role="status">{replyMutation.copyStatus}</p>}
          {replyMutation.completionWarning && <p role="status">{replyMutation.completionWarning}</p>}
        </form>
        )}
      </div>
    </Dialog>
  );
}
