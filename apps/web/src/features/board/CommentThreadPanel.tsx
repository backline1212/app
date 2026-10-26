import { LayerBadge, RecoveryBadge } from "@backline/ui";
import { roleLabel } from "../../lib/project-roles";
import { useProjectRole } from "../projects/use-project";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useRef, useState } from "react";
import { Link, useParams } from "react-router-dom";

import type { Schemas } from "@backline/types";
import { Dialog } from "../../components/Dialog";
import { PaperclipIcon } from "../../components/icons";
import { ApiError } from "../../lib/api-client";
import { patchProjectComment } from "../../lib/comment-cache";
import { renderWithMentions } from "../../lib/mentions";
import { invalidateTicketsAndDashboard, qk } from "../../lib/query-keys";
import { ticketRef } from "../../lib/ticket-ref";
import { isClosed, STATUS_LABELS, WORKFLOW_STATUSES } from "../../lib/workflow";
import { MentionsInput } from "../comments/MentionsInput";
import { COMMENT_TAGS, PRIORITY_META, PRIORITY_ORDER, dueMeta } from "../projects/panel/comments/types";
import { DatePicker } from "../tickets/components/DatePicker";
import { PeoplePicker } from "../tickets/components/PeoplePicker";
import { DeleteTicketDialog, TrashIcon } from "../tickets/components/DeleteTicket";
import * as workspaceApi from "../workspaces/api";
import * as integrationsApi from "../integrations/api";
import { providerName } from "../integrations/providers";
import * as boardApi from "./api";
import type { CommentLayer, CommentOut } from "./api";
import { aiErrorMessage, summarizeThread, suggestReply } from "../ai/api";
import { usePreparedReply } from "../comments/use-prepared-reply";
import { useReviewDraftGuard } from "../comments/use-review-draft-guard";
import { uploadReplyFiles } from "../comments/reply-uploads";
import { CommentDiagnostics, MediaAttachment } from "../comments/RecordButtons";
import { FixCard } from "../comments/FixCard";
import { isMediaAttachment } from "../comments/media";

