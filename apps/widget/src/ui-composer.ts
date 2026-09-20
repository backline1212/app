import { ATTACHMENT_ACCEPT, setupAttachments, type AttachmentResult } from "./ui-attachments";
import { cardHeaderHtml, escapeHtml, placeCard, svg, TAG_ICONS } from "./ui-card";

// The first four of the backend's Tag vocabulary (comments/schemas.py's Tag literal) -
// the same four the design's "Tag this as" row offers. Single-select with the first one
// pressed by default, exactly as the design behaves.
export const COMPOSER_TAGS = ["Bug", "Copy", "Design", "Responsive"] as const;
export type ComposerTag = (typeof COMPOSER_TAGS)[number];

export interface ComposerResult {
  body: string;
  attachments: AttachmentResult[];
  tags: ComposerTag[];
}

/** What the composer shows about who's commenting and where - the header's avatar and
 * page pill, and the device/browser/width facts row. */
export interface ComposerDetails {
  authorName: string;
  pagePath: string;
  browser: string;
  /** "320 × 140" for a drawn-region comment; omitted for a point comment. */
  regionSize?: string;
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

// Same width breakpoints the design's devKind() uses.
function deviceKind(width: number): keyof typeof DEVICE_ICONS {
  if (width <= 560) return "Mobile";
  if (width <= 1024) return "Tablet";
  return "Desktop";
}

/** Grows `textarea` to fit its content, capped by the max-height in its stylesheet.
 * A height the reviewer set themselves by dragging the corner becomes a floor, so
 * typing can push the box taller but a keystroke never undoes their drag. */
function autoGrowTextarea(textarea: HTMLTextAreaElement, onResize: () => void): void {
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
}

/**
 * x/y are page (document) coordinates, same as renderPin (see placeCard).
 *
 * `onCancel` fires exactly once whenever the composer is dismissed *without* a
 * successful submit - the explicit "x" or Cancel button, or a click elsewhere on the
 * page - never after a real submit. The caller (index.ts) uses it to remove this
 * attempt's pin, the other half of a real bug found by hand: every click created a pin
 * with no cleanup path at all, so an abandoned or click-elsewhere-cancelled comment left
 * a permanent, unremovable stray pin behind - clicking around a page a few times filled
 * it with pins nothing could ever get rid of.
 */
export function openComposer(
  shadow: ShadowRoot,
  x: number,
  y: number,
  onSubmit: (result: ComposerResult) => void,
  onCancel: () => void,
  uploadFile: (file: File) => Promise<AttachmentResult | null>,
  details: ComposerDetails,
): { setStatus: (text: string) => void; close: () => void } {
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
      <div class="bl-cp-sec">
        <span class="bl-cp-lbl">TAG THIS AS</span>
        <div class="bl-cp-tags" role="group" aria-label="Tag this as">
          ${COMPOSER_TAGS.map(
            (tag, i) =>
              `<button type="button" class="bl-cp-tag" data-tag="${tag}" aria-pressed="${i === 0}">${svg(TAG_ICONS[tag])}${tag}</button>`,
          ).join("")}
        </div>
      </div>
      <div class="bl-cp-shots">
        <div class="bl-attachments"></div>
        <button type="button" class="bl-attach-button bl-cp-attach">${svg(IMAGE_ICON, 1.8, 14)}<span class="bl-cp-attach-label">Attach a screenshot</span></button>
        <input type="file" class="bl-attach-input" accept="${ATTACHMENT_ACCEPT}" multiple hidden aria-label="Choose files to attach" />
      </div>
      <div class="bl-cp-ctx">
        ${svg(DEVICE_ICONS[device])}${device}
        <span class="bl-cp-sep" aria-hidden="true"></span>${svg(GLOBE_ICON)}${escapeHtml(details.browser)}
        <span class="bl-cp-sep" aria-hidden="true"></span>${width}px
        ${details.regionSize ? `<span class="bl-cp-rgn">${svg(REGION_ICON, 2)}${escapeHtml(details.regionSize)}</span>` : ""}
      </div>
      <div class="bl-status" role="status" aria-live="polite"></div>
      <div class="bl-cp-foot">
        <span class="bl-cp-hint"><kbd>${isMac ? "&#8984;" : "Ctrl"}</kbd> <kbd>&#8629;</kbd> to post</span>
        <button type="button" class="bl-cp-cancel">Cancel</button>
        <button type="button" class="bl-submit">${svg(ARROW_ICON, 2.2)}Post comment</button>
      </div>
    </div>
  `;
  shadow.appendChild(composer);

  placeCard(composer, x, y);

  const statusEl = composer.querySelector<HTMLDivElement>(".bl-status")!;
  const submitButton = composer.querySelector<HTMLButtonElement>(".bl-submit")!;
  const closeButton = composer.querySelector<HTMLButtonElement>(".bl-cancel")!;
  const cancelButton = composer.querySelector<HTMLButtonElement>(".bl-cp-cancel")!;
  const attachLabel = composer.querySelector<HTMLSpanElement>(".bl-cp-attach-label")!;
  const tagButtons = Array.from(composer.querySelectorAll<HTMLButtonElement>(".bl-cp-tag"));
  const textarea = composer.querySelector("textarea")!;
  const attachments = setupAttachments(composer, uploadFile, (count) => {
    attachLabel.textContent = count > 0 ? "Add another" : "Attach a screenshot";
  });
  let selectedTag: ComposerTag = COMPOSER_TAGS[0];
  let submitted = false;

  for (const button of tagButtons) {
    button.addEventListener("click", () => {
      selectedTag = button.dataset.tag as ComposerTag;
      for (const other of tagButtons) other.setAttribute("aria-pressed", String(other === button));
    });
  }

  function removeOutsideClickListener(): void {
    document.removeEventListener("click", outsideClickHandler, true);
  }

  function cancel(): void {
    removeOutsideClickListener();
    composer.remove();
    if (!submitted) onCancel();
  }

  function submit(): void {
    const body = textarea.value.trim();
    if (!body || submitted) return;
    submitted = true;
    for (const button of [submitButton, closeButton, cancelButton, ...tagButtons]) {
      button.setAttribute("disabled", "true");
    }
    attachments.disable();
    onSubmit({ body, attachments: attachments.getAttachments(), tags: [selectedTag] });
  }

  closeButton.addEventListener("click", cancel);
  cancelButton.addEventListener("click", cancel);
  submitButton.addEventListener("click", submit);
  textarea.addEventListener("keydown", (event) => {
    if (event.key === "Enter" && (event.metaKey || event.ctrlKey)) {
      event.preventDefault();
      submit();
    }
  });

  // The box starts at one comment's worth of space and grows with what's being typed,
  // up to the max-height its CSS sets, after which it scrolls. placeCard runs again on
  // each growth so a card that was opened near the bottom of the viewport rides up
  // instead of growing off the edge of the screen.
  autoGrowTextarea(textarea, () => placeCard(composer, x, y));

  const outsideClickHandler = (event: MouseEvent) => {
    // event.target is retargeted to the shadow host when observed from outside the
    // shadow tree (Shadow DOM's event retargeting), so `composer.contains(event.target)`
    // is always false here - even for clicks genuinely inside the composer. composedPath()
    // returns the real, un-retargeted path, which is what this check actually needs.
    if (!event.composedPath().includes(composer)) {
      cancel();
    }
  };
  setTimeout(() => document.addEventListener("click", outsideClickHandler, true), 0);
  setTimeout(() => textarea.focus({ preventScroll: true }), 30);

  return {
    setStatus: (text: string) => {
      statusEl.textContent = text;
    },
    close: () => {
      removeOutsideClickListener();
      composer.remove();
    },
  };
}
