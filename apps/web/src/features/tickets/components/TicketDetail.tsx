import type { Schemas } from "@backline/types";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useImperativeHandle, useRef, useState, type MutableRefObject } from "react";
import { Link } from "react-router-dom";
import { Dialog } from "../../../components/Dialog";
import { ApiError } from "../../../lib/api-client";
import { invalidateTicketsAndDashboard, qk } from "../../../lib/query-keys";
import { isClosed, STATUS_LABELS, TAGS, WORKFLOW_STATUSES } from "../../../lib/workflow";
import { listProjectComments, updateComment } from "../../board/api";
import { usePreparedReply } from "../../comments/use-prepared-reply";
import { useReviewDraftGuard } from "../../comments/use-review-draft-guard";
import type { WorkspaceOut, MemberOut } from "../../workspaces/api";
import { useProjectRole } from "../../projects/use-project";
import { ticketRef } from "../../../lib/ticket-ref";
import * as api from "../api";
import { DatePicker } from "./DatePicker";
import { DeleteTicketDialog, TrashIcon } from "./DeleteTicket";
import { PeoplePicker } from "./PeoplePicker";
import { PRIORITY_META } from "../../projects/panel/comments/types";

function editableFields(ticket: api.Ticket | Schemas["CommentOut"]): Schemas["CommentUpdate"] {
  return { status: ticket.status, priority: ticket.priority, tags: ticket.tags ?? [], assignee_ids: ticket.assignee_ids ?? [], waiting_on_ids: ticket.waiting_on_ids ?? [], waiting_on_client: ticket.waiting_on_client ?? false, due_at: ticket.due_at };
}

export function TicketDetail({ id, workspace, members, onClose }: { id: string; workspace: WorkspaceOut; members: MemberOut[]; onClose: () => void }) {
  const closeGuard = useRef<(() => void) | null>(null);
  const ticket = useQuery({ queryKey: qk.ticketDetail(workspace.id, id), queryFn: () => api.listTickets(workspace.id, new URLSearchParams({ comment_id: id, limit: "1" })) });
  const value = ticket.data?.items[0];
  return <Dialog title={value ? `Ticket ${ticketRef(value)}` : "Ticket details"} onClose={() => closeGuard.current ? closeGuard.current() : onClose()}>{ticket.isLoading && <p className="bl-form" role="status">Loading ticket…</p>}{ticket.error && <p className="bl-error" role="alert">{ticket.error.message}</p>}{value ? <TicketDetailForm key={value.id} ticket={value} workspace={workspace} members={members} onDeleted={onClose} closeGuard={closeGuard} /> : ticket.data && <p className="bl-form">Ticket not found in active projects.</p>}</Dialog>;
}

