import type { Schemas } from "@backline/types";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Link } from "react-router-dom";
import { Dialog } from "../../../components/Dialog";
import { invalidateTicketsAndDashboard, qk } from "../../../lib/query-keys";
import { isClosed, STATUS_LABELS, TAGS, WORKFLOW_STATUSES } from "../../../lib/workflow";
import { listProjectComments, updateComment, createReply } from "../../board/api";
import type { WorkspaceOut, MemberOut } from "../../workspaces/api";
import { ticketRef } from "../../../lib/ticket-ref";
import * as api from "../api";
import { DatePicker } from "./DatePicker";
import { DeleteTicketDialog, TrashIcon } from "./DeleteTicket";
import { PeoplePicker } from "./PeoplePicker";

export function TicketDetail({ id, workspace, members, onClose }: { id: string; workspace: WorkspaceOut; members: MemberOut[]; onClose: () => void }) {
  const ticket = useQuery({ queryKey: qk.ticketDetail(workspace.id, id), queryFn: () => api.listTickets(workspace.id, new URLSearchParams({ comment_id: id, limit: "1" })) });
  const value = ticket.data?.items[0];
  return <Dialog title={value ? `Ticket ${ticketRef(value)}` : "Ticket details"} onClose={onClose}>{ticket.isLoading && <p className="bl-form" role="status">Loading ticket…</p>}{ticket.error && <p className="bl-error" role="alert">{ticket.error.message}</p>}{value ? <TicketDetailForm key={value.id} ticket={value} workspace={workspace} members={members} onDeleted={onClose} /> : ticket.data && <p className="bl-form">Ticket not found in active projects.</p>}</Dialog>;
}

