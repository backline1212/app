import { ATTACHMENT_ACCEPT, setupAttachments, type AttachmentResult } from "./ui-attachments";
import { carryMarker } from "./capture-marker";
import { cardHeaderHtml, escapeHtml, observeCardPlacement, placeCard, svg, TAG_ICONS } from "./ui-card";
import { diagnosticsSnapshot, diagnosticsSummary, onDiagnosticsChange, type Diagnostics } from "./diagnostics";
import { formatDuration, MAX_RECORDING_SECONDS, recordingSupported, startRecording, type RecordingHandle, type RecordingKind } from "./recorder";

// The first four of the backend's Tag vocabulary (comments/schemas.py's Tag literal) -
// the same four the design's "Tag this as" row offers. Single-select with the first one
// pressed by default, exactly as the design behaves.
export const COMPOSER_TAGS = ["Bug", "Copy", "Design", "Responsive"] as const;
export type ComposerTag = (typeof COMPOSER_TAGS)[number];

const SCREENSHOT_PREF_KEY = "backline:include-screenshot";

export interface ComposerResult {
  body: string;
  attachments: AttachmentResult[];
  tags: ComposerTag[];
  /** Console & network errors the reviewer chose to attach, or null. */
  diagnostics: Diagnostics | null;
  /** Web App projects: what the reviewer did before the problem, or null. */
  stepsToReproduce: string | null;
  /** False when the reviewer unticked "Add an automatic screenshot of this page". */
  includeScreenshot: boolean;
  /** The screenshot the reviewer previewed, attached as shown; undefined when they
   * didn't preview, so the caller captures at post time as before. */
  screenshot?: Blob;
}

/** What the composer shows about who's commenting and where - the header's avatar and
 * page pill, and the device/browser/width facts row. */
export interface ComposerDetails {
  authorName: string;
  pagePath: string;
  browser: string;
  /** "320 × 140" for a drawn-region comment; omitted for a point comment. */
  regionSize?: string;
  /** Web App projects ask for reproduction steps alongside the comment. */
  askSteps?: boolean;
}

const DEVICE_ICONS = {
  Desktop: '<rect x="2" y="4" width="20" height="13" rx="2"/><path d="M8 21h8"/>',
  Tablet: '<rect x="5" y="3" width="14" height="18" rx="2"/>',
  Mobile: '<rect x="7" y="2" width="10" height="20" rx="2"/><path d="M11 18.5h2"/>',
};
const GLOBE_ICON = '<circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3a15 15 0 010 18 15 15 0 010-18"/>';
const REGION_ICON = '<rect x="3" y="3" width="18" height="18" rx="2"/>';
const IMAGE_ICON = '<rect x="3" y="4" width="18" height="16" rx="2"/><circle cx="8.5" cy="9.5" r="1.7"/><path d="M21 15l-5-5L5 20"/>';
const ARROW_ICON = '<path d="M5 12h14M13 6l6 6-6 6"/>';
const RECORD_ICON = '<circle cx="12" cy="12" r="8"/><circle cx="12" cy="12" r="3.5" fill="currentColor"/>';
const MIC_ICON = '<rect x="9" y="3" width="6" height="11" rx="3"/><path d="M5 11a7 7 0 0014 0M12 18v3"/>';
const STOP_ICON = '<rect x="6" y="6" width="12" height="12" rx="2" fill="currentColor"/>';
const BUG_ICON = '<path d="M8 6h8M9 3l1.5 3M15 3l-1.5 3"/><rect x="6" y="6" width="12" height="14" rx="6"/><path d="M3 11h3M18 11h3"/>';

// Same width breakpoints the design's devKind() uses.
function deviceKind(width: number): keyof typeof DEVICE_ICONS {
  if (width <= 560) return "Mobile";
  if (width <= 1024) return "Tablet";
  return "Desktop";
}

const PASTED_IMAGE_EXTENSIONS: Record<string, string> = {
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/gif": "gif",
  "image/webp": "webp",
};

// A pasted screenshot (Cmd/Ctrl+V after a copy from the OS's own screenshot tool or
// another app) arrives as a clipboard image item, not a File from a picker - `getAsFile`
// gives a Blob with no name, so one is generated here to keep the same File-shaped value
// the rest of the attachment pipeline (uploadFile, the chip UI) already expects.
function pastedImageFiles(clipboardData: DataTransfer | null): File[] {
  if (!clipboardData) return [];
  const files: File[] = [];
  Array.from(clipboardData.items).forEach((item, index) => {
    if (!item.type.startsWith("image/")) return;
    const blob = item.getAsFile();
    if (!blob) return;
    const ext = PASTED_IMAGE_EXTENSIONS[item.type] ?? "png";
    const suffix = index > 0 ? `-${index}` : "";
    files.push(new File([blob], `pasted-screenshot-${Date.now()}${suffix}.${ext}`, { type: item.type }));
  });
  return files;
}

