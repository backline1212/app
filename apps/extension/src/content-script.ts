import type { Schemas } from "@backline/types";
import {
  anchorPointFor,
  computeAnchor,
  createApiClient,
  createShadowRoot,
  createThreadManager,
  captureScreenshot,
  openComposer,
  parseUserAgent,
  registerCurrentPage,
  renderPin,
  resolveAnchorElement,
  setupRegionDrawer,
  showTooltip,
  uploadAttachment,
  uploadScreenshot,
  type CommentRecord,
  type ComposerDetails,
} from "@backline/widget";

import { API_BASE_URL } from "./lib/config";
import type { AnnotationMode, ExtensionMessage } from "./lib/messages";
import { getConnection } from "./lib/storage";

// Content scripts have direct chrome.storage access once the extension is granted the
// "storage" permission (manifest.json) - no need to round-trip through the background
// worker the way the popup does, since nothing here ever *writes* the connection.

interface AnnotationContext {
  api: ReturnType<typeof createApiClient>;
  shadow: ShadowRoot;
  project: Schemas["ProjectOut"];
  pageId: string;
  threadManager: ReturnType<typeof createThreadManager>;
  ownCommentIds: Set<string>;
  tooltip: { dismiss: () => void };
  composerDetails: (regionSize?: string) => ComposerDetails;
}

// Resolved once per page load and reused across mode switches (below) - re-running the
// project-resolve/register-page/load-comments sequence every time the popup's other
// button is clicked would re-fetch the same data and, worse, re-render every existing
// pin a second time on top of itself.
let context: AnnotationContext | null = null;
let currentMode: AnnotationMode | null = null;
let deactivateCurrentMode: (() => void) | null = null;

async function buildContext(): Promise<AnnotationContext | null> {
  if (context) return context;

  const connection = await getConnection();
  if (!connection) {
    console.warn("[Backline] Not connected - open the extension popup and paste a token first.");
    return null;
  }

  const api = createApiClient(API_BASE_URL, () => ({
    Authorization: `Bearer ${connection.token}`,
  }));
  const shadow = createShadowRoot();

  // Auto-detect-and-create-project flow (browser-extension plan, Phase 1c/4): finds or
  // creates a project for this exact site, then registers the current URL as a page on
  // it - registerCurrentPage/POST .../projects/resolve are the same endpoints/helpers
  // the dashboard and guest widget already use, just authenticated as this member.
  const project = await api.request<Schemas["ProjectOut"]>(
    `/api/v1/workspaces/${connection.workspaceId}/projects/resolve`,
    {
      method: "POST",
      body: JSON.stringify({ target_origin: window.location.origin }),
    },
  );
  const pageId = await registerCurrentPage(api, project.id, window.location.href);

  // Connected with a member token, so unlike the guest widget this can change a
  // comment's status itself - the same member-only PATCH the dashboard uses.
  const threadManager = createThreadManager({
    shadow,
    statusUpdater: () => async (commentId, status) => {
      const updated = await api.request<CommentRecord>(`/api/v1/comments/${commentId}`, {
        method: "PATCH",
        body: JSON.stringify({ status }),
      });
      return updated.status;
    },
  });
  const { threadMessages, pinsByTopId, trackPinPosition, attachPinClickHandler } = threadManager;

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

  context = {
    api,
    shadow,
    project,
    pageId,
    threadManager,
    ownCommentIds: new Set<string>(),
    tooltip: showTooltip(shadow),
    // The connection only carries the member's email, so the composer's avatar
    // initials come from that.
    composerDetails: (regionSize) => ({
      authorName: connection.userEmail,
      pagePath: window.location.pathname,
      browser: parseUserAgent(navigator.userAgent).browser,
      regionSize,
    }),
  };
  return context;
}

function activatePointMode(ctx: AnnotationContext): () => void {
  const { api, shadow, project, pageId, threadManager, ownCommentIds, tooltip, composerDetails } = ctx;
  const { threadMessages, pinsByTopId, trackPinPosition, attachPinClickHandler } = threadManager;

  const handleClick = (event: MouseEvent): void => {
    const target = event.target as Element | null;
    if (!target || target.closest("[data-backline-root]")) return;

    // Same reasoning as apps/widget/src/index.ts's own click handler: left unprevented,
    // commenting on a link or submit button also triggers its native action and
    // navigates the page away mid-comment.
    event.preventDefault();

    const x = event.pageX;
    const y = event.pageY;
    const pin = renderPin(shadow, x, y);
    pin.classList.add("bl-pin-ghost");
    const targetRect = target.getBoundingClientRect();
    const offset = {
      x: x - (targetRect.left + window.scrollX),
      y: y - (targetRect.top + window.scrollY),
    };
    const untrack = trackPinPosition(pin, () => target, offset);
    const clientRequestId = crypto.randomUUID();

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
          screenshotKey = await uploadScreenshot(api, project.id, screenshotBlob);
        }

        controls.setStatus("Posting comment...");
        const { browser, os, device_type: deviceType } = parseUserAgent(navigator.userAgent);

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
      (file) => uploadAttachment(api, project.id, file),
      composerDetails(),
    );
  };

  document.addEventListener("click", handleClick);
  return () => document.removeEventListener("click", handleClick);
}

async function activate(mode: AnnotationMode): Promise<void> {
  if (currentMode === mode) return;

  const ctx = await buildContext();
  if (!ctx) return;

  // Switching modes (e.g. "Add comment" then, on the same page load, "Draw region")
  // tears down the previous mode's listeners first rather than layering a second set
  // on top - without this, both a point-click handler and a region-drawer's own
  // mousedown/mousemove/mouseup listeners would fire on the same click.
  deactivateCurrentMode?.();
  currentMode = mode;

  if (mode === "region") {
    deactivateCurrentMode = setupRegionDrawer({
      shadow: ctx.shadow,
      api: ctx.api,
      projectId: ctx.project.id,
      pageId: ctx.pageId,
      browserOverride: null,
      threadManager: ctx.threadManager,
      ownCommentIds: ctx.ownCommentIds,
      tooltip: ctx.tooltip,
      composerDetails: ctx.composerDetails,
    });
  } else {
    deactivateCurrentMode = activatePointMode(ctx);
  }
}

chrome.runtime.onMessage.addListener((message: ExtensionMessage) => {
  if (message.type === "activate-annotation") {
    void activate(message.mode);
  }
  return false;
});
