import { createApiClient } from "./api-client";
import { anchorPointFor, computeAnchor, resolveAnchorElement } from "./anchor";
import { uploadAttachment, uploadScreenshot } from "./attachment-upload";
import { ensureGuestSession } from "./guest-session";
import { decodeGuestSessionId } from "./jwt";
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
} from "./ui";
import { parseUserAgent } from "./user-agent";
import { setupRegionDrawer } from "./region-drawer";

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
  // context, but nothing invites or accepts a new comment) and "Comment" (this
  // widget's full, normal behavior) by reloading the iframe with this query param -
  // there's no other channel to reach into an already-loaded proxied page's widget
  // instance, since the widget script is baked into the proxy's HTML response
  // server-side, not passed live init() args from the parent frame.
  const modeParams = new URLSearchParams(window.location.search);
  const blMode = modeParams.get("blMode");
  // Real guest reviewers (the /review/:shareToken flow, redirected straight to the
  // proxied site) never carry a blMode param at all - only the dashboard's own canvas
  // iframe sets one, always to one of "browse"/"comment"/"draw" (ProjectOverviewPage's
  // iframeSearch.set("blMode", mode)). Comment mode has to stay the default for that
  // absent case, same as before "draw" existed - flipping this to an allowlist
  // (`=== "comment"`) would silently turn commenting off for every real guest
  // reviewer, since their URL never says "comment" explicitly.
  const drawingEnabled = blMode === "draw";
  const commentingEnabled = !drawingEnabled && blMode !== "browse";

  // The dashboard's BrowserMenu ("CAPTURE AS") lets a team member manually tag which
  // browser a comment should be recorded against, for QA scenarios where they can't
  // actually load the real browser locally - it reloads this same iframe (see the
  // blMode comment above for why that's the only channel) with `blBrowser` set.
  // Falls back to the real navigator.userAgent detection below when absent, which is
  // always the case for guest reviewers on the client's real site (no dashboard parent
  // ever sets this param there).
  const browserOverride = modeParams.get("blBrowser");

  const guest = await ensureGuestSession(api, config.shareToken, () => promptForName(shadow));
  guestToken = guest.guestSessionToken;

  // We don't yet know the project - it's resolved from the share link server-side via
  // the guest token itself (every endpoint the guest calls checks their share link's
  // project, core/actor_access.py). The widget still needs it for the /uploads call's
  // request body, so it's resolved once here via the public review-resolve endpoint.
  const resolved = await api.request<{ project_id: string; target_origin: string }>(
    `/api/v1/review/${config.shareToken}`,
  );
  const projectId = resolved.project_id;

  const pageUrl = realPageUrl(config.shareToken, resolved.target_origin);
  const pageId = await registerCurrentPage(api, projectId, pageUrl);
  await submitPageSnapshot(api, pageId);

  // Tells the dashboard (if it's embedding this in the canvas iframe) which page is
  // currently loaded, so its Comments panel can offer "show comments on current page
  // only." "*" rather than a specific target origin: this script is served from
  // whatever proxy origin the project's share link points at, so it has no fixed,
  // known dashboard origin to address - and a page id isn't sensitive.
  window.parent.postMessage({ type: "backline:page-registered", pageId }, "*");

  // Never invites a comment that clicking wouldn't actually accept.
  const tooltip = commentingEnabled ? showTooltip(shadow) : { dismiss: () => {} };

  // The widget only ever acts as a guest (members review via the dashboard's
  // CommentThreadPanel, not this SDK) - decoding our own guest session's `sub` here is
  // just for "is this comment mine" UI gating (show/hide delete affordances). The
  // backend re-checks authorship itself on every delete/reply call regardless.
  const myGuestId = decodeGuestSessionId(guest.guestSessionToken);

  // threadMessages/pinsByTopId (the per-page thread + pin state) and the handlers that
  // read/mutate them all live in thread-manager.ts now - see its own comments for the
  // reasoning behind each piece. index.ts still owns the DOM events (clicks,
  // postMessage, websocket) that drive them.
  const threadManager = createThreadManager({
    shadow,
    api,
    projectId,
    myActorId: myGuestId,
  });
  const { threadMessages, pinsByTopId, trackPinPosition, openThreadForComment, attachPinClickHandler } =
    threadManager;

  // Existing comments on this page (guest-accessible, already server-side layer-filtered)
  // get a pin each - resolved best-effort back to a live element via the same selector
  // path captured at comment-creation time (resolveAnchorElement's own doc comment: a
  // missing match just means that pin doesn't render this load, the comment itself is
  // untouched).
  const existingComments = await api.request<CommentRecord[]>(
    `/api/v1/pages/${pageId}/comments`,
  );
  const topLevelComments = existingComments.filter((c) => c.parent_id === null);
  for (const top of topLevelComments) {
    const replies = existingComments
      .filter((c) => c.parent_id === top.id)
      .sort((a, b) => a.created_at.localeCompare(b.created_at));
    threadMessages.set(top.id, [top, ...replies]);

    const element = resolveAnchorElement(top.anchor);
    if (!element) continue;
    // Restore the click point *within* the element, not its top-left corner. A comment
    // left on one word partway through a paragraph anchors to that whole <p> (selector
    // paths resolve no finer), so rendering at the corner visibly moved the pin to the
    // start of the paragraph on every reload - the exact bug this offset fixes.
    const rect = element.getBoundingClientRect();
    const point = anchorPointFor(element, top.anchor);
    const offset = {
      x: point.x - (rect.left + window.scrollX),
      y: point.y - (rect.top + window.scrollY),
    };
    const pin = renderPin(shadow, point.x, point.y);
    attachPinClickHandler(pin, top.id);
    const untrack = trackPinPosition(pin, () => resolveAnchorElement(top.anchor), offset);
    pinsByTopId.set(top.id, { pin, untrack });
  }

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

    const element = resolveAnchorElement(messages[0].anchor);
    if (!element) return;
    element.scrollIntoView({ behavior: "smooth", block: "center" });
    // Give the scroll (and position-tracker's own viewport re-check) a moment to
    // settle before opening the thread.
    setTimeout(() => {
      // Prefer the pin's own live position - the same one clicking the pin directly
      // uses (attachPinClickHandler) - over recomputing from the element's raw
      // top-left corner. The two aren't the same point: a pin keeps the exact
      // click-time offset within its element (trackPinPosition's `offset` param), so
      // a wide/tall anchored element (a whole hero section, say) would otherwise open
      // the thread at its corner - visibly far from where the pin (and the original
      // comment) actually sits.
      const pin = pinsByTopId.get(topId)?.pin;
      const x = pin ? parseFloat(pin.style.left) : element.getBoundingClientRect().left + window.scrollX;
      const y = pin ? parseFloat(pin.style.top) : element.getBoundingClientRect().top + window.scrollY;
      openThreadForComment(topId, x, y);
    }, 400);
  });

  const ownCommentIds = new Set<string>();
  wireRealtimeUpdates(
    shadow,
    config.apiBaseUrl,
    guest.guestSessionToken,
    pageId,
    threadManager,
    ownCommentIds,
  );

  if (!commentingEnabled && !drawingEnabled) return;

  if (drawingEnabled) {
    setupRegionDrawer({
      shadow,
      api,
      projectId,
      pageId,
      browserOverride,
      threadManager,
      ownCommentIds,
      tooltip,
    });
    return;
  }

  document.addEventListener("click", (event) => {
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
    // Tracks from the moment the pin exists (composing included), using the exact
    // clicked element directly - no anchor/selector resolution needed, this element
    // reference is already unambiguous. The offset preserves exactly where within the
    // element the reviewer clicked, rather than snapping to the element's corner the
    // moment tracking's first frame runs.
    const targetRect = target.getBoundingClientRect();
    const offset = {
      x: x - (targetRect.left + window.scrollX),
      y: y - (targetRect.top + window.scrollY),
    };
    const untrack = trackPinPosition(pin, () => target, offset);

    // M-08 idempotency: generated once per pin/composer, not inside the submit
    // callback, so a future retry affordance on this same composer (UX-AUD-027 is
    // still pending) can resend the identical key instead of minting a new one -
    // the backend replays the original comment for a repeated key rather than
    // creating a duplicate (comments/repository.py's find_by_client_request_id).
    const clientRequestId = crypto.randomUUID();

    const controls = openComposer(
      shadow,
      x,
      y,
      async ({ body, attachments }) => {
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
          const created = await api.request<CommentRecord>(`/api/v1/pages/${pageId}/comments`, {
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
              client_request_id: clientRequestId,
            }),
          });
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
    );
  });
}

declare global {
  interface Window {
    Backline: { init: typeof init };
  }
}

window.Backline = { init };