/** Grows `textarea` to fit its content, capped by the max-height in its stylesheet.
 * A height the reviewer set themselves by dragging the corner becomes a floor, so
 * typing can push the box taller but a keystroke never undoes their drag. */
function autoGrowTextarea(textarea: HTMLTextAreaElement, onResize: () => void): () => void {
  let floor = 0;
  let lastSet = "";

  const fit = () => {
    const styles = getComputedStyle(textarea);
    // Everything in the widget is border-box (ui-styles.ts), so scrollHeight - which
    // covers content + padding - needs the border added back or the box lands short
    // and shows a scrollbar it doesn't need.
    const border =
      parseFloat(styles.borderTopWidth) + parseFloat(styles.borderBottomWidth);
    textarea.style.height = "auto";
    let next = textarea.scrollHeight + border;
    const max = parseFloat(styles.maxHeight);
    if (Number.isFinite(max)) next = Math.min(next, max);
    textarea.style.height = `${Math.max(next, floor)}px`;
    lastSet = textarea.style.height;
    onResize();
  };

  // Dragging the native resize corner changes the height with no input event to hang
  // off, so it's caught here instead: a height this code didn't set is the reviewer's.
  const observer = new ResizeObserver(() => {
    if (textarea.style.height === lastSet) return;
    floor = textarea.getBoundingClientRect().height;
    lastSet = textarea.style.height;
    onResize();
  });
  observer.observe(textarea);

  textarea.addEventListener("input", fit);
  fit();
  return () => { observer.disconnect(); textarea.removeEventListener("input", fit); };
}

// At most one composer is ever being written in. Its handle is kept here so the page's
// own click handlers (index.ts, region-drawer.ts, the extension's content script) can
// ask whether a new click would throw away something the reviewer typed.
let activeComposer: { hasDraft: () => boolean; nudge: () => void; cancel: () => void } | null = null;
const relatedDrafts = new Set<{ hasDraft: () => boolean; nudge: () => void }>();

/** Existing-thread replies share the same mode/navigation protection as a new
 * comment, without taking ownership of the new-comment composer's lifecycle. */
export function registerRelatedDraft(draft: { hasDraft: () => boolean; nudge: () => void }): () => void {
  relatedDrafts.add(draft);
  return () => { relatedDrafts.delete(draft); };
}

/** Whether a composer is open with something in it that isn't posted yet - text, an
 * attachment, or a post still on its way. Clicking elsewhere then keeps it open. */
export function composerHasDraft(): boolean {
  return (activeComposer?.hasDraft() ?? false) || [...relatedDrafts].some(draft => draft.hasDraft());
}

/** Remove an empty draft before tearing down its page or switching review modes. */
export function cancelEmptyComposer(): void {
  if (activeComposer && !activeComposer.hasDraft()) activeComposer.cancel();
}

/** Session teardown overrides ordinary draft guards. An in-flight HTTP write may
 * still have committed; this only clears the local editor and its retained text. */
export function discardComposerForTeardown(): void {
  activeComposer?.cancel();
}

/** Draws the reviewer back to the composer they left unfinished. */
export function nudgeComposer(): void {
  if (activeComposer?.hasDraft()) activeComposer.nudge();
  else [...relatedDrafts].find(draft => draft.hasDraft())?.nudge();
}

/**
 * x/y are page (document) coordinates, same as renderPin (see placeCard).
 *
 * `onCancel` fires exactly once whenever the composer is dismissed *without* a
 * successful submit - the explicit "x" or Cancel button, Escape, or a click elsewhere on
 * the page - never after a real submit. The caller (index.ts) uses it to remove this
 * attempt's pin, the other half of a real bug found by hand: every click created a pin
 * with no cleanup path at all, so an abandoned or click-elsewhere-cancelled comment left
 * a permanent, unremovable stray pin behind - clicking around a page a few times filled
 * it with pins nothing could ever get rid of.
 *
 * A click elsewhere only dismisses an *empty* composer. Once something is typed or
 * attached, the click is refused and the composer is pointed out instead: one stray
 * click used to throw the whole unsent comment away without a word. Escape discards an
 * empty composer at once, and a written one on a second press.
 */
