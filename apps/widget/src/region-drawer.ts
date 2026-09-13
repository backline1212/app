import type { ApiClient } from "./api-client";
import type { CommentRecord } from "./types";
import { computeRegionAnchor } from "./anchor";
import { renderPin, openComposer } from "./ui";
import { captureScreenshot } from "./screenshot";
import { uploadScreenshot, uploadAttachment } from "./attachment-upload";
import { parseUserAgent } from "./user-agent";
import type { createThreadManager } from "./thread-manager";

export function setupRegionDrawer({
  shadow,
  api,
  projectId,
  pageId,
  browserOverride,
  threadManager,
  ownCommentIds,
  tooltip,
}: {
  shadow: ShadowRoot;
  api: ApiClient;
  projectId: string;
  pageId: string;
  browserOverride: string | null;
  threadManager: ReturnType<typeof createThreadManager>;
  ownCommentIds: Set<string>;
  tooltip: { dismiss: () => void };
}) {
  let startX = 0;
  let startY = 0;
  let isDrawing = false;
  let overlay: HTMLDivElement | null = null;
  let target: Element | null = null;

  // Signals "click and drag to select an area" the same way comment mode's cursor
  // signals "click to pin" - restored to whatever the page had on cleanup (mode
  // switched away from draw) rather than assumed to be the browser default.
  const previousCursor = document.body.style.cursor;
  document.body.style.cursor = "crosshair";

  function onMouseDown(e: MouseEvent) {
    target = e.target as Element | null;
    if (!target || target.closest("[data-backline-root]")) return;

    e.preventDefault();
    isDrawing = true;
    startX = e.pageX;
    startY = e.pageY;

    overlay = document.createElement("div");
    overlay.style.position = "absolute";
    overlay.style.border = "2px solid #0052cc";
    overlay.style.backgroundColor = "rgba(0, 82, 204, 0.1)";
    overlay.style.pointerEvents = "none";
    overlay.style.zIndex = "999999";
    overlay.style.left = `${startX}px`;
    overlay.style.top = `${startY}px`;
    overlay.style.width = "0px";
    overlay.style.height = "0px";
    document.body.appendChild(overlay);
  }

  function onMouseMove(e: MouseEvent) {
    if (!isDrawing || !overlay) return;
    const currentX = e.pageX;
    const currentY = e.pageY;
    const left = Math.min(startX, currentX);
    const top = Math.min(startY, currentY);
    const width = Math.abs(currentX - startX);
    const height = Math.abs(currentY - startY);
    
    overlay.style.left = `${left}px`;
    overlay.style.top = `${top}px`;
    overlay.style.width = `${width}px`;
    overlay.style.height = `${height}px`;
  }

  function onMouseUp() {
    if (!isDrawing || !overlay || !target) return;
    isDrawing = false;
    
    const finalLeft = parseFloat(overlay.style.left);
    const finalTop = parseFloat(overlay.style.top);
    const finalWidth = parseFloat(overlay.style.width);
    const finalHeight = parseFloat(overlay.style.height);
    
    // If the region is too small, treat it as a point click (handled by click listener in index.ts)
    if (finalWidth < 5 || finalHeight < 5) {
      overlay.remove();
      return;
    }

    const rect = { x: finalLeft, y: finalTop, width: finalWidth, height: finalHeight };

    // Create a pin at the top-left of the region
    const pin = renderPin(shadow, finalLeft, finalTop);
    
    const targetRect = target.getBoundingClientRect();
    const offset = {
      x: finalLeft - (targetRect.left + window.scrollX),
      y: finalTop - (targetRect.top + window.scrollY),
    };
    const untrack = threadManager.trackPinPosition(pin, () => target, offset);

    const clientRequestId = crypto.randomUUID();
    const activeTarget = target;
    const activeOverlay = overlay;

    const controls = openComposer(
      shadow,
      finalLeft,
      finalTop + finalHeight, // open below the region
      async ({ body, attachments }) => {
        controls.setStatus("Capturing region anchor + screenshot...");
        const anchor = await computeRegionAnchor(activeTarget, rect);
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
          threadManager.threadMessages.set(created.id, [created]);
          threadManager.pinsByTopId.set(created.id, { pin, untrack, regionOverlay: activeOverlay });
          threadManager.attachPinClickHandler(pin, created.id);
          tooltip.dismiss();
          controls.setStatus("Comment posted.");
        } catch {
          controls.setStatus("Could not post your comment. Please try again.");
        }
      },
      () => {
        untrack();
        pin.remove();
        activeOverlay.remove();
      },
      (file: File) => uploadAttachment(api, projectId, file),
    );
  }

  document.addEventListener("mousedown", onMouseDown);
  document.addEventListener("mousemove", onMouseMove);
  document.addEventListener("mouseup", onMouseUp);

  return () => {
    document.removeEventListener("mousedown", onMouseDown);
    document.removeEventListener("mousemove", onMouseMove);
    document.removeEventListener("mouseup", onMouseUp);
    document.body.style.cursor = previousCursor;
  };
}
