import type { Schemas } from "@backline/types";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Link } from "react-router-dom";
import { Dialog } from "../../../components/Dialog";
import { useToast } from "../../../components/Toast";
import { invalidateTicketsAndDashboard, qk } from "../../../lib/query-keys";
import { timeAgo } from "../../../lib/time";
import { isClosed, STATUS_LABELS, TAGS, WORKFLOW_STATUSES } from "../../../lib/workflow";
import { listProjectComments, updateComment, createReply } from "../../board/api";
import type { WorkspaceOut, MemberOut } from "../../workspaces/api";
import { ticketRef } from "../../../lib/ticket-ref";
import * as api from "../api";
import { DatePicker } from "./DatePicker";
import { DeleteTicketDialog, TrashIcon } from "./DeleteTicket";
import { PeoplePicker } from "./PeoplePicker";
import { PRIORITY_META } from "../../projects/panel/comments/types";

export function TicketDetail({ id, workspace, members, onClose }: { id: string; workspace: WorkspaceOut; members: MemberOut[]; onClose: () => void }) {
  const ticket = useQuery({ queryKey: qk.ticketDetail(workspace.id, id), queryFn: () => api.listTickets(workspace.id, new URLSearchParams({ comment_id: id, limit: "1" })) });
  const value = ticket.data?.items[0];
  return (
    <Dialog title={value ? `Ticket ${ticketRef(value)}` : "Ticket details"} onClose={onClose} size="wide">
      {ticket.isLoading && <p className="bl-form" role="status">Loading ticket…</p>}
      {ticket.error && <p className="bl-error" role="alert">{ticket.error.message}</p>}
      {value ? (
        <TicketDetailForm key={value.id} ticket={value} workspace={workspace} members={members} onDeleted={onClose} />
      ) : (
        ticket.data && <p className="bl-form">Ticket not found in active projects.</p>
      )}
    </Dialog>
  );
}

function initialPatch(ticket: api.Ticket): Schemas["CommentUpdate"] {
  return {
    status: ticket.status,
    priority: ticket.priority,
    tags: ticket.tags ?? [],
    assignee_ids: ticket.assignee_ids ?? [],
    waiting_on_ids: ticket.waiting_on_ids ?? [],
    waiting_on_client: ticket.waiting_on_client ?? false,
    due_at: ticket.due_at,
  };
}

