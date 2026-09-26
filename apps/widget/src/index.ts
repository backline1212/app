import { createApiClient, WidgetApiError } from "./api-client";
import {
  anchorPointFor,
  computeAnchor,
  resolveAnchorElement,
  waitForAnchorElement,
} from "./anchor";
import { uploadAttachment, uploadScreenshot } from "./attachment-upload";
import { connectDashboardStatusBridge } from "./dashboard-bridge";
import { ensureGuestSession, requestDashboardDisplayName } from "./guest-session";
import { registerCurrentPage, realPageUrl, submitPageSnapshot } from "./page-registration";
import { wireRealtimeUpdates } from "./realtime";
import { captureScreenshot } from "./screenshot";
import { createThreadManager } from "./thread-manager";
import type { BacklineConfig, CommentRecord } from "./types";
import {
  createShadowRoot,
  openComposer,
  promptForName,
  renderPin,
  showTooltip,
  type ComposerDetails,
} from "./ui";
import { parseUserAgent } from "./user-agent";
import { setupRegionDrawer } from "./region-drawer";

type WidgetMode = "browse" | "comment" | "draw";

// Retries the few init requests commenting cannot start without, on failures that
// are worth a second try (network, rate limit, server hiccup) - not on a 4xx that
// will only repeat, like a revoked share link.
async function withRetry<T>(run: () => Promise<T>, delays = [800, 2500]): Promise<T> {
  for (let attempt = 0; ; attempt += 1) {
    try {
      return await run();
    } catch (error) {
      const status = error instanceof WidgetApiError ? error.status : 0;
      const retryable = status === 0 || status === 429 || status >= 500;
      if (!retryable || attempt >= delays.length) throw error;
      await new Promise((resolve) => setTimeout(resolve, delays[attempt]));
    }
  }
}

