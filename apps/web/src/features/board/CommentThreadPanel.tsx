import { LayerBadge, RecoveryBadge } from "@backline/ui";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { useParams } from "react-router-dom";

import type { Schemas } from "@backline/types";
import { Dialog } from "../../components/Dialog";
import { PaperclipIcon } from "../../components/icons";
import { patchProjectComment, upsertProjectComment } from "../../lib/comment-cache";
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
import { summarizeThread, suggestReply } from "../ai/api";

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
  const { workspaceSlug } = useParams();
  const [body, setBody] = useState("");
  const [layer, setLayer] = useState<CommentLayer>("client");
  const [attachments, setAttachments] = useState<Schemas["AttachmentIn"][]>([]);
  const [mentionedUserIds, setMentionedUserIds] = useState<string[]>([]);
  const [isUploading, setIsUploading] = useState(false);
  const [summary, setSummary] = useState<string | null>(null);
  const [suggestedReplies, setSuggestedReplies] = useState<string[]>([]);
  const [isSummarizing, setIsSummarizing] = useState(false);
  const [isSuggesting, setIsSuggesting] = useState(false);
  const queryClient = useQueryClient();

  // We need the workspace ID to list members. We can get it from the workspace object if available.
  const workspaceQuery = useQuery({
    queryKey: qk.workspaces(),
    queryFn: async () => {
      const ws = await workspaceApi.listWorkspaces();
      return ws.find((w) => w.slug === workspaceSlug);
    },
    enabled: !!workspaceSlug,
  });

  const membersQuery = useQuery({
    queryKey: qk.members(workspaceQuery.data?.id),
    queryFn: () => workspaceApi.listMembers(workspaceQuery.data!.id),
    enabled: !!workspaceQuery.data?.id,
  });
  const members = membersQuery.data ?? [];

  const replyMutation = useMutation({
    mutationFn: () =>
      boardApi.createReply(comment.id, body.trim(), layer, attachments, mentionedUserIds),
    onSuccess: (created) => {
      setBody("");
      setAttachments([]);
      setMentionedUserIds([]);
      // The board's own comment.created WS handler (BoardPage's upsertComment) will
      // also receive this via the broadcast this create triggers server-side, but that
      // path is fire-and-forget over the socket - upserting here too means the reply
      // the author themselves just posted appears immediately, not after a round trip.
      // Upsert by id, not a blind append: if the WS event already landed first, this
      // would otherwise add a second, duplicate copy of the same reply.
      upsertProjectComment(queryClient, projectId, created);
    },
  });

  const updateMutation = useMutation({
    mutationFn: (patch: Schemas["CommentUpdate"]) => boardApi.updateComment(comment.id, patch),
    onSuccess: (updated) => {
      patchProjectComment(queryClient, projectId, updated.id, updated);
    },
  });

  async function handleFileChange(event: React.ChangeEvent<HTMLInputElement>) {
    const files = event.target.files;
    if (!files || files.length === 0) return;
    setIsUploading(true);
    try {
      const newAttachments: Schemas["AttachmentIn"][] = [];
      for (let i = 0; i < files.length; i++) {
        const file = files[i];
        const uploadInfo = await boardApi.createUpload(projectId, file.type, file.size);
        await fetch(uploadInfo.upload_url, {
          method: "PUT",
          body: file,
          headers: { "Content-Type": file.type },
        });
        newAttachments.push({
          key: uploadInfo.key,
          filename: file.name,
          content_type: file.type,
        });
      }
      setAttachments((prev) => [...prev, ...newAttachments]);
    } catch (err) {
      console.error("Failed to upload attachment", err);
    } finally {
      setIsUploading(false);
    }
  }

  function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (!body.trim()) return;
    replyMutation.mutate();
  }

  async function handleSummarize() {
    if (!workspaceQuery.data?.id) return;
    setIsSummarizing(true);
    try {
      const res = await summarizeThread(workspaceQuery.data.id, projectId, comment.id);
      setSummary(res.summary);
    } catch (err) {
      console.error(err);
      setSummary("Failed to generate summary.");
    } finally {
      setIsSummarizing(false);
    }
  }

  async function handleSuggestReply() {
    if (!workspaceQuery.data?.id) return;
    setIsSuggesting(true);
    try {
      const res = await suggestReply(workspaceQuery.data.id, projectId, comment.id);
      setSuggestedReplies(res.suggestions);
    } catch (err) {
      console.error(err);
    } finally {
      setIsSuggesting(false);
    }
  }

  const closed = isClosed(comment.status);
  const due = dueMeta(comment.due_at, closed);
  const orphaned = comment.recovery_status !== "ok";

  return (
    <Dialog title="Thread" onClose={onClose}>
      <div className="bl-form">
        <div className="bl-chip-row">
          <LayerBadge layer={comment.layer} />
          {orphaned && <RecoveryBadge status={comment.recovery_status} />}
        </div>

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

        {updateMutation.isError && (
          <p role="alert" className="bl-error">
            Could not save that change.
          </p>
        )}

        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <h2 className="bl-group-title">Conversation</h2>
          <button type="button" className="bl-quiet" onClick={handleSummarize} disabled={isSummarizing}>
            {isSummarizing ? "Summarizing..." : "✨ Summarize"}
          </button>
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

        <form onSubmit={handleSubmit} className="bl-form bl-flush">
          <label>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              Reply
              <button type="button" className="bl-quiet" onClick={handleSuggestReply} disabled={isSuggesting}>
                {isSuggesting ? "Suggesting..." : "✨ Suggest Replies"}
              </button>
            </div>
            <MentionsInput
              value={body}
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
                  onClick={() => setBody(reply)}
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
              value={layer}
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
              <input type="file" multiple onChange={handleFileChange} className="hidden" disabled={isUploading} />
            </label>
            <button className="bl-button" disabled={replyMutation.isPending || !body.trim()}>
              {replyMutation.isPending ? "Posting…" : "Post reply"}
            </button>
          </div>
          {replyMutation.isError && (
            <p role="alert" className="bl-error">
              Could not post your reply.
            </p>
          )}
        </form>
      </div>
    </Dialog>
  );
}
