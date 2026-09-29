import type { NativeReviewInfo, Schemas } from "@backline/types";
import {
  computeAnchor,
  createApiClient,
  createShadowRoot,
  createThreadManager,
  captureScreenshot,
  composerHasDraft,
  cancelEmptyComposer,
  nudgeComposer,
  openComposer,
  parseUserAgent,
  registerCurrentPage,
  renderPin,
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
import { captureNativeScreenshot, createNativeApi, installDashboardBridge, nativeMessage, uploadNativeAttachment, uploadNativeScreenshot } from "./native-client";
import { createNativeToolbar } from "./native-toolbar";

// Content scripts have direct chrome.storage access once the extension is granted the
// "storage" permission (manifest.json) - no need to round-trip through the background
// worker the way the popup does, since nothing here ever *writes* the connection.

interface AnnotationContext {
  api: ReturnType<typeof createApiClient>;
  shadow: ShadowRoot;
  project: NativeReviewInfo["project"];
  pageUrl: string;
  native: boolean;
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
let building: Promise<AnnotationContext | null> | null = null;
let contextGeneration = 0;
let toolbar: ReturnType<typeof createNativeToolbar> | null = null;
let nativeInfo: NativeReviewInfo | null = null;
let currentMode: AnnotationMode | null = null;
let deactivateCurrentMode: (() => void) | null = null;

async function buildContext(): Promise<AnnotationContext | null> {
  if (context) return context;
  if (building) return building;
  building = buildFreshContext();
  try { return await building; } finally { building = null; }
}

async function buildFreshContext(): Promise<AnnotationContext | null> {
  const pageUrl = location.href;
  const generation = contextGeneration;
  const info = nativeInfo;
  const connection = info ? null : await getConnection();
  if (!info && !connection) throw new Error("Open this project's Browser review button in Backline first.");
  const api = info ? createNativeApi(pageUrl) : createApiClient(API_BASE_URL, () => ({
    Authorization: `Bearer ${connection!.token}`,
  }));
  const project = info?.project ?? await api.request<Schemas["ProjectOut"]>(
    `/api/v1/workspaces/${connection!.workspaceId}/projects/resolve`,
    { method: "POST", body: JSON.stringify({ target_origin: window.location.origin }) },
  );
  const pageId = await registerCurrentPage(api, project.id, pageUrl);
  const existingComments = await api.request<CommentRecord[]>(`/api/v1/pages/${pageId}/comments`);
  if (generation !== contextGeneration || location.href !== pageUrl) throw new Error("The page changed. Choose Comment again when it finishes loading.");
  const shadow = createShadowRoot();

  // Connected with a member token, so unlike the guest widget this can change a
  // comment's status itself - the same member-only PATCH the dashboard uses.
  const threadManager = createThreadManager({
    shadow,
    statusUpdater: () => info && !info.member ? null : async (commentId, status) => {
      const updated = await api.request<CommentRecord>(`/api/v1/comments/${commentId}`, {
        method: "PATCH",
        body: JSON.stringify({ status }),
      });
      return updated.status;
    },
  });
  for (const top of existingComments.filter(c => c.parent_id === null)) {
    threadManager.addThread(top, existingComments.filter(c => c.parent_id === top.id)
      .sort((a, b) => a.created_at.localeCompare(b.created_at)));
  }

  context = {
    api,
    shadow,
    project,
    pageId,
    pageUrl,
    native: !!info,
    threadManager,
    ownCommentIds: new Set<string>(),
    tooltip: showTooltip(shadow),
    // The connection only carries the member's email, so the composer's avatar
    // initials come from that.
    composerDetails: (regionSize) => ({
      authorName: info?.authorName ?? connection!.userEmail,
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
    // Same as the guest widget: a half-written comment isn't thrown away by a stray click.
    if (composerHasDraft()) {
      event.preventDefault();
      event.stopImmediatePropagation();
      nudgeComposer();
      return;
    }

    // Same reasoning as apps/widget/src/index.ts's own click handler: left unprevented,
    // commenting on a link or submit button also triggers its native action and
    // navigates the page away mid-comment.
    event.preventDefault();
    event.stopImmediatePropagation();

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
        const screenshotBlob = await (ctx.native ? captureNativeScreenshot() : captureScreenshot());

        let screenshotKey: string | null = null;
        if (screenshotBlob) {
          controls.setStatus("Uploading screenshot...");
          screenshotKey = ctx.native ? await uploadNativeScreenshot(api, project.id, screenshotBlob)
            : await uploadScreenshot(api, project.id, screenshotBlob);
        }

        controls.setStatus("Posting comment...");
        const { browser, os, device_type: deviceType } = parseUserAgent(navigator.userAgent);

        try {
          if (location.href !== ctx.pageUrl) throw new Error("The page changed. Cancel this draft and comment on the new page.");
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
          if (created.ticket_number != null) pin.textContent = String(created.ticket_number);
          ownCommentIds.add(created.id);
          threadMessages.set(created.id, [created]);
          pinsByTopId.set(created.id, { pin, untrack });
          attachPinClickHandler(pin, created.id);
          tooltip.dismiss();
          controls.setStatus("Comment posted.");
          return true;
        } catch (error) {
          controls.setStatus(error instanceof Error ? error.message : "Could not post your comment. Please try again.");
          return false;
        }
      },
      () => {
        untrack();
        pin.remove();
      },
      (file) => ctx.native ? uploadNativeAttachment(api, project.id, file) : uploadAttachment(api, project.id, file),
      composerDetails(),
    );
  };

  document.addEventListener("click", handleClick, true);
  return () => document.removeEventListener("click", handleClick, true);
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
  (ctx.shadow.host as HTMLElement).style.display = "";
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
      screenshot: ctx.native ? captureNativeScreenshot : captureScreenshot,
      uploadScreenshotFile: ctx.native ? uploadNativeScreenshot : uploadScreenshot,
      uploadFile: ctx.native ? uploadNativeAttachment : uploadAttachment,
      interceptEvents: true,
    });
  } else {
    deactivateCurrentMode = activatePointMode(ctx);
  }
}

