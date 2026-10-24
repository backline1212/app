import { useQuery } from "@tanstack/react-query";
import { Dialog } from "../../../components/Dialog";
import { qk } from "../../../lib/query-keys";
import { listProjectComments } from "../../board/api";
import { CommentThreadPanel } from "../../board/CommentThreadPanel";
import type { WorkspaceOut } from "../../workspaces/api";
import * as api from "../api";

/** Opens a ticket from the workspace Tickets page in the same ticket view the project
 * board, search, activity and notifications use (TDR-0153). */
export function TicketDetail({ id, workspace, onClose }: { id: string; workspace: WorkspaceOut; onClose: () => void }) {
  const ticket = useQuery({ queryKey: qk.ticketDetail(workspace.id, id), queryFn: () => api.listTickets(workspace.id, new URLSearchParams({ comment_id: id, limit: "1" })) });
  const value = ticket.data?.items[0];
  const projectId = value?.project_id ?? "";
  const comments = useQuery({ queryKey: qk.projectComments(projectId), queryFn: () => listProjectComments(projectId), enabled: Boolean(value) });
  const comment = comments.data?.find((c) => c.id === id);
  if (value && comment) {
    const replies = (comments.data ?? []).filter((c) => c.parent_id === id).sort((a, b) => a.created_at.localeCompare(b.created_at));
    return <CommentThreadPanel key={comment.id} comment={comment} replies={replies} projectId={value.project_id} projectName={value.project_name} onClose={onClose} />;
  }
  const error = ticket.error ?? comments.error;
  const loading = ticket.isLoading || (Boolean(value) && comments.isLoading);
  return <Dialog title="Ticket" onClose={onClose}>
    <div className="bl-form">
      {loading && <p role="status">Loading ticket…</p>}
      {error && <p className="bl-error" role="alert">{error.message}</p>}
      {!loading && !error && <p>This ticket was deleted, or its project is archived.</p>}
    </div>
  </Dialog>;
}