function TicketDetailForm({ ticket, workspace, members, onDeleted, closeGuard }: { ticket: api.Ticket; workspace: WorkspaceOut; members: MemberOut[]; onDeleted: () => void; closeGuard: MutableRefObject<(() => void) | null> }) {
  const cache = useQueryClient();
  const { canComment, canEdit, loaded } = useProjectRole(ticket.project_id);
  const saving = useRef(false);
  const revision = useRef(ticket.revision ?? 0);
  const [saveWarning, setSaveWarning] = useState("");
  const [baseline, setBaseline] = useState(() => ({ body: ticket.body, patch: editableFields(ticket) }));
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [body, setBody] = useState(ticket.body), [reply, setReply] = useState("");
  const [patch, setPatch] = useState(() => editableFields(ticket));
  const [layer, setLayer] = useState<"team" | "client">(ticket.layer);
  const comments = useQuery({ queryKey: qk.projectComments(ticket.project_id), queryFn: () => listProjectComments(ticket.project_id) });
  async function refresh() { await invalidateTicketsAndDashboard(cache, workspace.id); await cache.invalidateQueries({ queryKey: qk.projectComments(ticket.project_id) }); }
  const metadataDirty = body !== baseline.body || JSON.stringify(patch) !== JSON.stringify(baseline.patch);
  const save = useMutation({
    mutationFn: (changes: Schemas["CommentUpdate"]) => updateComment(ticket.id, changes, revision.current),
    onSuccess: (saved) => {
      revision.current = saved.revision ?? revision.current + 1;
      const next = { body: saved.body, patch: editableFields(saved) };
      setBody(next.body); setPatch(next.patch); setBaseline(next);
      void refresh().catch(() => setSaveWarning("Changes saved. Some views could not refresh; reload to see the latest ticket."));
    },
    onSettled: () => { saving.current = false; },
  });
  function changePatch(next: Schemas["CommentUpdate"]) {
    if (canEdit && !saving.current) setPatch(next);
  }
  function saveChanges() {
    if (!canEdit || saving.current || !metadataDirty || !body.trim() || body.trim().length > 10_000) return;
    // Omit untouched fields so editing text cannot reset someone else's assignee,
    // priority or status. Same-field conflict protection still needs server CAS.
    const changes = Object.fromEntries(Object.entries(patch).filter(([key, value]) =>
      JSON.stringify(value) !== JSON.stringify(baseline.patch[key as keyof typeof patch]))) as Schemas["CommentUpdate"];
    if (body !== baseline.body) changes.body = body.trim();
    saving.current = true;
    setSaveWarning("");
    save.mutate(structuredClone(changes));
  }
  const post = usePreparedReply({ commentId: ticket.id, projectId: ticket.project_id, draft: () => ({ body: reply, layer: ticket.layer === "team" ? "team" : layer }), onSaved: async () => { setReply(""); await refresh(); } });
  const guard = useReviewDraftGuard({ draftName: "ticket changes and reply", dirty: metadataDirty || Boolean(reply.trim()), pending: post.isPending || save.isPending, unconfirmed: post.locked, discard: () => { post.reset(); setReply(""); setBody(baseline.body); setPatch(baseline.patch); } });
  useImperativeHandle(closeGuard, () => () => guard.requestLeave(onDeleted), [guard, onDeleted]);
  return <div className="bl-form">{guard.dialog}<div className="bl-chip-row"><span className="bl-tid">{ticketRef(ticket)}</span><span className="bl-chip">{ticket.project_name}</span><span className="bl-chip">{ticket.layer === "team" ? "Team only" : "Client visible"}</span>{!ticket.is_standalone && <Link className="bl-chip" to={`/w/${workspace.slug}/p/${ticket.project_id}?comment=${ticket.id}`}>Open on page ↗</Link>}</div>
    <form className="bl-form bl-flush" onSubmit={(e) => { e.preventDefault(); saveChanges(); }}><label>Ticket<textarea className="bl-input" rows={3} value={body} required maxLength={10_000} readOnly={!canEdit || save.isPending} onChange={(e) => { if (canEdit && !saving.current) setBody(e.target.value); }} /></label><fieldset className="bl-form bl-flush" disabled={!canEdit || save.isPending}><legend>Ticket properties</legend><div className="bl-fields"><label>Status<select className="bl-input" value={patch.status ?? ticket.status} onChange={(e) => changePatch({ ...patch, status: e.target.value as api.Ticket["status"], ...(isClosed(e.target.value as api.Ticket["status"]) ? { waiting_on_ids: [], waiting_on_client: false } : {}) })}>{WORKFLOW_STATUSES.map((s) => <option key={s} value={s}>{STATUS_LABELS[s]}</option>)}</select></label><label>Priority<select className="bl-input" value={patch.priority ?? "medium"} onChange={(e) => changePatch({ ...patch, priority: e.target.value as "high" | "medium" | "low" })}>{(["high", "medium", "low"] as const).map((p) => <option key={p} value={p}>{PRIORITY_META[p].label}</option>)}</select></label><label>Due date<DatePicker value={patch.due_at} onChange={(d) => changePatch({ ...patch, due_at: d })} /></label></div><fieldset><legend>Tags</legend><div className="bl-chip-row">{TAGS.map((tag) => <label className="bl-chip" key={tag}><input type="checkbox" checked={patch.tags?.includes(tag) ?? false} onChange={(e) => changePatch({ ...patch, tags: e.target.checked ? [...(patch.tags ?? []), tag] : patch.tags?.filter((t) => t !== tag) })} />{tag}</label>)}</div></fieldset><PeoplePicker label="Assignees" members={members} selected={patch.assignee_ids ?? []} onChange={(assignee_ids) => changePatch({ ...patch, assignee_ids })} />{!isClosed(patch.status ?? ticket.status) && <><PeoplePicker label="Waiting for a reply from" members={members} selected={patch.waiting_on_ids ?? []} onChange={(waiting_on_ids) => changePatch({ ...patch, waiting_on_ids })} /><label className="bl-check"><input type="checkbox" checked={patch.waiting_on_client ?? false} onChange={(e) => changePatch({ ...patch, waiting_on_client: e.target.checked })} />Waiting on client</label></>}</fieldset>{!canEdit && <p role="status">{loaded ? "Editors and managers can change or delete this ticket. You can still read and copy its text." : "Checking ticket permissions…"}</p>}{save.error && <p className="bl-error" role="alert">{save.error.message} {save.error instanceof ApiError && save.error.status === 409 ? "Your draft is still here. Copy it, reload, and review both versions." : "Saving is unconfirmed. Check the latest ticket before saving again."}</p>}{save.isSuccess && !metadataDirty && <p role="status">Changes saved.</p>}{saveWarning && <p role="status">{saveWarning}</p>}<div className="bl-form-actions bl-detail-actions"><button type="button" className="bl-quiet bl-danger-text" disabled={!canEdit || save.isPending || post.isPending} onClick={() => { if (canEdit && !saving.current) guard.requestLeave(() => setConfirmDelete(true)); }}><TrashIcon /> Delete ticket</button><button className="bl-button" disabled={!canEdit || save.isPending || !metadataDirty || !body.trim()}>{save.isPending ? "Saving…" : "Save changes"}</button></div></form>
    {ticket.screenshot_url && <a href={ticket.screenshot_url} target="_blank" rel="noreferrer"><img className="bl-screenshot" src={ticket.screenshot_url} alt="Captured review context" /></a>}{ticket.attachments.map((a) => <a key={a.url} className="bl-chip" href={a.url} target="_blank" rel="noreferrer">{a.filename} ↗</a>)}<h2 className="bl-group-title">Conversation</h2>{comments.error && <p role="alert" className="bl-error">{comments.error.message}</p>}{comments.data?.filter((c) => c.parent_id === ticket.id).map((c) => <article className="bl-message" key={c.id}><small>{c.author_name} · {c.layer === "team" ? "Team only" : "Client visible"}</small><p>{c.body}</p>{c.attachments.map((a) => <a className="bl-chip" key={a.url} href={a.url} target="_blank" rel="noreferrer">{a.filename}</a>)}</article>)}<form className="bl-form bl-flush" onSubmit={(e) => { e.preventDefault(); if (canComment) post.mutate(); }}><label>Reply<textarea className="bl-input" required maxLength={10_000} readOnly={!canComment || post.isPending || post.locked} value={reply} onChange={(e) => setReply(e.target.value)} /></label><div className="bl-form-actions"><select aria-label="Reply visibility" className="bl-select" disabled={!canComment || ticket.layer === "team" || post.isPending || post.locked} value={ticket.layer === "team" ? "team" : layer} onChange={(e) => setLayer(e.target.value as "team" | "client")}><option value="team">Team only</option>{ticket.layer === "client" && <option value="client">Client visible</option>}</select><button className="bl-button" disabled={!canComment || post.isPending || !reply.trim()}>{post.isPending ? "Posting…" : post.locked ? "Retry reply save" : "Post reply"}</button></div>{!canComment && <p role="status">{loaded ? "Your project role allows reading this conversation. Commenter access is needed to reply." : "Checking reply permissions…"}</p>}{post.error && <p className="bl-error" role="alert">{post.error.message} {post.locked && "Saving is unconfirmed. Retry sends the original reply; check Backline before posting it again."}</p>}{(reply.trim() || post.locked) && <button type="button" className="bl-quiet" onClick={() => void post.copyText()}>Copy reply text</button>}{post.copyStatus && <p role="status">{post.copyStatus}</p>}{post.completionWarning && <p role="status">{post.completionWarning}</p>}</form>
    {confirmDelete && canEdit && <DeleteTicketDialog ticket={ticket} workspaceId={workspace.id} onCancel={() => setConfirmDelete(false)} onDeleted={onDeleted} />}
  </div>;
}