function formatTime(iso: string): string {
  return new Date(iso).toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function ThreadMessage({ comment, teamOnly = false, children, extra }: { comment: CommentOut; teamOnly?: boolean; children?: React.ReactNode; extra?: React.ReactNode }) {
  return (
    <article className="bl-message">
      <small>
        {comment.author_name} · {comment.author_type === "guest" ? "Client" : "Team"} ·{" "}
        {formatTime(comment.created_at)}
        {comment.body_edited_at ? " · edited" : ""}
        {teamOnly && <span className="bl-message-layer">Team only</span>}
      </small>
      {/* A reported fix shows its summary; the links live on the card below. */}
      {children ?? <p>{renderWithMentions(comment.fix ? comment.fix.summary : comment.body)}</p>}
      {extra}
      {comment.screenshot_url && (
        <a href={comment.screenshot_url} target="_blank" rel="noreferrer">
          <img className="bl-screenshot" src={comment.screenshot_url} alt="Captured review context" />
        </a>
      )}
      {comment.attachments.length > 0 && (
        <div className="bl-chip-row" style={{ marginTop: 7 }}>
          {comment.attachments.map((a) => isMediaAttachment(a.content_type) ? (
            <MediaAttachment key={a.url} url={a.url} filename={a.filename} contentType={a.content_type} />
          ) : (
            <a key={a.url} className="bl-chip" href={a.url} target="_blank" rel="noreferrer">
              {a.filename} ↗
            </a>
          ))}
        </div>
      )}
      {!comment.parent_id && <CommentDiagnostics context={comment.context} />}
    </article>
  );
}

interface CommentThreadPanelProps {
  comment: CommentOut;
  replies: CommentOut[];
  projectId: string;
  /** Shown as a chip where the project isn't already obvious (the Tickets page). */
  projectName?: string;
  onClose: () => void;
}

// The one ticket view (16-Dashboard.md's "Thread view"), opened from the project board,
// the workspace Tickets page, search, activity and notifications (TDR-0153): the ticket
// text (editable by editors), status/priority/tags/assignee/due-date/waiting-on fields
// that save as they change, the conversation and a layer-aware reply composer.
export function CommentThreadPanel({ comment, replies, projectId, projectName, onClose }: CommentThreadPanelProps) {
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
  const [editing, setEditing] = useState(false);
  const [draftBody, setDraftBody] = useState(comment.body);
  const [confirmDelete, setConfirmDelete] = useState(false);
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

  // Trackers the ticket can be filed in and where it already is (links are fetched on
  // their own: CommentOut also goes to guests, who never see the agency's tracker URLs).
  const workspaceId = workspaceQuery.data?.id;
  const integrationsQuery = useQuery({
    queryKey: qk.integrations(workspaceId ?? ""),
    queryFn: () => integrationsApi.listIntegrations(workspaceId!),
    enabled: !!workspaceId,
    staleTime: 60_000,
  });
  const trackers = (integrationsQuery.data ?? []).filter((item) => item.kind === "tracker" && !item.needs_destination);
  const linksKey = qk.commentIntegrationLinks(comment.id);
  const linksQuery = useQuery({ queryKey: linksKey, queryFn: () => integrationsApi.listCommentLinks(comment.id), enabled: trackers.length > 0 });
  const sendToTracker = useMutation({
    mutationFn: (integrationId: string) => integrationsApi.sendToTracker(comment.id, integrationId),
    onSuccess: (link) => {
      queryClient.setQueryData<integrationsApi.ExternalLinkOut[]>(linksKey, (current = []) =>
        current.some((item) => item.id === link.id) ? current : [...current, link],
      );
    },
  });

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
  const editDirty = editing && draftBody.trim() !== comment.body;
  const guard = useReviewDraftGuard({
    draftName: editDirty ? "ticket text and reply" : "reply",
    dirty: Boolean(body.trim() || attachments.length || suggestedReplies.length || editDirty), pending: replyMutation.isPending || isUploading || isSuggesting,
    unconfirmed: replyMutation.locked,
    discard: () => { replyMutation.reset(); setBody(""); setAttachments([]); setMentionedUserIds([]); setSuggestedReplies([]); setEditing(false); setDraftBody(comment.body); },
  });

  const updateMutation = useMutation({
    mutationFn: (patch: Schemas["CommentUpdate"]) => boardApi.updateComment(comment.id, patch, comment.revision ?? 0),
    onSuccess: (updated) => {
      patchProjectComment(queryClient, projectId, updated.id, updated);
      if (editing && updated.body === draftBody.trim()) setEditing(false);
      // The Tickets list and dashboard counts show the same fields.
      if (workspaceQuery.data?.id) void invalidateTicketsAndDashboard(queryClient, workspaceQuery.data.id);
    },
    onError: () => { void queryClient.invalidateQueries({ queryKey: qk.projectComments(projectId) }); },
  });
  const conflict = updateMutation.error instanceof ApiError && updateMutation.error.status === 409;

  function saveBody() {
    const next = draftBody.trim();
    if (!canEdit || updateMutation.isPending || !next || next.length > 10_000) return;
    if (next === comment.body) { setEditing(false); return; }
    updateMutation.mutate({ body: next });
  }

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

  const latestFixId = [...replies].reverse().find((reply) => reply.fix)?.id;
  const closed = isClosed(comment.status);
  const due = dueMeta(comment.due_at, closed);
  const orphaned = comment.recovery_status !== "ok";

  return (
    <Dialog title={`Ticket ${ticketRef(comment)}`} onClose={() => guard.requestLeave(onClose)}>
      {guard.dialog}
      <div className="bl-form">
        <div className="bl-chip-row">
          {projectName && <span className="bl-chip">{projectName}</span>}
          <LayerBadge layer={comment.layer} />
          {orphaned && <RecoveryBadge status={comment.recovery_status} />}
          {!comment.is_standalone && workspaceSlug && (
            <Link className="bl-chip" to={`/w/${workspaceSlug}/p/${projectId}?comment=${comment.id}`}>Open in review ↗</Link>
          )}
        </div>
        {trackers.length > 0 && (
          <div className="bl-chip-row" aria-label="Trackers">
            {trackers.map((tracker) => {
              const filed = linksQuery.data?.find((link) => link.integration_id === tracker.id);
              if (filed) return <a key={tracker.id} className="bl-chip" href={filed.url} target="_blank" rel="noreferrer">{providerName(tracker.type)} {filed.external_id} ↗</a>;
              if (!canEdit) return null;
              return (
                <button key={tracker.id} type="button" className="bl-chip" disabled={sendToTracker.isPending || linksQuery.isLoading} onClick={() => sendToTracker.mutate(tracker.id)}>
                  {sendToTracker.isPending && sendToTracker.variables === tracker.id ? "Sending…" : `Send to ${providerName(tracker.type)}`}
                </button>
              );
            })}
          </div>
        )}
        {sendToTracker.isError && <p role="alert" className="bl-error">{sendToTracker.error instanceof Error ? sendToTracker.error.message : "Could not send this ticket."}</p>}
        {updateMutation.error && (
          <p role="alert" className="bl-error">
            {conflict ? "Someone else changed this ticket at the same time. The latest version is shown; make your change again." : `${updateMutation.error.message} Check the ticket before trying again.`}
          </p>
        )}

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

        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <h2 className="bl-group-title">Conversation</h2>
          {canComment && (
            <button type="button" className="bl-quiet" onClick={handleSummarize} disabled={isSummarizing}>
              {isSummarizing ? "Summarizing…" : "✨ Summarize"}
            </button>
          )}
        </div>

        {summary && (
          <div className="bl-attention" style={{ padding: "10px", marginBottom: "16px", borderRadius: "4px" }}>
            <strong>✨ AI Summary:</strong>
            <p style={{ marginTop: "4px" }}>{summary}</p>
          </div>
        )}

        <ThreadMessage comment={comment}>
          {editing ? (
            <form className="bl-form bl-flush" onSubmit={(event) => { event.preventDefault(); saveBody(); }}>
              <textarea
                className="bl-input"
                aria-label="Ticket text"
                rows={4}
                required
                maxLength={10_000}
                value={draftBody}
                readOnly={updateMutation.isPending}
                onChange={(event) => setDraftBody(event.target.value)}
                autoFocus
              />
              <div className="bl-form-actions">
                <button type="button" className="bl-quiet" disabled={updateMutation.isPending} onClick={() => { setEditing(false); setDraftBody(comment.body); }}>Cancel</button>
                <button className="bl-button" disabled={updateMutation.isPending || !draftBody.trim()}>{updateMutation.isPending ? "Saving…" : "Save text"}</button>
              </div>
            </form>
          ) : (
            <div className="bl-message-body">
              <p>{renderWithMentions(comment.body)}</p>
              {canEdit && <button type="button" className="bl-quiet" onClick={() => { setDraftBody(comment.body); setEditing(true); }}>Edit</button>}
            </div>
          )}
        </ThreadMessage>
        {replies.map((reply) => (
          <ThreadMessage
            key={reply.id}
            comment={reply}
            teamOnly={comment.layer === "client" && reply.layer === "team"}
            extra={reply.fix && (
              <FixCard
                fix={reply.fix}
                busy={updateMutation.isPending}
                {...(canEdit && comment.status === "in_review" && reply.id === latestFixId ? {
                  onVerify: () => updateMutation.mutate({ status: "resolved", waiting_on_ids: [], waiting_on_client: false }),
                  onReopen: () => updateMutation.mutate({ status: "in_progress" }),
                } : {})}
              />
            )}
          />
        ))}

        {!canComment ? (
          <div className="bl-form"><p className="bl-inline-note">You can read this thread but not reply. Ask a project manager for commenter access.</p>{(body.trim() || replyMutation.locked) && <><textarea className="bl-input" aria-label="Retained reply draft" value={body} readOnly /><button type="button" className="bl-quiet" onClick={() => void replyMutation.copyText()}>Copy reply text</button>{replyMutation.copyStatus && <p role="status">{replyMutation.copyStatus}</p>}</>}</div>
        ) : (
        <form onSubmit={handleSubmit} className="bl-form bl-flush">
          <label>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              Reply
              <button type="button" className="bl-quiet" onClick={handleSuggestReply} disabled={isSuggesting || replyMutation.locked || replyMutation.isPending}>
                {isSuggesting ? "Suggesting…" : "✨ Suggest replies"}
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
        {canEdit && workspaceQuery.data && (
          <div className="bl-form-actions bl-detail-actions">
            <button type="button" className="bl-quiet bl-danger-text" disabled={updateMutation.isPending || replyMutation.isPending} onClick={() => guard.requestLeave(() => setConfirmDelete(true))}>
              <TrashIcon /> Delete ticket
            </button>
          </div>
        )}
      </div>
      {confirmDelete && workspaceQuery.data && (
        <DeleteTicketDialog
          ticket={{ id: comment.id, project_id: projectId, body: comment.body, ticket_number: comment.ticket_number }}
          workspaceId={workspaceQuery.data.id}
          onCancel={() => setConfirmDelete(false)}
          onDeleted={onClose}
        />
      )}
    </Dialog>
  );
}
