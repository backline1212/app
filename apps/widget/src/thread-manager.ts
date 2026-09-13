import type { createApiClient } from "./api-client";
import { uploadAttachment } from "./attachment-upload";
import { trackAnchor } from "./position-tracker";
import type { CommentRecord } from "./types";
import { openThreadView, type ThreadViewMessage } from "./ui";

export interface ThreadManagerOptions {
  shadow: ShadowRoot;
  api: ReturnType<typeof createApiClient>;
  projectId: string;
  // The current actor's own id - a guest_session_id for the guest widget, or a member
  // user_id for the browser extension's content script (Phase 4, browser-extension
  // plan). Compared against comment.author_id regardless of author_type: "did I create
  // this" is the same question either way, and the two id spaces never collide.
  myActorId: string | null;
}

/**
 * Owns every piece of per-page thread/pin state that used to live as local variables
 * inside index.ts's init(): the flat comment lists regrouped into threads, the pins
 * rendered for them, and whichever thread panel (if any) is currently open. Grouped
 * here as one factory (rather than several free functions) purely because they all
 * close over the same mutable state - this is a mechanical extraction of that existing
 * closure, not a behavior change.
 */
export function createThreadManager({
  shadow,
  api,
  projectId,
  myActorId,
}: ThreadManagerOptions) {
  // Every top-level comment id maps to [top, ...replies] (sorted oldest-first) - the
  // full flat list the backend returns per page, regrouped here since the widget is
  // the one place that needs to render it as threads rather than a flat feed.
  const threadMessages = new Map<string, CommentRecord[]>();
  const pinsByTopId = new Map<
    string,
    { pin: HTMLElement; untrack: () => void; regionOverlay?: HTMLElement }
  >();
  let openThread: { topId: string; controls: ReturnType<typeof openThreadView> } | null = null;

  // Keeps a pin glued to its target element even while the element itself moves - a
  // CSS transform/animation-driven carousel or marquee, say - independent of page
  // scroll (already handled by position:absolute + pageX/pageY, see ui.ts). `resolve`
  // returns the live element to follow; hides the pin entirely if it can't currently be
  // found (removed from the DOM, off in a part of an infinite-loop carousel that
  // doesn't exist as a real node right now) rather than leaving it at a stale position
  // that now belongs to something else.
  //
  // `offset` is added to the element's own top-left corner on every update - without
  // it, a pin created partway through a large element (e.g. clicking the middle of a
  // tall card) would visibly jump to that element's corner the instant tracking's first
  // frame fires, since getBoundingClientRect() only ever gives the corner. For a
  // brand-new pin this is the click point relative to the element, captured once at
  // click time; for one loaded from the server (no stored click offset - the backend's
  // anchor is just a selector, not a pixel), it defaults to the corner, same as before
  // this tracking existed.
  function trackPinPosition(
    pin: HTMLElement,
    resolve: () => Element | null,
    offset: { x: number; y: number } = { x: 0, y: 0 },
  ): () => void {
    return trackAnchor(resolve, (point) => {
      if (point) {
        pin.style.left = `${point.x + offset.x}px`;
        pin.style.top = `${point.y + offset.y}px`;
        pin.style.display = "";
      } else {
        pin.style.display = "none";
      }
    });
  }

  function authorLabel(comment: CommentRecord): string {
    if (comment.author_id === myActorId) return "You";
    return comment.author_type === "member" ? "Team" : "Guest";
  }

  function canDeleteComment(comment: CommentRecord): boolean {
    return comment.author_id === myActorId;
  }

  function buildMessages(topId: string): ThreadViewMessage[] {
    return (threadMessages.get(topId) ?? []).map((comment) => ({
      id: comment.id,
      body: comment.body,
      authorLabel: authorLabel(comment),
      createdAt: comment.created_at,
      canDelete: canDeleteComment(comment),
      attachments: comment.attachments,
    }));
  }

  function removeThreadPin(topId: string): void {
    const entry = pinsByTopId.get(topId);
    if (!entry) return;
    entry.untrack();
    entry.pin.remove();
    // Region comments (region-drawer.ts) additionally leave a draft rectangle overlay
    // on the live page - without this it never gets cleaned up when the comment is
    // deleted, leaving a stuck highlight box on the page for the rest of the session.
    entry.regionOverlay?.remove();
    pinsByTopId.delete(topId);
  }

  function openThreadForComment(topId: string, x: number, y: number): void {
    // A previously-open thread never gets an "outside click" to dismiss it when this
    // is triggered from outside the iframe (the dashboard's Comments panel, via
    // postMessage below) - clicking through several comments in a row would otherwise
    // just keep stacking new .bl-thread panels on top of each other in the shadow
    // root, each with its own outside-click listener still live. Unconditional (not
    // just "a different thread") so re-triggering the same comment doesn't duplicate
    // its own panel either.
    if (openThread) {
      openThread.controls.close();
      openThread = null;
    }

    const topComment = threadMessages.get(topId)?.[0];
    const canDeleteThread = topComment ? canDeleteComment(topComment) : false;

    const controls = openThreadView(shadow, x, y, buildMessages(topId), canDeleteThread, {
      onClose: () => {
        if (openThread?.topId === topId) openThread = null;
      },
      onReply: async (body, attachments) => {
        // M-08 idempotency: one key per reply attempt (each call here is a distinct
        // logical reply, unlike the composer's one-key-per-pin case above).
        const clientRequestId = crypto.randomUUID();
        const created = await api.request<CommentRecord>(`/api/v1/comments/${topId}/replies`, {
          method: "POST",
          body: JSON.stringify({ body, layer: "client", attachments, client_request_id: clientRequestId }),
        });
        threadMessages.set(topId, [...(threadMessages.get(topId) ?? []), created]);
        controls.setMessages(buildMessages(topId));
      },
      onEditMessage: async (id, body) => {
        const updated = await api.request<CommentRecord>(`/api/v1/comments/${id}/body`, {
          method: "PATCH",
          body: JSON.stringify({ body }),
        });
        threadMessages.set(
          topId,
          (threadMessages.get(topId) ?? []).map((c) => (c.id === id ? updated : c)),
        );
        controls.setMessages(buildMessages(topId));
      },
      onDeleteMessage: async (id) => {
        await api.request(`/api/v1/comments/${id}`, {
          method: "DELETE",
        });
        threadMessages.set(topId, (threadMessages.get(topId) ?? []).filter((c) => c.id !== id));
        if (id === topId) {
          removeThreadPin(topId);
          controls.close();
          openThread = null;
          return;
        }
        controls.setMessages(buildMessages(topId));
      },
      onDeleteThread: async () => {
        await api.request(`/api/v1/comments/${topId}/thread`, {
          method: "DELETE",
        });
        threadMessages.delete(topId);
        removeThreadPin(topId);
        controls.close();
        openThread = null;
      },
    }, (file) => uploadAttachment(api, projectId, file));
    openThread = { topId, controls };
  }

  function attachPinClickHandler(pin: HTMLElement, topId: string): void {
    pin.tabIndex = 0;
    pin.setAttribute("role", "button");
    pin.setAttribute("aria-label", "Open comment thread");

    // Registered inside the shadow root, so document's own "create a new comment"
    // click handler below never sees this click directly - Shadow DOM retargets it to
    // the shadow host first (index.ts's existing `target.closest("[data-backline-root]")`
    // check), which is what already keeps clicking a pin from also opening a fresh
    // composer, with zero extra code needed there.
    pin.addEventListener("click", (event) => {
      event.stopPropagation();
      // Read the pin's own current position rather than a coordinate captured back
      // when the pin was first created - trackPinPosition keeps it live, so this is
      // always where the pin visually is right now, moving target included.
      const x = parseFloat(pin.style.left);
      const y = parseFloat(pin.style.top);
      openThreadForComment(topId, x, y);
    });
    pin.addEventListener("keydown", (event) => {
      if (event.key === "Enter" || event.key === " ") {
        event.preventDefault();
        pin.click();
      }
    });
  }

  // The comment.deleted branch of the realtime handler (realtime.ts) keeps this page's
  // thread state - pins, and any currently-open thread panel - in sync with deletes
  // made elsewhere (another tab, or the same delete cascading from a "delete thread"
  // call).
  function handleCommentDeleted(commentId: string, topId: string): void {
    const list = threadMessages.get(topId);
    if (list) threadMessages.set(topId, list.filter((c) => c.id !== commentId));

    if (commentId === topId) {
      removeThreadPin(topId);
      if (openThread?.topId === topId) {
        openThread.controls.close();
        openThread = null;
      }
    } else if (openThread?.topId === topId) {
      openThread.controls.setMessages(buildMessages(topId));
    }
  }

  return {
    threadMessages,
    pinsByTopId,
    trackPinPosition,
    buildMessages,
    removeThreadPin,
    openThreadForComment,
    attachPinClickHandler,
    handleCommentDeleted,
  };
}

export type ThreadManager = ReturnType<typeof createThreadManager>;