async function init(config: BacklineConfig): Promise<void> {
  // Set once ensureGuestSession resolves below - the api client is constructed first
  // since ensureGuestSession itself needs it to call /guest-sessions, before any guest
  // token exists yet. getAuthHeader reads this variable by closure reference on every
  // request, not its value at construction time, so requests before/after that point
  // pick up the right header automatically.
  let guestToken: string | null = null;
  const api = createApiClient(config.apiBaseUrl, () =>
    guestToken ? { "X-Guest-Session": guestToken } : ({} as Record<string, string>),
  );
  const shadow = createShadowRoot();

  // The dashboard's own canvas preview (ProjectOverviewPage) toggles between "Browse"
  // (the site behaves normally - existing pins are still visible/clickable for
  // context, but nothing invites or accepts a new comment), "Comment" (this widget's
  // full, normal behavior) and "Draw". `blMode` carries only the mode this page was
  // *loaded* with; every later switch arrives over postMessage below, because
  // reloading the iframe to change a mode threw away all in-page state (pins, open
  // threads, an unsent composer, the reviewer's scroll position) and visibly
  // re-fetched the whole site on each toggle.
  const modeParams = new URLSearchParams(window.location.search);
  const blMode = modeParams.get("blMode");
  // Real guest reviewers (the /review/:shareToken flow, redirected straight to the
  // proxied site) never carry a blMode param at all - only the dashboard's own canvas
  // iframe sets one, always to one of "browse"/"comment"/"draw" (ProjectOverviewPage's
  // iframeSearch.set("blMode", ...)). Comment mode has to stay the default for that
  // absent case, same as before "draw" existed - flipping this to an allowlist
  // (`=== "comment"`) would silently turn commenting off for every real guest
  // reviewer, since their URL never says "comment" explicitly.
  let currentMode: WidgetMode = blMode === "draw" ? "draw" : blMode === "browse" ? "browse" : "comment";
  // Replaced at the end of init with the real switcher, once there's something to
  // switch. init() is async (guest session, page registration, existing comments), and
  // the dashboard re-sends the mode on every iframe load, so a mode can genuinely
  // arrive before this widget is wired up - until then it's just recorded, and the
  // wiring below applies whatever the latest one turned out to be.
  let applyMode = (next: WidgetMode) => {
    currentMode = next;
  };
  window.addEventListener("message", (event) => {
    if (event.data?.type !== "backline:set-mode") return;
    const next: unknown = event.data.mode;
    if (next !== "browse" && next !== "comment" && next !== "draw") return;
    if (next === currentMode) return;
    applyMode(next);
  });

  // Connected this early for the same reason as the mode listener above: its question
  // to the dashboard is answered while the rest of init is still awaiting the API.
  const statusUpdater = connectDashboardStatusBridge();

  // The dashboard's BrowserMenu ("CAPTURE AS") lets a team member manually tag which
  // browser a comment should be recorded against, for QA scenarios where they can't
  // actually load the real browser locally - it reloads this same iframe (see the
  // blMode comment above for why that's the only channel) with `blBrowser` set.
  // Falls back to the real navigator.userAgent detection below when absent, which is
  // always the case for guest reviewers on the client's real site (no dashboard parent
  // ever sets this param there).
  const browserOverride = modeParams.get("blBrowser");

  // blMode is only ever set by the dashboard's canvas iframe (see above), so only there
  // is a signed-in member's name available to skip the prompt with.
  const guest = await ensureGuestSession(api, config.shareToken, async () => {
    const dashboardName = blMode ? await requestDashboardDisplayName() : null;
    return dashboardName ?? promptForName(shadow);
  });
  guestToken = guest.guestSessionToken;

  // We don't yet know the project - it's resolved from the share link server-side via
  // the guest token itself (every endpoint the guest calls checks their share link's
  // project, core/actor_access.py). The widget still needs it for the /uploads call's
  // request body, so it's resolved once here via the public review-resolve endpoint.
  const resolved = await withRetry(() =>
    api.request<{ project_id: string; target_origin: string }>(`/api/v1/review/${config.shareToken}`),
  );
  const projectId = resolved.project_id;

  const pageUrl = realPageUrl(config.shareToken, resolved.target_origin);
  // `let`: a single-page app's own route changes move this widget to another page
  // without a reload - see the route follower at the end of init.
  let pageId = await withRetry(() => registerCurrentPage(api, projectId, pageUrl));
  // Only feeds deploy re-anchoring, never needed to leave a comment - so it runs in the
  // background and a failure (rate limit, a page too large to store) is ignored, the
  // same as the route follower below. Awaited, one failed snapshot aborted init before
  // the click handler existed and commenting silently never switched on.
  void submitPageSnapshot(api, pageId).catch(() => undefined);

  // Tells the dashboard (if it's embedding this in the canvas iframe) which page is
  // currently loaded, so its Comments panel can offer "show comments on current page
  // only." "*" rather than a specific target origin: this script is served from
  // whatever proxy origin the project's share link points at, so it has no fixed,
  // known dashboard origin to address - and a page id isn't sensitive.
  window.parent.postMessage({ type: "backline:page-registered", pageId }, "*");

  // Never invites a comment that clicking wouldn't actually accept - and it's shown
  // again each time the reviewer switches back into comment mode, so what the composer
  // and the region drawer hold has to be this stable handle rather than one tooltip.
  let tooltipHandle: { dismiss: () => void } | null = null;
  const tooltip = {
    dismiss: () => {
      tooltipHandle?.dismiss();
      tooltipHandle = null;
    },
  };

  // The real site's path for this page (not the proxy's), shown in the comment cards'
  // header pill. Computed on each call, since an SPA can change the path without
  // reloading this widget.
  const currentPagePath = (): string => {
    try {
      return new URL(realPageUrl(config.shareToken, resolved.target_origin)).pathname;
    } catch {
      // keep the proxied path if the target origin isn't a parseable URL
      return window.location.pathname;
    }
  };

  // threadMessages/pinsByTopId (the per-page thread + pin state) and the handlers that
  // read/mutate them all live in thread-manager.ts now - see its own comments for the
  // reasoning behind each piece. index.ts still owns the DOM events (clicks,
  // postMessage, websocket) that drive them.
  const threadManager = createThreadManager({ shadow, pagePath: currentPagePath, statusUpdater });
  const { threadMessages, pinsByTopId, trackPinPosition, openThreadForComment, attachPinClickHandler } =
    threadManager;

  // Existing comments on this page (guest-accessible, already server-side layer-filtered)
  // get a pin each. Client-rendered pages often hydrate after this widget starts, so
  // anchor resolution waits for late DOM content instead of taking one race-prone
  // synchronous shot.
  const loadPagePins = async (forPageId: string): Promise<void> => {
    const existingComments = await api.request<CommentRecord[]>(
      `/api/v1/pages/${forPageId}/comments`,
    );
    // A later route change may have moved the widget on while this was in flight.
    if (forPageId !== pageId) return;
    const topLevelComments = existingComments.filter((c) => c.parent_id === null);
    for (const top of topLevelComments) {
      const replies = existingComments
        .filter((c) => c.parent_id === top.id)
        .sort((a, b) => a.created_at.localeCompare(b.created_at));
      threadMessages.set(top.id, [top, ...replies]);

      void waitForAnchorElement(top.anchor).then((element) => {
        // A route change can finish while this anchor is waiting to render.
        if (!element || forPageId !== pageId || pinsByTopId.has(top.id)) return;
        const point = anchorPointFor(element, top.anchor);
        const pct = top.anchor.dom_fingerprint.click_offset_pct ?? { x: 0, y: 0 };
        const pin = renderPin(shadow, point.x, point.y);
        attachPinClickHandler(pin, top.id);
        const untrack = trackPinPosition(
          pin,
          () => resolveAnchorElement(top.anchor),
          (box) => ({ x: box.width * pct.x, y: box.height * pct.y }),
        );
        pinsByTopId.set(top.id, { pin, untrack });
      });
    }
  };
  await loadPagePins(pageId);

  // The dashboard's Comments panel (outside this iframe, cross-origin - the canvas is
  // served from the API's own origin, not the dashboard's) can't reach into this page's
  // DOM directly, so "jump to where I left this comment" has to go through postMessage
  // instead. Re-resolves the anchor fresh rather than relying on an already-rendered
  // pin, since a comment whose pin never rendered (position-tracker.ts's
  // intersectsViewport hid it as off-screen, or the target simply hadn't loaded yet at
  // init time) can still genuinely exist on the page - "no pin visible right now" was
  // never "the comment is gone."
  window.addEventListener("message", (event) => {
    if (event.data?.type !== "backline:scroll-to-comment") return;
    const topId = event.data.commentId as string | undefined;
    const messages = topId ? threadMessages.get(topId) : undefined;
    if (!topId || !messages || messages.length === 0) return;

    const requestedPageId = pageId;
    const anchor = messages[0].anchor;
    void waitForAnchorElement(anchor).then((element) => {
      if (!element || requestedPageId !== pageId || !threadMessages.has(topId)) return;
      element.scrollIntoView({ behavior: "smooth", block: "center" });
      // Give the scroll (and position-tracker's own viewport re-check) a moment to
      // settle before opening the thread.
      setTimeout(() => {
        const pin = pinsByTopId.get(topId)?.pin;
        const point = anchorPointFor(element, anchor);
        const x = pin ? parseFloat(pin.style.left) : point.x;
        const y = pin ? parseFloat(pin.style.top) : point.y;
        openThreadForComment(topId, x, y);
      }, 400);
    });
  });

  // What the composer's header and facts row show.
  const composerDetails = (regionSize?: string): ComposerDetails => ({
    authorName: guest.displayName,
    pagePath: currentPagePath(),
    browser: browserOverride ?? parseUserAgent(navigator.userAgent).browser,
    regionSize,
  });

  const ownCommentIds = new Set<string>();
  let stopRealtime = wireRealtimeUpdates(
    shadow,
    config.apiBaseUrl,
    guest.guestSessionToken,
    pageId,
    threadManager,
    ownCommentIds,
  );

  // Everything above this point is mode-independent (pins for existing comments,
  // realtime updates, scroll-to-comment) and stays wired in every mode. Only what
  // *accepts* a new comment is switched here, so toggling Browse/Comment/Draw no
  // longer needs a reload: the region drawer is set up and torn down in place, and the
  // click handler below is attached once and checks the live mode.
  let regionTeardown: (() => void) | null = null;
  applyMode = (next: WidgetMode) => {
    currentMode = next;
    regionTeardown?.();
    regionTeardown = null;
    tooltip.dismiss();
    if (next === "comment") tooltipHandle = showTooltip(shadow);
    if (next === "draw") {
      regionTeardown = setupRegionDrawer({
        shadow,
        api,
        projectId,
        pageId,
        browserOverride,
        threadManager,
        ownCommentIds,
        tooltip,
        composerDetails,
      });
    }
  };
  applyMode(currentMode);

  document.addEventListener("click", (event) => {
    if (currentMode !== "comment") return;
    const target = event.target as Element | null;
    if (!target || target.closest("[data-backline-root]")) return;

    // Commenting on a link or a submit button must not also trigger its native
    // action - left unprevented, clicking a nav link (or "Book a call", or anything
    // else with an href/type="submit") to leave feedback on it navigates the iframe
    // away from the page entirely. That tears down this whole widget instance (a
    // different page load - potentially a different origin, which the browser can
    // outright block and leave the frame blank) mid-flight, silently dropping
    // in-memory thread/pin state for any comment created moments earlier in the same
    // session. This was found via a genuinely live "Learn more" link on
    // https://example.com pointing at iana.org.
    event.preventDefault();

    // pageX/pageY (document-relative, scroll-inclusive), not clientX/clientY
    // (viewport-relative) - renderPin/openComposer are position: absolute now
    // precisely so the pin/composer scroll with the page instead of drifting off the
    // clicked element the moment the reviewer scrolls.
    const x = event.pageX;
    const y = event.pageY;
    const pin = renderPin(shadow, x, y);
    pin.classList.add("bl-pin-ghost");
    // Tracks from the moment the pin exists (composing included), using the exact
    // clicked element directly - no anchor/selector resolution needed, this element
    // reference is already unambiguous. The offset preserves exactly where within the
    // element the reviewer clicked, rather than snapping to the element's corner the
    // moment tracking's first frame runs.
    const targetRect = target.getBoundingClientRect();
    const offsetPct = {
      x: targetRect.width > 0 ? (x - (targetRect.left + window.scrollX)) / targetRect.width : 0,
      y: targetRect.height > 0 ? (y - (targetRect.top + window.scrollY)) / targetRect.height : 0,
    };
    const untrack = trackPinPosition(pin, () => target, (box) => ({
      x: box.width * offsetPct.x,
      y: box.height * offsetPct.y,
    }));

    // M-08 idempotency: generated once per pin/composer, not inside the submit
    // callback, so a future retry affordance on this same composer (UX-AUD-027 is
    // still pending) can resend the identical key instead of minting a new one -
    // the backend replays the original comment for a repeated key rather than
    // creating a duplicate (comments/repository.py's find_by_client_request_id).
    const clientRequestId = crypto.randomUUID();
    // The page clicked on, even if an SPA routes elsewhere while the composer is open.
    const commentPageId = pageId;

    const controls = openComposer(
      shadow,
      x,
      y,
      async ({ body, attachments, tags }) => {
        controls.setStatus("Capturing anchor + screenshot...");

        const anchor = await computeAnchor(target, x, y);
        const screenshotBlob = await captureScreenshot();

        let screenshotKey: string | null = null;
        if (screenshotBlob) {
          controls.setStatus("Uploading screenshot...");
          screenshotKey = await uploadScreenshot(
            api,
            projectId,
            screenshotBlob,
          );
        }

        controls.setStatus("Posting comment...");
        const { browser: detectedBrowser, os, device_type: deviceType } = parseUserAgent(navigator.userAgent);
        const browser = browserOverride ?? detectedBrowser;

        try {
          const created = await api.request<CommentRecord>(`/api/v1/pages/${commentPageId}/comments`, {
            method: "POST",
            body: JSON.stringify({
              body,
              anchor,
              context: {
                browser,
                os,
                device_type: deviceType,
                viewport: { width: window.innerWidth, height: window.innerHeight },
                url: window.location.href,
              },
              screenshot_key: screenshotKey,
              capture_status: screenshotKey ? "ok" : "failed",
              attachments,
              tags,
              client_request_id: clientRequestId,
            }),
          });
          pin.classList.remove("bl-pin-ghost");
          ownCommentIds.add(created.id);
          threadMessages.set(created.id, [created]);
          pinsByTopId.set(created.id, { pin, untrack });
          attachPinClickHandler(pin, created.id);
          tooltip.dismiss();
          controls.setStatus("Comment posted.");
        } catch {
          controls.setStatus("Could not post your comment. Please try again.");
        }
      },
      () => {
        untrack();
        pin.remove();
      },
      (file) => uploadAttachment(api, projectId, file),
      composerDetails(),
    );
  });

  // A single-page app navigates with history.pushState and never reloads this script,
  // so without this every comment after the first in-app navigation (signing in, say)
  // would land on - and show the pins of - the page the reviewer started on. Polled
  // rather than hooked: this script runs last, and a router that kept its own reference
  // to history.pushState from before would never pass through a hook installed here.
  // Compared as the same URL registration uses, so a query-string change is a new page
  // exactly when a full load of that URL would be (backend pages/url_normalize.py).
  let followedUrl = pageUrl;
  let seenUrl = pageUrl;
  let routeTimer: ReturnType<typeof setTimeout> | null = null;
  const followRoute = async (): Promise<void> => {
    const nextUrl = realPageUrl(config.shareToken, resolved.target_origin);
    if (nextUrl === followedUrl) return;
    followedUrl = nextUrl;
    const nextPageId = await registerCurrentPage(api, projectId, nextUrl);
    if (nextUrl !== followedUrl) return; // superseded by a later navigation
    pageId = nextPageId;
    threadManager.clearPage();
    stopRealtime();
    stopRealtime = wireRealtimeUpdates(
      shadow,
      config.apiBaseUrl,
      guest.guestSessionToken,
      pageId,
      threadManager,
      ownCommentIds,
    );
    window.parent.postMessage({ type: "backline:page-registered", pageId }, "*");
    // The region drawer is bound to a page id when it's set up.
    if (currentMode === "draw") applyMode(currentMode);
    await loadPagePins(pageId);
    await submitPageSnapshot(api, pageId).catch(() => undefined);
  };
  window.setInterval(() => {
    const now = realPageUrl(config.shareToken, resolved.target_origin);
    if (now === seenUrl) return;
    seenUrl = now;
    if (routeTimer) clearTimeout(routeTimer);
    // Once the new route has had a moment to render, so its anchors exist to pin to.
    routeTimer = setTimeout(() => {
      routeTimer = null;
      followRoute().catch(() => {
        // Offline or rate-limited: try this URL again shortly rather than never.
        followedUrl = "";
        setTimeout(() => {
          seenUrl = "";
        }, 5000);
      });
    }, 400);
  }, 300);
}

declare global {
  interface Window {
    Backline: { init: typeof safeInit };
  }
}

// The proxy's bootstrap calls init() without handling its promise, so a failure here
// used to vanish: the page just ignored clicks. Say so in the console and tell the
// dashboard canvas, which then stops claiming "click the page to place a pin".
function safeInit(config: BacklineConfig): Promise<void> {
  return init(config).catch((error: unknown) => {
    const message = error instanceof Error ? error.message : String(error);
    console.error("[Backline] Commenting could not start:", error);
    if (window.parent !== window) {
      window.parent.postMessage({ type: "backline:widget-error", message }, "*");
    }
  });
}

window.Backline = { init: safeInit };