// TDR-0058: what the ticket is about comes first (the request, where it was left, its
// screenshot, the conversation), with its properties in a side column - instead of one
// long form where the screenshot and replies sat below Save, and Delete sat next to it.
function TicketDetailForm({ ticket, workspace, members, onDeleted }: { ticket: api.Ticket; workspace: WorkspaceOut; members: MemberOut[]; onDeleted: () => void }) {
  const cache = useQueryClient();
  const { toast } = useToast();
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [body, setBody] = useState(ticket.body);
  const [reply, setReply] = useState("");
  const [patch, setPatch] = useState<Schemas["CommentUpdate"]>(() => initialPatch(ticket));
  const [saved, setSaved] = useState(() => JSON.stringify({ body: ticket.body, ...initialPatch(ticket) }));
  const [layer, setLayer] = useState<"team" | "client">(ticket.layer);
  const comments = useQuery({ queryKey: qk.projectComments(ticket.project_id), queryFn: () => listProjectComments(ticket.project_id) });
  const dirty = JSON.stringify({ body, ...patch }) !== saved;
  async function refresh() {
    await invalidateTicketsAndDashboard(cache, workspace.id);
    await cache.invalidateQueries({ queryKey: qk.projectComments(ticket.project_id) });
  }
  const save = useMutation({
    mutationFn: () => updateComment(ticket.id, { ...patch, body }),
    onSuccess: async () => {
      setSaved(JSON.stringify({ body, ...patch }));
      toast("Ticket saved.");
      await refresh();
    },
  });
  const post = useMutation({
    mutationFn: () => createReply(ticket.id, reply.trim(), layer),
    onSuccess: async () => {
      setReply("");
      await refresh();
    },
  });
  const status = patch.status ?? ticket.status;
  const where = ticket.is_standalone && !ticket.page_path ? "Team ticket · whole project" : (ticket.page_path ?? ticket.page_title);
  const replies = comments.data?.filter((c) => c.parent_id === ticket.id) ?? [];

  return (
    <div className="bl-td">
      <div className="bl-td-context">
        <span className="bl-tid">{ticketRef(ticket)}</span>
        <span className="bl-td-where">
          <strong>{ticket.project_name}</strong>
          <span>{where}</span>
        </span>
        <span className={`bl-chip${ticket.layer === "team" ? "" : " is-client"}`}>{ticket.layer === "team" ? "Team only" : "Client visible"}</span>
        {!ticket.is_standalone && (
          <Link className="bl-quiet bl-td-open" to={`/w/${workspace.slug}/p/${ticket.project_id}?comment=${ticket.id}`}>
            Open on page ↗
          </Link>
        )}
      </div>

      <form
        className="bl-td-grid"
        onSubmit={(e) => {
          e.preventDefault();
          save.mutate();
        }}
      >
        <div className="bl-td-main">
          <label className="bl-td-label">
            Request
            <textarea className="bl-input bl-td-body" rows={4} value={body} required onChange={(e) => setBody(e.target.value)} />
          </label>
          <p className="bl-td-meta">
            Raised by {ticket.author_name} · {timeAgo(ticket.created_at)}
          </p>
          {(ticket.screenshot_url || ticket.attachments.length > 0) && (
            <div className="bl-td-media">
              {ticket.screenshot_url && (
                <a href={ticket.screenshot_url} target="_blank" rel="noreferrer">
                  <img className="bl-screenshot" src={ticket.screenshot_url} alt="Captured review context" />
                </a>
              )}
              {ticket.attachments.length > 0 && (
                <div className="bl-chip-row">
                  {ticket.attachments.map((a) => (
                    <a key={a.url} className="bl-chip" href={a.url} target="_blank" rel="noreferrer">
                      {a.filename} ↗
                    </a>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>

        <aside className="bl-td-side" aria-label="Ticket properties">
          <label>
            Status
            <select
              className="bl-input"
              value={status}
              onChange={(e) => {
                const next = e.target.value as api.Ticket["status"];
                setPatch({ ...patch, status: next, ...(isClosed(next) ? { waiting_on_ids: [], waiting_on_client: false } : {}) });
              }}
            >
              {WORKFLOW_STATUSES.map((s) => (
                <option key={s} value={s}>
                  {STATUS_LABELS[s]}
                </option>
              ))}
            </select>
          </label>
          <div className="bl-td-pair">
            <label>
              Priority
              <select className="bl-input" value={patch.priority ?? "medium"} onChange={(e) => setPatch({ ...patch, priority: e.target.value as "high" | "medium" | "low" })}>
                {(["high", "medium", "low"] as const).map((p) => (
                  <option key={p} value={p}>
                    {PRIORITY_META[p].label}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Due date
              <DatePicker value={patch.due_at} onChange={(d) => setPatch({ ...patch, due_at: d })} />
            </label>
          </div>
          <PeoplePicker label="Assignees" members={members} selected={patch.assignee_ids ?? []} onChange={(assignee_ids) => setPatch({ ...patch, assignee_ids })} />
          {!isClosed(status) && (
            <>
              <PeoplePicker label="Waiting for a reply from" members={members} selected={patch.waiting_on_ids ?? []} onChange={(waiting_on_ids) => setPatch({ ...patch, waiting_on_ids })} />
              <label className="bl-check">
                <input type="checkbox" checked={patch.waiting_on_client ?? false} onChange={(e) => setPatch({ ...patch, waiting_on_client: e.target.checked })} />
                Waiting on client
              </label>
            </>
          )}
          <fieldset className="bl-td-tags">
            <legend>Tags</legend>
            <div className="bl-chip-row">
              {TAGS.map((tag) => (
                <label className="bl-chip" key={tag}>
                  <input
                    type="checkbox"
                    checked={patch.tags?.includes(tag) ?? false}
                    onChange={(e) => setPatch({ ...patch, tags: e.target.checked ? [...(patch.tags ?? []), tag] : patch.tags?.filter((t) => t !== tag) })}
                  />
                  {tag}
                </label>
              ))}
            </div>
          </fieldset>
          {save.error && (
            <p className="bl-error" role="alert">
              {save.error.message}
            </p>
          )}
          <button className="bl-button bl-td-save" disabled={save.isPending || !body.trim() || !dirty}>
            {save.isPending ? "Saving…" : dirty ? "Save changes" : "No unsaved changes"}
          </button>
          <button type="button" className="bl-td-delete" onClick={() => setConfirmDelete(true)}>
            <TrashIcon /> Delete ticket
          </button>
        </aside>
      </form>

      <section className="bl-td-thread" aria-label="Conversation">
        <h2 className="bl-group-title">
          Conversation <span>{replies.length}</span>
        </h2>
        {comments.error && (
          <p role="alert" className="bl-error">
            {comments.error.message}
          </p>
        )}
        {replies.length === 0 && !comments.isLoading && <p className="bl-td-empty">No replies yet.</p>}
        {replies.map((c) => (
          <article className="bl-message" key={c.id}>
            <small>
              <b>{c.author_name}</b> · {timeAgo(c.created_at)} · {c.layer === "team" ? "Team only" : "Client visible"}
            </small>
            <p>{c.body}</p>
            {c.attachments.map((a) => (
              <a className="bl-chip" key={a.url} href={a.url} target="_blank" rel="noreferrer">
                {a.filename}
              </a>
            ))}
          </article>
        ))}
        <form
          className="bl-td-reply"
          onSubmit={(e) => {
            e.preventDefault();
            post.mutate();
          }}
        >
          <textarea className="bl-input" aria-label="Reply" placeholder="Write a reply…" required value={reply} onChange={(e) => setReply(e.target.value)} />
          <div className="bl-form-actions">
            <select aria-label="Reply visibility" className="bl-select" value={layer} onChange={(e) => setLayer(e.target.value as "team" | "client")}>
              <option value="team">Team only</option>
              {ticket.layer === "client" && <option value="client">Client visible</option>}
            </select>
            <button className="bl-button" disabled={post.isPending || !reply.trim()}>
              {post.isPending ? "Posting…" : "Post reply"}
            </button>
          </div>
          {post.error && (
            <p className="bl-error" role="alert">
              {post.error.message}
            </p>
          )}
        </form>
      </section>

      {confirmDelete && <DeleteTicketDialog ticket={ticket} workspaceId={workspace.id} onCancel={() => setConfirmDelete(false)} onDeleted={onDeleted} />}
    </div>
  );
}