function browse(): void {
  cancelEmptyComposer();
  deactivateCurrentMode?.();
  deactivateCurrentMode = null;
  currentMode = null;
  if (context) (context.shadow.host as HTMLElement).style.display = "none";
}

function clearContext(): void {
  contextGeneration += 1;
  browse();
  context?.threadManager.clearPage();
  context?.tooltip.dismiss();
  context?.shadow.host.remove();
  context = null;
}

async function startNativeReview(): Promise<void> {
  const info = await nativeMessage<NativeReviewInfo | null>("native-review-info");
  if (!info) return;
  if (composerHasDraft()) throw new Error("Finish or cancel your current comment first.");
  clearContext();
  toolbar?.remove();
  nativeInfo = info;
  toolbar = createNativeToolbar(info, async mode => {
    if (composerHasDraft()) throw new Error("Finish or cancel your current comment first.");
    if (mode === "browse") browse(); else await activate(mode);
  }, async () => {
    if (composerHasDraft()) throw new Error("Finish or cancel your current comment first.");
    await nativeMessage("native-review-end");
    clearContext();
    nativeInfo = null;
    toolbar = null;
  });
}

const isolatedWindow = window as Window & { __backlineExtensionLoaded?: boolean };
if (!isolatedWindow.__backlineExtensionLoaded && window.top === window) {
  isolatedWindow.__backlineExtensionLoaded = true;
  installDashboardBridge();
  chrome.runtime.onMessage.addListener((message: ExtensionMessage | { type: "native-review-start" | "native-review-stop" }, _sender, respond) => {
    const action = message.type === "native-review-start" ? startNativeReview()
      : message.type === "native-review-stop" ? Promise.resolve().then(() => {
          clearContext();
          toolbar?.remove();
          toolbar = null;
          nativeInfo = null;
        })
      : message.type === "activate-annotation" ? activate(message.mode) : null;
    if (!action) return false;
    void action.then(() => respond({ ok: true }), error => {
      toolbar?.error(error.message);
      respond({ ok: false, error: error.message });
    });
    return true;
  });
  void startNativeReview().catch(() => { /* Extension update: reload reconnects. */ });
  // An isolated content script cannot reliably patch a site's history methods.
  // Observe the address instead; a pending draft is preserved and cannot be posted
  // against a different page. The reviewer cancels it before changing modes.
  setInterval(() => {
    if (context && location.href !== context.pageUrl && !composerHasDraft()) {
      clearContext();
      toolbar?.setMode("browse");
    }
  }, 500);
  setInterval(() => {
    const ctx = context;
    if (!ctx || !ctx.native || document.hidden || composerHasDraft() || location.href !== ctx.pageUrl) return;
    void ctx.api.request<CommentRecord[]>(`/api/v1/pages/${ctx.pageId}/comments`).then(comments => {
      if (context !== ctx) return;
      const ids = new Set(comments.map(comment => comment.id));
      for (const id of ctx.threadManager.threadMessages.keys()) {
        if (!ids.has(id)) ctx.threadManager.handleCommentDeleted(id, id);
      }
      for (const comment of comments) {
        ctx.threadManager.handleCommentCreated(comment, ctx.pageId);
        ctx.threadManager.handleCommentUpdated(comment);
      }
    }).catch(error => toolbar?.error(error.message));
  }, 10000);
}
