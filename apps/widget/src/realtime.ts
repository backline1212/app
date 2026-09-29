import { STATUS_LABELS } from "./status";
import type { ThreadManager } from "./thread-manager";
import type { CommentRecord } from "./types";
import { showToast, showOfflineIndicator } from "./ui";
import { connectReviewSocket } from "./ws-client";

// How long a comment.created for a thread this widget doesn't know waits before it is
// drawn. This widget's own post is broadcast before the POST's response gets back, and
// the response is what hands the comment its already-drawn pin (thread-manager.ts's
// adoptPin) - drawing a second one in between would flash a duplicate.
const OWN_POST_GRACE_MS = 1500;

function isCommentRecord(payload: unknown): payload is CommentRecord {
  const record = payload as Partial<CommentRecord> | null;
  return (
    typeof record?.id === "string" &&
    typeof record.page_id === "string" &&
    (record.parent_id === null || typeof record.parent_id === "string") &&
    typeof record.body === "string" &&
    typeof record.created_at === "string"
  );
}

// Realtime signal (12-API-WebSocket.md §12.6): presence is announced just by
// connecting with this page's id. The guest channel only ever carries client-visible
// comments (comments/service.py's _broadcast_comment_event), so everything here is
// something this reviewer may see:
// - comment.created draws a new thread's pin, or adds a reply to a thread on this page
//   (and to its card, if open);
// - comment.updated keeps every thread's text, tags and status current - but is only
//   *announced* for a comment this guest created (a status change on a comment the
//   guest can't act on isn't worth interrupting them for). A top-level comment the page
//   doesn't know yet (a thread just made client-visible) is handed to onUnknownThread;
// - comment.deleted removes a pin or reply - a delete made elsewhere, or a thread made
//   team-only.
export function wireRealtimeUpdates(
  shadow: ShadowRoot,
  apiBaseUrl: string | undefined,
  guestSessionToken: string,
  pageId: string,
  threadManager: ThreadManager,
  ownCommentIds: Set<string>,
  onUnknownThread?: (record: CommentRecord) => void,
): () => void {
  let indicator: { dismiss: () => void, setStatus: (status: string) => void } | null = null;
  let closed = false;
  const timers = new Set<ReturnType<typeof setTimeout>>();
  const close = connectReviewSocket(
    apiBaseUrl ?? "http://localhost:8000",
    guestSessionToken,
    pageId,
    (type, payload) => {
      if (type === "comment.created") {
        if (!isCommentRecord(payload) || ownCommentIds.has(payload.id)) return;
        if (payload.parent_id !== null) {
          threadManager.handleCommentCreated(payload, pageId);
          return;
        }
        const timer = setTimeout(() => {
          timers.delete(timer);
          if (closed || ownCommentIds.has(payload.id)) return;
          threadManager.handleCommentCreated(payload, pageId);
        }, OWN_POST_GRACE_MS);
        timers.add(timer);
        return;
      }

      if (type === "comment.updated") {
        if (!payload?.id) return;
        // Only a real status change is worth telling the author about - an edit to the
        // text or tags arrives through this same event.
        const statusBefore = threadManager.threadMessages.get(payload.id)?.[0]?.status;
        if (isCommentRecord(payload)) {
          const known = threadManager.handleCommentUpdated(payload);
          if (!known && payload.parent_id === null && payload.page_id === pageId) onUnknownThread?.(payload);
        } else if (typeof payload.status === "string") {
          threadManager.handleStatusChanged(payload.id, payload.status);
        }
        if (!ownCommentIds.has(payload.id) || typeof payload.status !== "string") return;
        if (statusBefore === undefined || statusBefore === payload.status) return;
        const label = STATUS_LABELS[payload.status] ?? payload.status;
        showToast(shadow, `Your comment was updated: ${label}`);
        return;
      }

      if (type === "comment.deleted") {
        const commentId: string | undefined = payload?.comment_id;
        if (!commentId) return;
        const parentId: string | null | undefined = payload?.parent_id;
        const topId = parentId ?? commentId;
        threadManager.handleCommentDeleted(commentId, topId);
      }
    },
    (status) => {
      if (status === "connected") {
        if (indicator) {
          indicator.dismiss();
          indicator = null;
        }
      } else if (status === "offline") {
        if (!indicator) indicator = showOfflineIndicator(shadow);
        indicator.setStatus("You are offline. Trying to reconnect...");
      } else if (status === "connecting") {
        if (!indicator) indicator = showOfflineIndicator(shadow);
        indicator.setStatus("Connection lost. Trying to reconnect...");
      }
    },
  );
  return () => {
    closed = true;
    for (const timer of timers) clearTimeout(timer);
    timers.clear();
    close();
    indicator?.dismiss();
    indicator = null;
  };
}
