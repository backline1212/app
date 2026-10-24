import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";
import { ConfirmDialog } from "../../../components/ConfirmDialog";
import { invalidateTicketsAndDashboard, qk } from "../../../lib/query-keys";
import { ticketRef } from "../../../lib/ticket-ref";
import { deleteThread } from "../../board/api";
import { useProjectRole } from "../../projects/use-project";
import type * as api from "../api";

// Deleting a ticket removes the whole thread (its replies too), through the same
// moderation endpoint the review board uses; the API enforces comment:delete.
export function DeleteTicketDialog({ ticket, workspaceId, onCancel, onDeleted }: { ticket: Pick<api.Ticket, "id" | "project_id" | "body" | "ticket_number">; workspaceId: string; onCancel: () => void; onDeleted: () => void }) {
  const cache = useQueryClient();
  const { canEdit, loaded } = useProjectRole(ticket.project_id);
  const submitting = useRef(false);
  const mounted = useRef(true);
  const [deleted, setDeleted] = useState(false);
  const [refreshWarning, setRefreshWarning] = useState("");
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  const remove = useMutation({
    mutationFn: () => {
      if (!canEdit) throw new Error("Editor access is needed to delete this ticket.");
      return deleteThread(ticket.id);
    },
    onSettled: () => { submitting.current = false; },
    onSuccess: () => {
      if (!mounted.current) return;
      setDeleted(true);
      // The DELETE is confirmed. Refetch failure must not offer another delete,
      // and a stalled refresh must not prevent closing the completed action.
      void Promise.all([
        invalidateTicketsAndDashboard(cache, workspaceId),
        cache.invalidateQueries({ queryKey: qk.projectComments(ticket.project_id) }),
      ]).then(() => { if (mounted.current) onDeleted(); })
        .catch(() => { if (mounted.current) setRefreshWarning("Ticket deleted. The list could not refresh; close this dialog and reload to see the latest tickets."); });
    },
  });
  return (
    <ConfirmDialog
      title={deleted ? `Ticket ${ticketRef(ticket)} deleted` : `Delete ticket ${ticketRef(ticket)}?`}
      message={
        <>
          <p>“{ticket.body.length > 120 ? `${ticket.body.slice(0, 120)}…` : ticket.body}”</p>
          <p>{deleted ? "The ticket and its replies have been deleted. You can close this dialog while the ticket list refreshes." : "The ticket and every reply on it are removed for everyone. This can't be undone."}</p>
          {refreshWarning && <p role="status">{refreshWarning}</p>}
          {!canEdit && <p role="status">{loaded ? "Editors and managers can delete tickets in this project." : "Checking project access..."}</p>}
          {remove.error && (
            <p role="alert" className="bl-error">
              {remove.error.message}
            </p>
          )}
        </>
      }
      confirmLabel={deleted ? "Deleted" : remove.isPending ? "Deleting…" : "Delete ticket"}
      cancelLabel={deleted ? "Close" : "Cancel"}
      destructive
      pending={remove.isPending}
      confirmDisabled={!canEdit || deleted}
      onCancel={() => { if (deleted) onDeleted(); else onCancel(); }}
      onConfirm={() => { if (canEdit && !deleted && !submitting.current) { submitting.current = true; remove.mutate(); } }}
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