export function openComposer(
  shadow: ShadowRoot,
  x: number,
  y: number,
  // Resolves to whether the comment actually posted - the composer stays open and
  // usable (not just visible) either way, since neither outcome was reachable before:
  // a resolved `true` was never distinguished from `false`, so a successful post left
  // every button - including its own close "x" - disabled forever (a disabled button
  // fires no click at all, so the one control a reviewer would reach for did nothing),
  // and a failed one was just as stuck with no way to retry or dismiss.
  onSubmit: (result: ComposerResult) => Promise<boolean>,
  onCancel: () => void,
  uploadFile: (file: File) => Promise<AttachmentResult | null>,
  details: ComposerDetails,
  // Takes the automatic screenshot for "Preview". Without it the option has no preview.
  capture?: () => Promise<Blob | null>,
): { setStatus: (text: string) => void; setCloseDelay: (ms: number) => void; setRetryLocked: (locked: boolean) => void; close: () => void } {
  const composer = document.createElement("div");
  composer.className = "bl-card bl-composer";
  composer.setAttribute("role", "dialog");
  composer.setAttribute("aria-label", "New comment");

  const width = window.innerWidth;
  const device = deviceKind(width);
  const isMac = /Mac|iPhone|iPad/.test(navigator.platform);
  composer.innerHTML = `
    ${cardHeaderHtml({
      authorName: details.authorName,
      title: "New comment",
      pagePath: details.pagePath,
      closeLabel: "Cancel comment",
    })}
    <div class="bl-cp-body">
      <textarea placeholder="What needs to change here?" required aria-label="Comment"></textarea>
      ${details.askSteps ? `<details class="bl-cp-steps">
        <summary>Steps to reproduce <span>optional</span></summary>
        <textarea class="bl-cp-steps-input" maxlength="4000" aria-label="Steps to reproduce" placeholder="1. Sign in as an admin&#10;2. Open Billing&#10;3. Click Upgrade - nothing happens"></textarea>
      </details>` : ""}
      <div class="bl-cp-sec">
        <span class="bl-cp-lbl">TAG THIS AS</span>
        <div class="bl-cp-tags" role="group" aria-label="Tag this as">
          ${COMPOSER_TAGS.map(
            (tag) =>
              `<button type="button" class="bl-cp-tag" data-tag="${tag}" aria-pressed="false">${svg(TAG_ICONS[tag])}${tag}</button>`,
          ).join("")}
        </div>
      </div>
      <div class="bl-cp-shots">
        <div class="bl-attachments"></div>
        <button type="button" class="bl-attach-button bl-cp-attach">${svg(IMAGE_ICON, 1.8, 14)}<span class="bl-cp-attach-label">Attach a screenshot</span></button>
        ${recordingSupported("screen") ? `<button type="button" class="bl-cp-attach bl-cp-record" data-kind="screen" title="Record your screen (up to ${MAX_RECORDING_SECONDS / 60} minutes)">${svg(RECORD_ICON, 1.8, 14)}<span>Record screen</span></button>` : ""}
        ${recordingSupported("voice") ? `<button type="button" class="bl-cp-attach bl-cp-record" data-kind="voice" title="Record a voice note (up to ${MAX_RECORDING_SECONDS / 60} minutes)">${svg(MIC_ICON, 1.8, 14)}<span>Voice note</span></button>` : ""}
        <input type="file" class="bl-attach-input" accept="${ATTACHMENT_ACCEPT}" multiple hidden aria-label="Choose files to attach" />
      </div>
      <div class="bl-cp-shot-row">
        <label class="bl-cp-diag bl-cp-shot-opt">
          <input type="checkbox" class="bl-cp-shot-input" checked />
          ${svg(IMAGE_ICON, 1.8, 13)}
          <span>Add an automatic screenshot of this page</span>
        </label>
        <button type="button" class="bl-cp-shot-btn" title="See the screenshot before you post"${capture ? "" : " hidden"}>Preview</button>
      </div>
      <figure class="bl-cp-shot-preview" hidden>
        <div class="bl-cp-shot-stage"><div class="bl-cp-shot-canvas"><img alt="Screenshot that will be attached" draggable="false" /></div></div>
        <figcaption><span class="bl-cp-shot-note"></span> <button type="button" class="bl-cp-shot-clear" hidden>Clear black-outs</button></figcaption>
      </figure>
      <label class="bl-cp-diag" hidden>
        <input type="checkbox" class="bl-cp-diag-input" />
        ${svg(BUG_ICON, 1.8, 13)}
        <span class="bl-cp-diag-label"></span>
      </label>
      <div class="bl-cp-ctx">
        ${svg(DEVICE_ICONS[device])}${device}
        <span class="bl-cp-sep" aria-hidden="true"></span>${svg(GLOBE_ICON)}${escapeHtml(details.browser)}
        <span class="bl-cp-sep" aria-hidden="true"></span>${width}px
        ${details.regionSize ? `<span class="bl-cp-rgn">${svg(REGION_ICON, 2)}${escapeHtml(details.regionSize)}</span>` : ""}
      </div>
      <div class="bl-status" role="status" aria-live="polite"></div>
      <button type="button" class="bl-copy-draft" hidden>Copy comment text</button>
      <div class="bl-cp-foot">
        <span class="bl-cp-hint"><kbd>${isMac ? "&#8984;" : "Ctrl"}</kbd> <kbd>&#8629;</kbd> to post</span>
        <button type="button" class="bl-cp-cancel">Cancel</button>
        <button type="button" class="bl-submit">${svg(ARROW_ICON, 2.2)}Post comment</button>
      </div>
    </div>
  `;
  shadow.appendChild(composer);

  const stopPlacement = observeCardPlacement(composer, x, y);

  const statusEl = composer.querySelector<HTMLDivElement>(".bl-status")!;
  const submitButton = composer.querySelector<HTMLButtonElement>(".bl-submit")!;
  const closeButton = composer.querySelector<HTMLButtonElement>(".bl-cancel")!;
  const cancelButton = composer.querySelector<HTMLButtonElement>(".bl-cp-cancel")!;
  const copyButton = composer.querySelector<HTMLButtonElement>(".bl-copy-draft")!;
  const attachLabel = composer.querySelector<HTMLSpanElement>(".bl-cp-attach-label")!;
  const tagButtons = Array.from(composer.querySelectorAll<HTMLButtonElement>(".bl-cp-tag"));
  const textarea = composer.querySelector<HTMLTextAreaElement>("textarea[aria-label='Comment']")!;
  const stepsInput = composer.querySelector<HTMLTextAreaElement>(".bl-cp-steps-input");
  const recordButtons = Array.from(composer.querySelectorAll<HTMLButtonElement>(".bl-cp-record"));
  const diagRow = composer.querySelector<HTMLLabelElement>(".bl-cp-diag")!;
  const diagInput = composer.querySelector<HTMLInputElement>(".bl-cp-diag-input")!;
  // Off for the rest of this tab's review once a reviewer turns it off - a page showing
  // something private usually stays that way.
  const shotInput = composer.querySelector<HTMLInputElement>(".bl-cp-shot-input")!;
  try { shotInput.checked = sessionStorage.getItem(SCREENSHOT_PREF_KEY) !== "0"; } catch { /* Storage may be disabled. */ }
  const shotButton = composer.querySelector<HTMLButtonElement>(".bl-cp-shot-btn")!;
  const shotPreview = composer.querySelector<HTMLElement>(".bl-cp-shot-preview")!;
  const shotImage = shotPreview.querySelector<HTMLImageElement>("img")!;
  const shotCaption = shotPreview.querySelector<HTMLElement>(".bl-cp-shot-note")!;
  const shotCanvas = shotPreview.querySelector<HTMLElement>(".bl-cp-shot-canvas")!;
  const shotClear = shotPreview.querySelector<HTMLButtonElement>(".bl-cp-shot-clear")!;
  const PREVIEW_NOTE = "This is what will be attached. Drag across it to black out anything private.";
  // What "Preview" captured. It is attached as shown, so the reviewer posts exactly the
  // image they checked; without a preview the caller captures when posting. `blob` has
  // the reviewer's black-outs burned in; `original` is the capture itself.
  let preview: { original: Blob; blob: Blob; url: string } | null = null;
  let capturing = false;
  // Black-outs as fractions of the image, so they map onto its full resolution.
  let redactions: Array<{ x: number; y: number; w: number; h: number }> = [];
  let redacting: Promise<void> = Promise.resolve();
  function renderRedactions(): void {
    shotCanvas.querySelectorAll(".bl-cp-shot-box").forEach((box) => box.remove());
    for (const r of redactions) {
      const box = document.createElement("span");
      box.className = "bl-cp-shot-box";
      box.style.left = `${r.x * 100}%`;
      box.style.top = `${r.y * 100}%`;
      box.style.width = `${r.w * 100}%`;
      box.style.height = `${r.h * 100}%`;
      shotCanvas.appendChild(box);
    }
    shotClear.hidden = redactions.length === 0;
  }
  // Burns the black-outs into a copy of the capture; the post waits for it.
  function applyRedactions(): void {
    const current = preview;
    if (!current) return;
    const boxes = redactions.slice();
    redacting = (async () => {
      if (boxes.length === 0) { current.blob = current.original; return; }
      const bitmap = await createImageBitmap(current.original);
      const canvas = document.createElement("canvas");
      canvas.width = bitmap.width;
      canvas.height = bitmap.height;
      const ctx = canvas.getContext("2d");
      if (!ctx) return;
      ctx.drawImage(bitmap, 0, 0);
      ctx.fillStyle = "#111";
      for (const r of boxes) ctx.fillRect(r.x * canvas.width, r.y * canvas.height, r.w * canvas.width, r.h * canvas.height);
      const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/jpeg", 0.85));
      if (blob) carryMarker(current.original, blob);
      if (blob && preview === current) current.blob = blob;
    })().catch(() => {
      statusEl.textContent = "The black-out couldn't be applied. Retake the preview or untick the screenshot.";
      shotInput.checked = false;
      renderShotOption();
    });
  }
  let drag: { startX: number; startY: number; box: HTMLElement } | null = null;
  const fraction = (event: PointerEvent): { x: number; y: number } => {
    const rect = shotImage.getBoundingClientRect();
    return {
      x: Math.min(1, Math.max(0, (event.clientX - rect.left) / rect.width)),
      y: Math.min(1, Math.max(0, (event.clientY - rect.top) / rect.height)),
    };
  };
  shotCanvas.addEventListener("pointerdown", (event) => {
    if (!preview || submitted || retryLocked || event.button !== 0) return;
    event.preventDefault();
    shotCanvas.setPointerCapture(event.pointerId);
    const start = fraction(event);
    const box = document.createElement("span");
    box.className = "bl-cp-shot-box is-drawing";
    shotCanvas.appendChild(box);
    drag = { startX: start.x, startY: start.y, box };
  });
  shotCanvas.addEventListener("pointermove", (event) => {
    if (!drag) return;
    const at = fraction(event);
    drag.box.style.left = `${Math.min(drag.startX, at.x) * 100}%`;
    drag.box.style.top = `${Math.min(drag.startY, at.y) * 100}%`;
    drag.box.style.width = `${Math.abs(at.x - drag.startX) * 100}%`;
    drag.box.style.height = `${Math.abs(at.y - drag.startY) * 100}%`;
  });
  const endDrag = (event: PointerEvent): void => {
    if (!drag) return;
    const at = fraction(event);
    const r = { x: Math.min(drag.startX, at.x), y: Math.min(drag.startY, at.y), w: Math.abs(at.x - drag.startX), h: Math.abs(at.y - drag.startY) };
    drag.box.remove();
    drag = null;
    const rect = shotImage.getBoundingClientRect();
    // Ignore taps: a black-out needs a few pixels of drag in both directions.
    if (r.w * rect.width < 4 || r.h * rect.height < 4) return;
    redactions.push(r);
    renderRedactions();
    applyRedactions();
  };
  shotCanvas.addEventListener("pointerup", endDrag);
  shotCanvas.addEventListener("pointercancel", () => { drag?.box.remove(); drag = null; });
  shotClear.addEventListener("click", () => {
    redactions = [];
    renderRedactions();
    applyRedactions();
  });
  function renderShotOption(): void {
    shotButton.hidden = !capture || !shotInput.checked;
    shotButton.textContent = preview ? "Retake" : "Preview";
    shotPreview.hidden = !preview || !shotInput.checked;
  }
  function clearPreview(): void {
    if (preview) URL.revokeObjectURL(preview.url);
    preview = null;
    redactions = [];
    renderRedactions();
  }
  shotImage.addEventListener("error", () => {
    // Some sites forbid blob: images; the screenshot itself is still attached.
    shotImage.hidden = true;
    shotCanvas.hidden = true;
    shotCaption.textContent = "This site doesn't allow the preview to be shown, but the screenshot will be attached.";
  });
  async function takePreview(): Promise<void> {
    if (!capture || capturing || submitted || retryLocked || closed) return;
    capturing = true;
    shotButton.disabled = true;
    statusEl.textContent = "Capturing a preview...";
    let blob: Blob | null = null;
    try { blob = await capture(); } catch { blob = null; }
    capturing = false;
    if (closed) return;
    shotButton.disabled = submitted || retryLocked;
    if (!blob) {
      statusEl.textContent = "This page couldn't be captured. You can still post; the comment is saved without a screenshot.";
      return;
    }
    clearPreview();
    preview = { original: blob, blob, url: URL.createObjectURL(blob) };
    shotImage.hidden = false;
    shotCanvas.hidden = false;
    shotCaption.textContent = PREVIEW_NOTE;
    shotImage.src = preview.url;
    statusEl.textContent = "";
    renderShotOption();
  }
  shotButton.addEventListener("click", () => void takePreview());
  shotInput.addEventListener("change", () => {
    try { sessionStorage.setItem(SCREENSHOT_PREF_KEY, shotInput.checked ? "1" : "0"); } catch { /* Storage may be disabled. */ }
    renderShotOption();
  });
  renderShotOption();
  const diagLabel = composer.querySelector<HTMLSpanElement>(".bl-cp-diag-label")!;
  let diagTouched = false;
  function renderDiagnostics(): void {
    const { errors, warnings, requests } = diagnosticsSummary();
    const parts = [
      errors ? `${errors} console error${errors === 1 ? "" : "s"}` : "",
      warnings ? `${warnings} warning${warnings === 1 ? "" : "s"}` : "",
      requests ? `${requests} failed request${requests === 1 ? "" : "s"}` : "",
    ].filter(Boolean);
    diagRow.hidden = parts.length === 0;
    diagLabel.textContent = `Attach ${parts.join(", ")}`;
    const snapshot = diagnosticsSnapshot();
    diagRow.title = snapshot
      ? [...snapshot.console.slice(-5).map(e => `${e.level.toUpperCase()}: ${e.message.slice(0, 140)}`), ...snapshot.network.slice(-5).map(e => `${e.method} ${e.url} → ${e.status || "failed"}`)].join("\n")
      : "";
    // Ticked by default when something went wrong; the reviewer can untick it.
    if (!diagTouched) diagInput.checked = errors + requests > 0;
  }
  diagInput.addEventListener("change", () => { diagTouched = true; });
  renderDiagnostics();
  const stopDiagnosticsWatch = onDiagnosticsChange(renderDiagnostics);
  let recording: { handle: RecordingHandle; button: HTMLButtonElement; timer: number } | null = null;
  const attachments = setupAttachments(
    composer,
    uploadFile,
    (count) => {
      attachLabel.textContent = count > 0 ? "Add another" : "Attach a screenshot";
    },
    (message) => {
      statusEl.textContent = message;
    },
  );
  // No tag until the reviewer picks one: preselecting "Bug" filed copy and design notes
  // as bugs (TDR-0207). Clicking the selected tag again clears it.
  let selectedTag: ComposerTag | null = null;
  let submitted = false;
  let retryLocked = false;
  // Set once the post succeeded: the card lingers a moment to show "Comment posted.",
  // and nothing in it is a draft any more.
  let posted = false;
  let closeDelay = 1200;
  let closed = false;
  // Escape on a written comment arms a discard for a few seconds instead of dropping it.
  let discardArmedUntil = 0;

  const hasDraft = (): boolean =>
    !closed &&
    !posted &&
    (submitted || recording !== null || textarea.value.trim() !== "" || (stepsInput?.value.trim() ?? "") !== "" || attachments.getAttachments().length > 0 || attachments.pendingCount() > 0 || attachments.failedCount() > 0);

  function nudge(): void {
    if (closed) return;
    composer.classList.remove("bl-nudge");
    // Reflow so a second nudge in a row plays the animation again.
    void composer.offsetWidth;
    composer.classList.add("bl-nudge");
    if (!submitted) {
      if (!retryLocked) statusEl.textContent = "Post or cancel this comment first.";
      textarea.focus({ preventScroll: true });
    }
    composer.scrollIntoView({ block: "nearest", behavior: "smooth" });
  }

  const handle = { hasDraft, nudge, cancel };
  activeComposer = handle;

  for (const button of tagButtons) {
    button.addEventListener("click", () => {
      const tag = button.dataset.tag as ComposerTag;
      selectedTag = selectedTag === tag ? null : tag;
      for (const other of tagButtons) other.setAttribute("aria-pressed", String(other.dataset.tag === selectedTag));
    });
  }

  function removeOutsideClickListener(): void {
    document.removeEventListener("click", outsideClickHandler, true);
  }

  function removeComposer(): void {
    if (closed) return;
    closed = true;
    if (activeComposer === handle) activeComposer = null;
    if (recording) { window.clearInterval(recording.timer); recording.handle.cancel(); recording = null; }
    stopDiagnosticsWatch();
    stopPlacement();
    stopAutoGrow();
    removeOutsideClickListener();
    clearPreview();
    textarea.value = "";
    composer.remove();
  }

  function cancel(): void {
    if (closed) return;
    removeComposer();
    if (!submitted) onCancel();
  }

  function setFormDisabled(disabled: boolean): void {
    composer.setAttribute("aria-busy", String(disabled));
    for (const button of [submitButton, closeButton, cancelButton, copyButton]) {
      if (disabled) button.setAttribute("disabled", "true");
      else button.removeAttribute("disabled");
    }
    textarea.readOnly = disabled || retryLocked;
    if (stepsInput) stepsInput.readOnly = disabled || retryLocked;
    for (const button of tagButtons) button.disabled = disabled || retryLocked;
    for (const button of recordButtons) button.disabled = disabled || retryLocked || (recording !== null && recording.button !== button);
    diagInput.disabled = disabled || retryLocked;
    shotInput.disabled = disabled || retryLocked;
    shotButton.disabled = disabled || retryLocked || capturing;
    if (disabled || retryLocked) attachments.disable();
    else attachments.enable();
  }

  function submit(): void {
    const body = textarea.value.trim();
    if (submitted) return;
    if (!body) {
      statusEl.textContent = "Write a comment before posting.";
      textarea.focus({ preventScroll: true });
      return;
    }
    if (recording) {
      statusEl.textContent = "Stop the recording before posting.";
      return;
    }
    // Posting now would silently leave a still-uploading file off the comment.
    if (attachments.pendingCount() > 0) {
      statusEl.textContent = "Wait for the attachment to finish uploading.";
      return;
    }
    if (attachments.failedCount() > 0) {
      statusEl.textContent = "Retry or remove failed attachments before posting.";
      return;
    }
    submitted = true;
    discardArmedUntil = 0;
    statusEl.textContent = retryLocked ? "Retrying the original comment..." : "Preparing your comment...";
    setFormDisabled(true);
    // Capture/anchor/upload callbacks can throw before they reach their API error
    // handler. Handle both synchronous throws and rejected promises here so every
    // adapter keeps the draft and restores its controls for an explicit retry.
    void redacting.then(() => onSubmit({ body, attachments: attachments.getAttachments(), tags: selectedTag ? [selectedTag] : [], diagnostics: diagInput.checked ? diagnosticsSnapshot() : null, stepsToReproduce: stepsInput?.value.trim() || null, includeScreenshot: shotInput.checked, screenshot: shotInput.checked ? preview?.blob : undefined })).then((ok) => {
      if (closed) return;
      if (ok) {
        posted = true;
        if (activeComposer === handle) activeComposer = null;
        // Left up long enough to read the status line's "Comment posted." before it
        // goes - closing immediately would cut that off, and never closing at all is
        // the exact bug this replaces.
        window.setTimeout(removeComposer, closeDelay);
        return;
      }
      // Failed - back to a normal, editable composer so the reviewer can retry or
      // dismiss it themselves, instead of a permanently disabled dead end.
      submitted = false;
      copyButton.hidden = false;
      setFormDisabled(false);
    }).catch((error: unknown) => {
      if (closed) return;
      submitted = false;
      copyButton.hidden = false;
      setFormDisabled(false);
      const detail = error instanceof Error && error.message ? `${error.message} ` : "";
      statusEl.textContent = retryLocked
        ? `${detail}Saving is unconfirmed. Retry save sends the original comment without creating a duplicate. You can also copy the text and check Backline before starting another comment.`
        : `Could not post your comment. ${detail}Your draft is still here. You can edit it and try again, or copy the text.`;
      textarea.focus({ preventScroll: true });
    });
  }

  async function toggleRecording(button: HTMLButtonElement): Promise<void> {
    if (submitted || retryLocked || closed) return;
    if (recording) {
      if (recording.button === button) recording.handle.stop();
      return;
    }
    const kind = button.dataset.kind as RecordingKind;
    const label = button.querySelector("span")!;
    const idleLabel = label.textContent ?? "";
    const idleIcon = button.querySelector("svg")!.outerHTML;
    for (const other of recordButtons) if (other !== button) other.disabled = true;
    button.disabled = true;
    statusEl.textContent = kind === "screen" ? "Choose a tab, window or screen to record…" : "Allow microphone access to record…";
    let handle: RecordingHandle;
    try {
      // Screen recordings also ask for the microphone so the reviewer can talk it
      // through; declining that prompt still records the screen.
      handle = await startRecording(kind, true);
    } catch (error) {
      for (const other of recordButtons) other.disabled = false;
      if (!closed) statusEl.textContent = error instanceof Error ? error.message : "Recording could not start.";
      return;
    }
    if (closed) { handle.cancel(); return; }
    button.disabled = false;
    button.classList.add("bl-is-recording");
    button.querySelector("svg")!.outerHTML = svg(STOP_ICON, 1.8, 14);
    const tick = () => { label.textContent = `Stop · ${formatDuration(handle.elapsedSeconds())} / ${formatDuration(MAX_RECORDING_SECONDS)}`; };
    tick();
    statusEl.textContent = kind === "screen" ? "Recording your screen. Press Stop when you're done." : "Recording a voice note. Press Stop when you're done.";
    recording = { handle, button, timer: window.setInterval(tick, 500) };
    const file = await handle.done;
    if (recording?.handle === handle) { window.clearInterval(recording.timer); recording = null; }
    if (closed) return;
    button.classList.remove("bl-is-recording");
    button.querySelector("svg")!.outerHTML = idleIcon;
    label.textContent = idleLabel;
    for (const other of recordButtons) other.disabled = false;
    if (file) {
      statusEl.textContent = "Recording added. It uploads now and is attached when you post.";
      attachments.addFiles([file]);
    } else {
      statusEl.textContent = "Nothing was recorded.";
    }
  }
  for (const button of recordButtons) button.addEventListener("click", () => void toggleRecording(button));

  closeButton.addEventListener("click", cancel);
  cancelButton.addEventListener("click", cancel);
  submitButton.addEventListener("click", submit);
  copyButton.addEventListener("click", () => {
    void navigator.clipboard?.writeText(textarea.value).then(() => {
      if (!closed) statusEl.textContent = retryLocked
        ? "Text copied. Saving is still unconfirmed; retry this save or check Backline."
        : "Comment text copied. Your draft is still here.";
    }).catch(() => {
      if (closed) return;
      textarea.focus({ preventScroll: true });
      textarea.select();
      statusEl.textContent = `Copy is unavailable here. Your text is selected; press ${isMac ? "⌘" : "Ctrl"}+C to copy it.`;
    });
    if (!navigator.clipboard) {
      textarea.focus({ preventScroll: true });
      textarea.select();
      statusEl.textContent = `Your text is selected; press ${isMac ? "⌘" : "Ctrl"}+C to copy it.`;
    }
  });
  textarea.addEventListener("keydown", (event) => {
    if (event.key === "Enter" && (event.metaKey || event.ctrlKey)) {
      event.preventDefault();
      submit();
    }
  });
  textarea.addEventListener("input", () => {
    discardArmedUntil = 0;
    copyButton.hidden = !textarea.value.trim();
    if (statusEl.textContent === "Post or cancel this comment first.") statusEl.textContent = "";
  });
  composer.addEventListener("animationend", () => composer.classList.remove("bl-nudge"));
  composer.addEventListener("keydown", (event) => {
    if (event.key !== "Escape" || submitted) return;
    event.preventDefault();
    if (!hasDraft() || Date.now() < discardArmedUntil) {
      cancel();
      return;
    }
    discardArmedUntil = Date.now() + 3000;
    statusEl.textContent = retryLocked
      ? "Saving is unconfirmed. Press Esc again to close; check Backline before posting another comment."
      : "Press Esc again to discard this comment.";
  });
  textarea.addEventListener("paste", (event) => {
    const files = pastedImageFiles(event.clipboardData);
    if (files.length === 0) return;
    // A pasted image is never text worth inserting into the comment body.
    event.preventDefault();
    if (submitted || retryLocked) return;
    attachments.addFiles(files);
  });

  // The box starts at one comment's worth of space and grows with what's being typed,
  // up to the max-height its CSS sets, after which it scrolls. placeCard runs again on
  // each growth so a card that was opened near the bottom of the viewport rides up
  // instead of growing off the edge of the screen.
  const stopAutoGrow = autoGrowTextarea(textarea, () => placeCard(composer, x, y));

  const outsideClickHandler = (event: MouseEvent) => {
    // event.target is retargeted to the shadow host when observed from outside the
    // shadow tree (Shadow DOM's event retargeting), so `composer.contains(event.target)`
    // is always false here - even for clicks genuinely inside the composer. composedPath()
    // returns the real, un-retargeted path, which is what this check actually needs.
    if (event.composedPath().includes(composer)) return;
    // Hidden (Browse mode keeps it for later): the click is the site's, not a signal to
    // throw the comment away or to point at a card that can't be seen.
    if (composer.offsetParent === null) return;
    if (hasDraft()) nudge();
    else cancel();
  };
  setTimeout(() => document.addEventListener("click", outsideClickHandler, true), 0);
  setTimeout(() => textarea.focus({ preventScroll: true }), 30);

  return {
    setStatus: (text: string) => {
      statusEl.textContent = text;
    },
    setCloseDelay: (ms: number) => {
      closeDelay = ms;
    },
    setRetryLocked: (locked: boolean) => {
      retryLocked = locked;
      submitButton.innerHTML = `${svg(ARROW_ICON, 2.2)}${locked ? "Retry save" : "Post comment"}`;
      cancelButton.textContent = locked ? "Close" : "Cancel";
      closeButton.setAttribute("aria-label", locked ? "Close comment" : "Cancel comment");
    },
    close: removeComposer,
  };
}
