import { trackAnchor } from "./position-tracker";
import type { StatusUpdater } from "./status";
import type { CommentRecord } from "./types";
import { openCommentView, type CommentViewControls } from "./ui";

export interface ThreadManagerOptions {
  shadow: ShadowRoot;
  // The page path shown in an opened comment's header pill - the real site's path, not
  // the proxy's. Defaults to this document's own path.
  pagePath?: () => string;
  // How an opened comment's status gets changed, or null when this viewer can't change
  // it (the card then shows the status read-only). Asked each time a card opens rather
  // than once up front: the guest widget only learns it's inside the dashboard - and so
  // may offer the change - once the dashboard answers (dashboard-bridge.ts).
  statusUpdater?: () => StatusUpdater | null;
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
  pagePath = () => window.location.pathname,
  statusUpdater = () => null,
}: ThreadManagerOptions) {
  // Every top-level comment id maps to [top, ...replies] (sorted oldest-first) - the
  // full flat list the backend returns per page, regrouped here since the widget is
  // the one place that needs to render it as threads rather than a flat feed.
  const threadMessages = new Map<string, CommentRecord[]>();
  const pinsByTopId = new Map<
    string,
    { pin: HTMLElement; untrack: () => void; regionOverlay?: HTMLElement }
  >();
  let openThread: { topId: string; controls: CommentViewControls } | null = null;

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
    if (!topComment) return;

    const updateStatus = statusUpdater();
    const controls = openCommentView(
      shadow,
      x,
      y,
      {
        authorName: topComment.author_name,
        body: topComment.body,
        status: topComment.status,
        tags: topComment.tags ?? [],
        attachments: topComment.attachments,
        pagePath: pagePath(),
      },
      () => {
        if (openThread?.topId === topId) openThread = null;
      },
      updateStatus
        ? async (status) => {
            const saved = await updateStatus(topId, status);
            setThreadStatus(topId, saved);
            return saved;
          }
        : null,
    );
    openThread = { topId, controls };
  }

  function setThreadStatus(topId: string, status: string): void {
    const list = threadMessages.get(topId);
    if (list && list.length > 0) threadMessages.set(topId, [{ ...list[0], status }, ...list.slice(1)]);
  }

  // The comment.updated branch of the realtime handler (realtime.ts): a status changed
  // elsewhere (the dashboard, another tab) shows up on the next open of that comment,
  // and straight away on its card if it's the one open right now. Only a thread's top
  // comment carries the status the card shows, so updates to replies change nothing.
  function handleStatusChanged(commentId: string, status: string): void {
    if (!threadMessages.has(commentId)) return;
    setThreadStatus(commentId, status);
    if (openThread?.topId === commentId) openThread.controls.setStatus(status);
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
      // Inside the dashboard's canvas iframe, tell the dashboard which comment was
      // opened so its Comments drawer can select it (ProjectOverviewPage). "*" for the
      // same reason as index.ts's backline:page-registered message - a comment id isn't
      // sensitive, and this script has no fixed dashboard origin to address.
      if (window.parent !== window) {
        window.parent.postMessage({ type: "backline:comment-opened", commentId: topId }, "*");
      }
    });
    pin.addEventListener("keydown", (event) => {
      if (event.key === "Enter" || event.key === " ") {
        event.preventDefault();
        pin.click();
      }
    });
  }

  // The comment.deleted branch of the realtime handler (realtime.ts) keeps this page's
  // thread state - pins, and the open comment card if it's the one deleted - in sync
  // with deletes made elsewhere (the dashboard, another tab).
  function handleCommentDeleted(commentId: string, topId: string): void {
    const list = threadMessages.get(topId);
    if (list) threadMessages.set(topId, list.filter((c) => c.id !== commentId));

    if (commentId === topId) {
      removeThreadPin(topId);
      if (openThread?.topId === topId) {
        openThread.controls.close();
        openThread = null;
      }
    }
  }

  return {
    threadMessages,
    pinsByTopId,
    trackPinPosition,
    removeThreadPin,
    openThreadForComment,
    attachPinClickHandler,
    handleCommentDeleted,
    handleStatusChanged,
  };
}

export type ThreadManager = ReturnType<typeof createThreadManager>;
