import type { ApiClient } from "./api-client";
import type { CommentRecord } from "./types";
import { computeRegionAnchor } from "./anchor";
import { renderPin, openComposer, type ComposerDetails } from "./ui";
import { composerHasDraft, nudgeComposer } from "./ui-composer";
import { captureScreenshot } from "./screenshot";
import { uploadScreenshot, uploadAttachment } from "./attachment-upload";
import { parseUserAgent } from "./user-agent";
import type { createThreadManager } from "./thread-manager";

/**
 * The element a drawn area is anchored to: the innermost one, from where the drag
 * started outwards, whose box holds the whole area. The anchor stores the area as
 * fractions of that element's box, clamped to it - anchored to the element under the
 * pointer (a button, say) an area drawn past its edges was squashed onto it.
 */
function containerFor(start: Element, rect: { x: number; y: number; width: number; height: number }): Element {
  const slack = 1;
  for (let el: Element | null = start; el && el !== document.documentElement; el = el.parentElement) {
    const box = el.getBoundingClientRect();
    const left = box.left + window.scrollX;
    const top = box.top + window.scrollY;
    if (
      left <= rect.x + slack &&
      top <= rect.y + slack &&
      left + box.width >= rect.x + rect.width - slack &&
      top + box.height >= rect.y + rect.height - slack
    ) {
      return el;
    }
  }
  return document.body;
}

export function setupRegionDrawer({
  shadow,
  api,
  projectId,
  pageId,
  browserOverride,
  threadManager,
  ownCommentIds,
  tooltip,
  composerDetails,
  onCommentCreated,
}: {
  shadow: ShadowRoot;
  api: ApiClient;
  projectId: string;
  pageId: string;
  browserOverride: string | null;
  threadManager: ReturnType<typeof createThreadManager>;
  ownCommentIds: Set<string>;
  tooltip: { dismiss: () => void };
  composerDetails: (regionSize?: string) => ComposerDetails;
  /** Told about each comment this drawer posts (the guest widget passes it on to the
   * dashboard around the canvas). */
  onCommentCreated?: (created: CommentRecord) => void;
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
    // Starting a new area would leave a half-written comment behind; point back at it.
    if (composerHasDraft()) {
      e.preventDefault();
      nudgeComposer();
      target = null;
      return;
    }

    e.preventDefault();
    isDrawing = true;
    startX = e.pageX;
    startY = e.pageY;

    // Inside the widget's shadow root (ui-styles.ts's .bl-region), so Browse mode hides
    // it along with the pins instead of leaving a box drawn over the site.
    overlay = document.createElement("div");
    overlay.className = "bl-region bl-region-draft";
    overlay.style.left = `${startX}px`;
    overlay.style.top = `${startY}px`;
    overlay.style.width = "0px";
    overlay.style.height = "0px";
    shadow.appendChild(overlay);
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
    overlay.classList.remove("bl-region-draft");
    
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
    // Captured now: the drawer's own `target` is reassigned by the very next mousedown -
    // including the one on "Post comment", which is the widget's host element - so a
    // tracker reading it followed that (invisible) host and hid the new pin.
    const activeTarget = containerFor(target, rect);

    // Create a pin at the top-left of the region
    const pin = renderPin(shadow, finalLeft, finalTop);
    pin.classList.add("bl-pin-ghost");

    const targetRect = activeTarget.getBoundingClientRect();
    const offsetPct = {
      x: targetRect.width > 0
        ? (finalLeft - (targetRect.left + window.scrollX)) / targetRect.width
        : 0,
      y: targetRect.height > 0
        ? (finalTop - (targetRect.top + window.scrollY)) / targetRect.height
        : 0,
    };
    const untrack = threadManager.trackPinPosition(pin, () => activeTarget, (box) => ({
      x: box.width * offsetPct.x,
      y: box.height * offsetPct.y,
    }));

    const clientRequestId = crypto.randomUUID();
    const activeOverlay = overlay;

    const controls = openComposer(
      shadow,
      finalLeft,
      finalTop + finalHeight, // open below the region
      async ({ body, attachments, tags }) => {
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
              tags,
              client_request_id: clientRequestId,
            }),
          });
          pin.classList.remove("bl-pin-ghost");
          if (created.ticket_number != null) pin.textContent = String(created.ticket_number);
          ownCommentIds.add(created.id);
          threadManager.threadMessages.set(created.id, [created]);
          // The drawn box was placed once, at the drag's page coordinates; from here on
          // the saved area follows its element the way a reloaded one does.
          const tracked = threadManager.createRegionOverlay(created.anchor ?? anchor, () => activeTarget);
          if (tracked) activeOverlay.remove();
          threadManager.adoptPin(
            created.id,
            pin,
            () => {
              untrack();
              tracked?.untrack();
            },
            tracked?.overlay ?? activeOverlay,
          );
          threadManager.attachPinClickHandler(pin, created.id);
          tooltip.dismiss();
          controls.setStatus("Comment posted.");
          onCommentCreated?.(created);
          return true;
        } catch {
          controls.setStatus("Could not post your comment. Please try again.");
          return false;
        }
      },
      () => {
        untrack();
        pin.remove();
        activeOverlay.remove();
      },
      (file: File) => uploadAttachment(api, projectId, file),
      composerDetails(`${Math.round(finalWidth)} \u00d7 ${Math.round(finalHeight)}`),
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
