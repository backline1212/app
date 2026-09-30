import type { ReactNode } from "react";

import { Dialog } from "./Dialog";

// FE-06/FE-08: shared confirm primitive - replaces the browser's own
// confirm()/window.confirm() (no styling, no focus management, blocks the whole
// tab) with the same Dialog-based pattern ProjectMenu's archive/hard-delete
// confirmations already use.
export function ConfirmDialog({
  title = "Are you sure?",
  message,
  confirmLabel = "Confirm",
  cancelLabel = "Cancel",
  destructive = false,
  pending = false,
  onConfirm,
  onCancel,
}: {
  title?: string;
  message: ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  destructive?: boolean;
  pending?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  return (
    <Dialog title={title} onClose={onCancel}>
      <div className="p-4">
        {/* A div, not a p: callers pass paragraphs of their own (and error lines). */}
        <div className="mb-4 bl-confirm-message">{message}</div>
        <div className="flex justify-end gap-3">
          {/* Disabled while pending too - onCancel only closes the dialog, it can't abort an
              in-flight destructive request, so letting it stay clickable would look like it
              cancelled the action when the mutation is still going through. */}
          <button type="button" className="bl-quiet" disabled={pending} onClick={onCancel}>
            {cancelLabel}
          </button>
          <button
            type="button"
            className={`bl-button${destructive ? " danger" : ""}`}
            disabled={pending}
            onClick={onConfirm}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </Dialog>
  );
}
