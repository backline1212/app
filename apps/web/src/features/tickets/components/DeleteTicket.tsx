import { useMutation, useQueryClient } from "@tanstack/react-query";
import { ConfirmDialog } from "../../../components/ConfirmDialog";
import { invalidateTicketsAndDashboard, qk } from "../../../lib/query-keys";
import { ticketRef } from "../../../lib/ticket-ref";
import { deleteThread } from "../../board/api";
import type * as api from "../api";

// Deleting a ticket removes the whole thread (its replies too), through the same
// moderation endpoint the review board uses; the API enforces comment:delete.
export function DeleteTicketDialog({ ticket, workspaceId, onCancel, onDeleted }: { ticket: api.Ticket; workspaceId: string; onCancel: () => void; onDeleted: () => void }) {
  const cache = useQueryClient();
  const remove = useMutation({
    mutationFn: () => deleteThread(ticket.id),
    onSuccess: async () => {
      await invalidateTicketsAndDashboard(cache, workspaceId);
      await cache.invalidateQueries({ queryKey: qk.projectComments(ticket.project_id) });
      onDeleted();
    },
  });
  return (
    <ConfirmDialog
      title={`Delete ticket ${ticketRef(ticket)}?`}
      message={
        <>
          <p>“{ticket.body.length > 120 ? `${ticket.body.slice(0, 120)}…` : ticket.body}”</p>
          <p>The ticket and every reply on it are removed for everyone. This can't be undone.</p>
          {remove.error && (
            <p role="alert" className="bl-error">
              {remove.error.message}
            </p>
          )}
        </>
      }
      confirmLabel={remove.isPending ? "Deleting…" : "Delete ticket"}
      destructive
      pending={remove.isPending}
      onCancel={onCancel}
      onConfirm={() => remove.mutate()}
    />
  );
}

export function TrashIcon() {
  return (
    <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M3 6h18M8 6V4h8v2M19 6l-1 14H6L5 6M10 11v6M14 11v6" />
    </svg>
  );
}
