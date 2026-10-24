import type { NativeReviewInfo, Schemas } from "@backline/types";
import {
  computeAnchor,
  createApiClient,
  createCommentSubmission,
  createShadowRoot,
  createThreadManager,
  postThreadReply,
  captureScreenshot,
  composerHasDraft,
  cancelEmptyComposer,
  discardComposerForTeardown,
  nudgeComposer,
  openComposer,
  parseUserAgent,
  recordDiagnostic,
  registerCurrentPage,
  capturePageVersion,
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
import { captureNativeScreenshot, createNativeApi, installDashboardBridge, nativeMessage, reviewAccessEnded, reviewServiceUnavailable, uploadNativeAttachment, uploadNativeScreenshot } from "./native-client";
import { createNativeToolbar } from "./native-toolbar";

// Content scripts have direct chrome.storage access once the extension is granted the
// "storage" permission (manifest.json) - no need to round-trip through the background
// worker the way the popup does, since nothing here ever *writes* the connection.

interface AnnotationContext {
  api: import("@backline/widget").ApiClient;
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
let nativeAccessClosed = false;

function endNativeAccess(): void {
  nativeAccessClosed = true;
  clearContext();
  nativeInfo = null;
  toolbar?.endAccess("Review access ended. Loaded feedback and drafts have been cleared. Return to Backline to sign in or reopen an available review.");
}

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
  capturePageVersion(api, pageId, shadow, pageUrl);

  // Connected with a member token, so unlike the guest widget this can change a
  // comment's status itself - the same member-only PATCH the dashboard uses.
  const address = new URL(pageUrl);
  const route = address.hash.startsWith("#/") || address.hash.startsWith("#!/") ? address.hash : "";
  const pagePath = address.pathname + address.search + route;
  const threadManager = createThreadManager({
    shadow,
    pagePath: () => pagePath,
    statusUpdater: () => (info && !info.member) || !["editor", "manager"].includes(project.my_role ?? "") ? null : async (commentId, status) => {
      const updated = await api.request<CommentRecord>(`/api/v1/comments/${commentId}`, {
        method: "PATCH",
        body: JSON.stringify({ status }),
      });
      return updated.status;
    },
    replyPoster: () => info && !info.member ? (topId, request) => postThreadReply(api, topId, request)
      : ["commenter", "editor", "manager"].includes(project.my_role ?? "")
        ? (topId, request) => postThreadReply(api, topId, request) : null,
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
      pagePath,
      browser: parseUserAgent(navigator.userAgent).browser,
      regionSize,
      askSteps: (info?.project.variant ?? (project as { variant?: string | null }).variant) === "webapp",
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
    const submission = createCommentSubmission(api, pageId, ctx.pageUrl);

    const controls = openComposer(
      shadow,
      x,
      y,
      async ({ body, attachments, tags, diagnostics, stepsToReproduce }) => {
        try {
          const created = await submission.submit(async () => {
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

            return {
              body,
              layer: "client",
              anchor: { ...anchor, type: "point" },
              context: {
                browser,
                os,
                device_type: deviceType,
                viewport: { width: window.innerWidth, height: window.innerHeight },
                url: window.location.href,
                ...(diagnostics ? { diagnostics } : {}),
                ...(stepsToReproduce ? { steps_to_reproduce: stepsToReproduce } : {}),
              },
              screenshot_key: screenshotKey,
              capture_status: screenshotKey ? "ok" : "failed",
              attachments,
              tags,
            };
          });
          pin.classList.remove("bl-pin-ghost");
          if (created.ticket_number != null) pin.textContent = String(created.ticket_number);
          ownCommentIds.add(created.id);
          threadMessages.set(created.id, [created]);
          pinsByTopId.set(created.id, { pin, untrack });
          attachPinClickHandler(pin, created.id);
          tooltip.dismiss();
          if (created.capture_status === "failed") {
            controls.setStatus("Comment posted without an automatic screenshot. The text and location were saved.");
            controls.setCloseDelay(4000);
          } else if (created.screenshot_url) {
            controls.setStatus("Comment posted with screenshot.");
          } else {
            controls.setStatus("Comment posted.");
          }
          return true;
        } catch (error) {
          controls.setRetryLocked(submission.isPrepared());
          throw error;
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
  if (nativeAccessClosed) throw new Error("Review access ended. Return to Backline and open the review again.");
  if (currentMode === mode) return;

  const ctx = await buildContext();
  if (!ctx) return;
  if ((!ctx.native || nativeInfo?.member) && !["commenter", "editor", "manager"].includes(ctx.project.my_role ?? "")) {
    throw new Error("This project is read-only for your account. Return to Backline to view its feedback.");
  }

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
      documentUrl: ctx.pageUrl,
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
  discardComposerForTeardown();
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
  nativeAccessClosed = false;
  nativeInfo = info;
  // Console/network failures for "Attach console & network errors". Best effort: a
  // page that blocks injection simply offers no diagnostics.
  void nativeMessage("native-review-diagnostics").catch(() => undefined);
  toolbar = createNativeToolbar(info, async mode => {
    if (nativeInfo !== info) throw new Error("This review changed. Open it again from Backline.");
    if (composerHasDraft()) throw new Error("Finish or cancel your current comment first.");
    if (mode === "browse") browse(); else await activate(mode);
  }, async () => {
    if (composerHasDraft()) throw new Error("Finish or cancel your current comment first.");
    const closingToolbar = toolbar;
    await nativeMessage("native-review-end", { launchId: info.launchId });
    if (toolbar !== closingToolbar) return;
    clearContext();
    nativeInfo = null;
    toolbar = null;
  });
  try {
    await nativeMessage("native-review-ready", { launchId: info.launchId });
  } catch (error) {
    if (reviewServiceUnavailable(error)) {
      toolbar?.error("Backline is temporarily unavailable. Keep this tab open; the toolbar will retry when the service returns.");
      return;
    }
    clearContext();
    toolbar?.remove();
    toolbar = null;
    nativeInfo = null;
    throw error;
  }
}

const isolatedWindow = window as Window & { __backlineExtensionLoaded?: boolean };
if (!isolatedWindow.__backlineExtensionLoaded && window.top === window) {
  isolatedWindow.__backlineExtensionLoaded = true;
  installDashboardBridge();
  // Entries relayed from main-world.ts. Only same-window messages are accepted; the page
  // could forge one, but it can only describe its own console, which it already owns.
  window.addEventListener("message", (event) => {
    const data = event.data as { __backlineDiagnostic?: boolean; entry?: Parameters<typeof recordDiagnostic>[0] } | null;
    if (event.source !== window || !data?.__backlineDiagnostic || !data.entry || !nativeInfo) return;
    recordDiagnostic(data.entry);
  });
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
  let commentsLoading = false;
  // The cheap fingerprint is polled; the full list (with signed evidence URLs) is only
  // fetched when it changes. An API without the fingerprint route falls back to the list.
  let seenVersion: { pageId: string; version: string } | null = null;
  async function changedSinceLastPoll(ctx: AnnotationContext): Promise<boolean> {
    try {
      const { version } = await ctx.api.request<{ version: string }>(`/api/v1/pages/${ctx.pageId}/comments/version`);
      const changed = seenVersion?.pageId !== ctx.pageId || seenVersion.version !== version;
      seenVersion = { pageId: ctx.pageId, version };
      return changed;
    } catch {
      // Includes an older API without this route: the full list decides access.
      return true;
    }
  }
  setInterval(() => {
    const ctx = context;
    if (commentsLoading || !ctx || !ctx.native || document.hidden || composerHasDraft() || location.href !== ctx.pageUrl) return;
    commentsLoading = true;
    void changedSinceLastPoll(ctx).then(changed => changed ? ctx.api.request<CommentRecord[]>(`/api/v1/pages/${ctx.pageId}/comments`) : null).then(comments => {
      if (!comments) return;
      if (context !== ctx) return;
      const ids = new Set(comments.map(comment => comment.id));
      for (const id of ctx.threadManager.threadMessages.keys()) {
        if (!ids.has(id)) ctx.threadManager.handleCommentDeleted(id, id);
      }
      for (const comment of comments) {
        ctx.threadManager.handleCommentCreated(comment, ctx.pageId);
        ctx.threadManager.handleCommentUpdated(comment);
      }
    }).catch(error => {
      if (context !== ctx) return;
      if (reviewAccessEnded(error)) endNativeAccess();
      else toolbar?.error(error.message);
    }).finally(() => { commentsLoading = false; });
  }, 10000);
  let checkingAccess = false;
  async function checkNativeAccess(): Promise<void> {
    const info = nativeInfo;
    if (checkingAccess || !info || nativeAccessClosed || document.hidden) return;
    checkingAccess = true;
    try {
      const result = await nativeMessage<{ launchId: string; project: NativeReviewInfo["project"] }>("native-review-check-access");
      if (nativeInfo !== info || result.launchId !== info.launchId) return;
      const previousRole = info.project.my_role;
      info.project = result.project;
      if (context?.native) context.project = { ...context.project, ...result.project };
      if (!currentMode) toolbar?.setMode("browse");
      // Reset held callbacks after a project-role change. Re-open tools against the
      // new role; a pending mutation is still authorized independently on the API.
      if (previousRole !== result.project.my_role && context?.native) {
        clearContext();
        toolbar?.setMode("browse");
        toolbar?.error("Your project role changed. Loaded feedback and drafts were cleared. Check Backline for any save that was in progress, then reopen tools with your current access.");
      }
    } catch (error) {
      if (nativeInfo !== info) return;
      if (reviewAccessEnded(error)) endNativeAccess();
      else toolbar?.error("Could not confirm review access. Check your connection; access will be checked again.");
    } finally { checkingAccess = false; }
  }
  setInterval(() => { void checkNativeAccess(); }, 30_000);
  document.addEventListener("visibilitychange", () => { if (!document.hidden) void checkNativeAccess(); });
  window.addEventListener("focus", () => { void checkNativeAccess(); });
}
