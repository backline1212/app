import { anchorOffsetPct, resolveAnchorElement, waitForAnchorElement } from "./anchor";
import { trackAnchor, type AnchorBox } from "./position-tracker";
import type { StatusUpdater } from "./status";
import type { AnchorPayload, CommentRecord } from "./types";
import { openCommentView, renderPin, type CommentViewControls, type CommentViewData } from "./ui";

export type PinOffset =
  | { x: number; y: number }
  | ((box: AnchorBox) => { x: number; y: number });

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

// Mirrors apps/web's lib/workflow.ts isClosed(): nothing more is expected of these.
const CLOSED_STATUSES = new Set(["resolved", "wont_fix"]);

/**
 * Owns every piece of per-page thread/pin state that used to live as local variables
 * inside index.ts's init(): the flat comment lists regrouped into threads, the pins
 * rendered for them, and whichever thread panel (if any) is currently open. Grouped
 * here as one factory (rather than several free functions) purely because they all
 * close over the same mutable state.
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
  // Bumped by clearPage, so a pin still waiting for its element to render (below)
  // knows the page it belonged to has gone.
  let generation = 0;

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
  // frame fires, since getBoundingClientRect() only ever gives the corner.
  function trackPinPosition(
    pin: HTMLElement,
    resolve: () => Element | null,
    offset: PinOffset = { x: 0, y: 0 },
  ): () => void {
    return trackAnchor(resolve, (box) => {
      if (box) {
        const shift = typeof offset === "function" ? offset(box) : offset;
        pin.style.left = `${box.x + shift.x}px`;
        pin.style.top = `${box.y + shift.y}px`;
        pin.style.display = "";
      } else {
        pin.style.display = "none";
      }
    });
  }

  /**
   * The outline of a drawn-region comment, sized from the anchor's region_box_pct and
   * following its element the same way a pin does. Null for a point comment.
   */
  function createRegionOverlay(
    anchor: AnchorPayload,
    resolve: () => Element | null,
  ): { overlay: HTMLElement; untrack: () => void } | null {
    const box = anchor.dom_fingerprint.region_box_pct;
    if (anchor.type !== "region" || !box) return null;
    const overlay = document.createElement("div");
    overlay.className = "bl-region";
    shadow.appendChild(overlay);
    const untrack = trackAnchor(resolve, (el) => {
      if (!el) {
        overlay.style.display = "none";
        return;
      }
      overlay.style.display = "";
      overlay.style.left = `${el.x + el.width * box.x}px`;
      overlay.style.top = `${el.y + el.height * box.y}px`;
      overlay.style.width = `${Math.max(4, el.width * box.width)}px`;
      overlay.style.height = `${Math.max(4, el.height * box.height)}px`;
    });
    return { overlay, untrack };
  }

  function applyPinState(topId: string): void {
    const entry = pinsByTopId.get(topId);
    const top = threadMessages.get(topId)?.[0];
    if (!entry || !top) return;
    const closed = CLOSED_STATUSES.has(top.status);
    const active = openThread?.topId === topId;
    entry.pin.classList.toggle("bl-pin-closed", closed);
    entry.pin.classList.toggle("bl-pin-active", active);
    entry.regionOverlay?.classList.toggle("bl-region-closed", closed);
    entry.regionOverlay?.classList.toggle("bl-region-active", active);
  }

  function removeThreadPin(topId: string): void {
    const entry = pinsByTopId.get(topId);
    if (!entry) return;
    entry.untrack();
    entry.pin.remove();
    // Region comments also have an outline on the page - without this it never gets
    // cleaned up when the comment is deleted, leaving a stuck highlight box on the page
    // for the rest of the session.
    entry.regionOverlay?.remove();
    pinsByTopId.delete(topId);
  }

  /**
   * Hands a pin that was drawn for a comment being written over to the comment that
   * post created. A realtime comment.created for that same comment can arrive before
   * the POST's own response and render a pin of its own; that one gives way here, so
   * the page never shows the comment twice.
   */
  function adoptPin(
    topId: string,
    pin: HTMLElement,
    untrack: () => void,
    regionOverlay?: HTMLElement,
  ): void {
    const existing = pinsByTopId.get(topId);
    if (existing && existing.pin !== pin) removeThreadPin(topId);
    pinsByTopId.set(topId, { pin, untrack, regionOverlay });
    applyPinState(topId);
  }

  /**
   * Draws the pin (and region outline) for a comment loaded from the server once its
   * element exists - client-rendered pages often hydrate after this widget starts, so
   * this waits for late DOM content instead of taking one race-prone synchronous shot.
   * `stillCurrent` is asked again once the element appears: the page may have moved on.
   */
  function renderThreadPin(top: CommentRecord, stillCurrent: () => boolean = () => true): void {
    const startedIn = generation;
    void waitForAnchorElement(top.anchor).then((element) => {
      if (!element || startedIn !== generation || !stillCurrent()) return;
      if (pinsByTopId.has(top.id) || !threadMessages.has(top.id)) return;
      const pct = anchorOffsetPct(top.anchor);
      const rect = element.getBoundingClientRect();
      const pin = renderPin(
        shadow,
        rect.left + window.scrollX + rect.width * pct.x,
        rect.top + window.scrollY + rect.height * pct.y,
        top.ticket_number,
      );
      attachPinClickHandler(pin, top.id);
      const resolve = () => resolveAnchorElement(top.anchor);
      const untrackPin = trackPinPosition(pin, resolve, (box) => ({
        x: box.width * pct.x,
        y: box.height * pct.y,
      }));
      const region = createRegionOverlay(top.anchor, resolve);
      pinsByTopId.set(top.id, {
        pin,
        regionOverlay: region?.overlay,
        untrack: () => {
          untrackPin();
          region?.untrack();
        },
      });
      applyPinState(top.id);
    });
  }

  /** A thread this page didn't have yet: from the initial load, or created elsewhere. */
  function addThread(
    top: CommentRecord,
    replies: CommentRecord[] = [],
    stillCurrent?: () => boolean,
  ): void {
    threadMessages.set(top.id, [top, ...replies]);
    renderThreadPin(top, stillCurrent);
  }

  function viewData(thread: CommentRecord[]): CommentViewData {
    const top = thread[0];
    return {
      authorName: top.author_name,
      body: top.body,
      status: top.status,
      tags: top.tags ?? [],
      attachments: top.attachments ?? [],
      pagePath: pagePath(),
      replies: thread.slice(1).map((reply) => ({
        authorName: reply.author_name,
        body: reply.body,
        createdAt: reply.created_at,
      })),
    };
  }

  function refreshOpenThread(topId: string): void {
    if (openThread?.topId !== topId) return;
    const thread = threadMessages.get(topId);
    if (!thread || thread.length === 0) return;
    openThread.controls.setStatus(thread[0].status);
    openThread.controls.update(viewData(thread));
  }

  function closeOpenThread(): void {
    if (!openThread) return;
    const { topId, controls } = openThread;
    openThread = null;
    controls.close();
    applyPinState(topId);
  }

  function openThreadForComment(topId: string, x: number, y: number): void {
    // A previously-open thread never gets an "outside click" to dismiss it when this
    // is triggered from outside the iframe (the dashboard's Comments panel, via
    // postMessage) - clicking through several comments in a row would otherwise just
    // keep stacking new .bl-thread panels on top of each other in the shadow root, each
    // with its own outside-click listener still live. Unconditional (not just "a
    // different thread") so re-triggering the same comment doesn't duplicate its own
    // panel either.
    closeOpenThread();

    const thread = threadMessages.get(topId);
    if (!thread || thread.length === 0) return;

    const updateStatus = statusUpdater();
    const controls = openCommentView(
      shadow,
      x,
      y,
      viewData(thread),
      () => {
        if (openThread?.topId === topId) openThread = null;
        applyPinState(topId);
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
    applyPinState(topId);
  }

  function setThreadStatus(topId: string, status: string): void {
    const list = threadMessages.get(topId);
    if (list && list.length > 0) threadMessages.set(topId, [{ ...list[0], status }, ...list.slice(1)]);
    applyPinState(topId);
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

  /**
   * A comment or reply created elsewhere - the dashboard, another reviewer, another tab.
   * A new thread only belongs here when it was left on this page; a reply only when its
   * thread is one of this page's. Anything already known (this widget's own post) is a
   * no-op.
   */
  function handleCommentCreated(record: CommentRecord, currentPageId: string): void {
    if (record.parent_id === null) {
      if (record.page_id !== currentPageId || threadMessages.has(record.id)) return;
      addThread(record, [], () => record.page_id === currentPageId);
      return;
    }
    const list = threadMessages.get(record.parent_id);
    if (!list || list.some((c) => c.id === record.id)) return;
    const replies = [...list.slice(1), record].sort((a, b) => a.created_at.localeCompare(b.created_at));
    threadMessages.set(record.parent_id, [list[0], ...replies]);
    refreshOpenThread(record.parent_id);
  }

  /**
   * A comment or reply changed elsewhere - its text, tags, status. Returns false when it
   * isn't one this page knows (a thread just made client-visible, say), so the caller can
   * decide whether to load it.
   */
  function handleCommentUpdated(record: CommentRecord): boolean {
    if (record.parent_id === null) {
      const list = threadMessages.get(record.id);
      if (!list) return false;
      threadMessages.set(record.id, [{ ...list[0], ...record }, ...list.slice(1)]);
      applyPinState(record.id);
      refreshOpenThread(record.id);
      return true;
    }
    const list = threadMessages.get(record.parent_id);
    if (!list) return false;
    const index = list.findIndex((c) => c.id === record.id);
    if (index <= 0) return false;
    const next = [...list];
    next[index] = { ...next[index], ...record };
    threadMessages.set(record.parent_id, next);
    refreshOpenThread(record.parent_id);
    return true;
  }

  function attachPinClickHandler(pin: HTMLElement, topId: string): void {
    pin.tabIndex = 0;
    pin.setAttribute("role", "button");
    pin.setAttribute("aria-label", "Open comment thread");

    // Registered inside the shadow root, so document's own "create a new comment"
    // click handler never sees this click directly - Shadow DOM retargets it to the
    // shadow host first (index.ts's `target.closest("[data-backline-root]")` check),
    // which is what keeps clicking a pin from also opening a fresh composer.
    pin.addEventListener("click", (event) => {
      event.stopPropagation();
      // Read the pin's own current position rather than a coordinate captured back
      // when the pin was first created - trackPinPosition keeps it live, so this is
      // always where the pin visually is right now, moving target included.
      const x = parseFloat(pin.style.left);
      const y = parseFloat(pin.style.top);
      openThreadForComment(topId, x, y);
      // Inside the dashboard's canvas iframe, tell the dashboard which comment was
      // opened so its Comments drawer can show it (ProjectOverviewPage). "*" for the
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
  // with deletes made elsewhere (the dashboard, another tab), and with a thread being
  // made team-only, which leaves a guest's view the same way.
  function handleCommentDeleted(commentId: string, topId: string): void {
    if (commentId === topId) {
      if (openThread?.topId === topId) closeOpenThread();
      removeThreadPin(topId);
      threadMessages.delete(topId);
      return;
    }
    const list = threadMessages.get(topId);
    if (!list) return;
    threadMessages.set(topId, list.filter((c) => c.id !== commentId));
    refreshOpenThread(topId);
  }

  // An SPA route change moves this widget to a different page without a reload
  // (index.ts's route follower), and every pin and thread here belongs to the page left.
  function clearPage(): void {
    generation += 1;
    closeOpenThread();
    for (const topId of [...pinsByTopId.keys()]) removeThreadPin(topId);
    threadMessages.clear();
  }

  return {
    threadMessages,
    pinsByTopId,
    trackPinPosition,
    createRegionOverlay,
    removeThreadPin,
    adoptPin,
    addThread,
    clearPage,
    openThreadForComment,
    closeOpenThread,
    attachPinClickHandler,
    handleCommentCreated,
    handleCommentUpdated,
    handleCommentDeleted,
    handleStatusChanged,
  };
}

export type ThreadManager = ReturnType<typeof createThreadManager>;