function TicketDetailForm({ ticket, workspace, members, onDeleted }: { ticket: api.Ticket; workspace: WorkspaceOut; members: MemberOut[]; onDeleted: () => void }) {
  const cache = useQueryClient();
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [body, setBody] = useState(ticket.body), [reply, setReply] = useState("");
  const [patch, setPatch] = useState<Schemas["CommentUpdate"]>({ status: ticket.status, priority: ticket.priority, tags: ticket.tags ?? [], assignee_ids: ticket.assignee_ids ?? [], waiting_on_ids: ticket.waiting_on_ids ?? [], waiting_on_client: ticket.waiting_on_client ?? false, due_at: ticket.due_at });
  const [layer, setLayer] = useState<"team" | "client">(ticket.layer);
  const comments = useQuery({ queryKey: qk.projectComments(ticket.project_id), queryFn: () => listProjectComments(ticket.project_id) });
  async function refresh() { await invalidateTicketsAndDashboard(cache, workspace.id); await cache.invalidateQueries({ queryKey: qk.projectComments(ticket.project_id) }); }
  const save = useMutation({ mutationFn: () => updateComment(ticket.id, { ...patch, body }), onSuccess: refresh });
  const post = useMutation({ mutationFn: () => createReply(ticket.id, reply.trim(), layer), onSuccess: async () => { setReply(""); await refresh(); } });
  return <div className="bl-form"><div className="bl-chip-row"><span className="bl-tid">{ticketRef(ticket)}</span><span className="bl-chip">{ticket.project_name}</span><span className="bl-chip">{ticket.layer === "team" ? "Team only" : "Client visible"}</span>{!ticket.is_standalone && <Link className="bl-chip" to={`/w/${workspace.slug}/p/${ticket.project_id}?comment=${ticket.id}`}>Open on page ↗</Link>}</div>
    <form className="bl-form bl-flush" onSubmit={(e) => { e.preventDefault(); save.mutate(); }}><label>Ticket<textarea className="bl-input" rows={3} value={body} required onChange={(e) => setBody(e.target.value)} /></label><div className="bl-fields"><label>Status<select className="bl-input" value={patch.status ?? ticket.status} onChange={(e) => setPatch({ ...patch, status: e.target.value as api.Ticket["status"], ...(isClosed(e.target.value as api.Ticket["status"]) ? { waiting_on_ids: [], waiting_on_client: false } : {}) })}>{WORKFLOW_STATUSES.map((s) => <option key={s} value={s}>{STATUS_LABELS[s]}</option>)}</select></label><label>Priority<select className="bl-input" value={patch.priority ?? "medium"} onChange={(e) => setPatch({ ...patch, priority: e.target.value as "high" | "medium" | "low" })}>{['high','medium','low'].map((p) => <option key={p}>{p}</option>)}</select></label><label>Due date<DatePicker value={patch.due_at} onChange={(d) => setPatch({ ...patch, due_at: d })} /></label></div><fieldset><legend>Tags</legend><div className="bl-chip-row">{TAGS.map((tag) => <label className="bl-chip" key={tag}><input type="checkbox" checked={patch.tags?.includes(tag) ?? false} onChange={(e) => setPatch({ ...patch, tags: e.target.checked ? [...(patch.tags ?? []), tag] : patch.tags?.filter((t) => t !== tag) })} />{tag}</label>)}</div></fieldset><PeoplePicker label="Assignees" members={members} selected={patch.assignee_ids ?? []} onChange={(assignee_ids) => setPatch({ ...patch, assignee_ids })} />{!isClosed(patch.status ?? ticket.status) && <><PeoplePicker label="Waiting for a reply from" members={members} selected={patch.waiting_on_ids ?? []} onChange={(waiting_on_ids) => setPatch({ ...patch, waiting_on_ids })} /><label className="bl-check"><input type="checkbox" checked={patch.waiting_on_client ?? false} onChange={(e) => setPatch({ ...patch, waiting_on_client: e.target.checked })} />Waiting on client</label></>}{save.error && <p className="bl-error" role="alert">{save.error.message}</p>}{save.isSuccess && <p role="status">Changes saved.</p>}<div className="bl-form-actions bl-detail-actions"><button type="button" className="bl-quiet bl-danger-text" onClick={() => setConfirmDelete(true)}><TrashIcon /> Delete ticket</button><button className="bl-button" disabled={save.isPending || !body.trim()}>Save changes</button></div></form>
    {ticket.screenshot_url && <a href={ticket.screenshot_url} target="_blank" rel="noreferrer"><img className="bl-screenshot" src={ticket.screenshot_url} alt="Captured review context" /></a>}{ticket.attachments.map((a) => <a key={a.url} className="bl-chip" href={a.url} target="_blank" rel="noreferrer">{a.filename} ↗</a>)}<h2 className="bl-group-title">Conversation</h2>{comments.error && <p role="alert" className="bl-error">{comments.error.message}</p>}{comments.data?.filter((c) => c.parent_id === ticket.id).map((c) => <article className="bl-message" key={c.id}><small>{c.author_name} · {c.layer === "team" ? "Team only" : "Client visible"}</small><p>{c.body}</p>{c.attachments.map((a) => <a className="bl-chip" key={a.url} href={a.url} target="_blank" rel="noreferrer">{a.filename}</a>)}</article>)}<form className="bl-form bl-flush" onSubmit={(e) => { e.preventDefault(); post.mutate(); }}><label>Reply<textarea className="bl-input" required value={reply} onChange={(e) => setReply(e.target.value)} /></label><div className="bl-form-actions"><select aria-label="Reply visibility" className="bl-select" value={layer} onChange={(e) => setLayer(e.target.value as "team" | "client")}><option value="team">Team only</option>{ticket.layer === "client" && <option value="client">Client visible</option>}</select><button className="bl-button" disabled={post.isPending || !reply.trim()}>Post reply</button></div>{post.error && <p className="bl-error" role="alert">{post.error.message}</p>}</form>
    {confirmDelete && <DeleteTicketDialog ticket={ticket} workspaceId={workspace.id} onCancel={() => setConfirmDelete(false)} onDeleted={onDeleted} />}
  </div>;
}
