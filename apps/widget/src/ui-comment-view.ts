import { STATUS_COLORS, STATUS_LABELS, WORKFLOW_STATUSES } from "./status";
import { attachmentIcon, type AttachmentInfo } from "./ui-attachments";
import { cardHeaderHtml, escapeHtml, placeCard, svg, TAG_ICONS } from "./ui-card";

export interface CommentViewData {
  authorName: string;
  body: string;
  status: string;
  tags: string[];
  attachments: AttachmentInfo[];
  pagePath: string;
}

export interface CommentViewControls {
  close: () => void;
  /** Shows a status the comment was moved to elsewhere (the dashboard, another tab). */
  setStatus: (status: string) => void;
}

const CHEVRON_ICON = '<path d="M6 9l6 6 6-6"/>';
const CHECK_ICON = '<path d="M5 12l5 5L20 7"/>';

const statusLabel = (status: string): string => STATUS_LABELS[status] ?? status;
const statusColor = (status: string): string => STATUS_COLORS[status] ?? STATUS_COLORS.todo;

function attachmentHtml(attachment: AttachmentInfo): string {
  const href = escapeHtml(attachment.url);
  const name = escapeHtml(attachment.filename);
  if (attachment.content_type.startsWith("image/")) {
    return `<a class="bl-attachment-link bl-cv-thumb" href="${href}" target="_blank" rel="noopener noreferrer" title="${name}"><img src="${href}" alt="${name}" /></a>`;
  }
  return `<a class="bl-attachment-link" href="${href}" target="_blank" rel="noopener noreferrer" title="${name}">${attachmentIcon()}<span class="bl-attachment-name">${name}</span></a>`;
}

/**
 * The status pill for the card's header. Only a viewer who can actually change the
 * status gets a button and menu - for everyone else (a guest reviewer on the client's
 * site) it's a plain label, since offering a control the server will refuse is worse
 * than not offering it. Its dot/label/checked state are filled in by renderStatus.
 */
function statusHtml(editable: boolean): string {
  const pill = '<span class="bl-cv-status-dot" aria-hidden="true"></span><span class="bl-cv-status-label"></span>';
  if (!editable) return `<span class="bl-cv-status" title="Status">${pill}</span>`;
  const options = WORKFLOW_STATUSES.map(
    (status) =>
      `<button type="button" class="bl-cv-status-opt" role="menuitemradio" aria-checked="false" data-status="${status}">
        <span class="bl-cv-status-dot" style="background: ${statusColor(status)}" aria-hidden="true"></span>
        <span>${escapeHtml(statusLabel(status))}</span>
        ${svg(CHECK_ICON, 2.2)}
      </button>`,
  ).join("");
  return `
    <div class="bl-cv-status-wrap">
      <button type="button" class="bl-cv-status" aria-haspopup="menu" aria-expanded="false">${pill}${svg(CHEVRON_ICON, 2, 10)}</button>
      <div class="bl-cv-status-menu" role="menu" aria-label="Change status" hidden>${options}</div>
    </div>`;
}

/**
 * The card opened by clicking an *existing* pin: the same box as the new-comment
 * composer (openComposer), but read-only - just the comment as it was posted (its text,
 * the tag it was filed under and any attachments), with no input, tag picker or post
 * button. The one thing it can change is the comment's status, from the header, and
 * only when `onStatusChange` is given (it resolves with the status actually saved).
 * Dismissed by its "x", Escape, or a click anywhere outside it; `onClose` fires once
 * whichever way it closes.
 */
export function openCommentView(
  shadow: ShadowRoot,
  x: number,
  y: number,
  comment: CommentViewData,
  onClose: () => void,
  onStatusChange: ((status: string) => Promise<string>) | null = null,
): CommentViewControls {
  const view = document.createElement("div");
  view.className = "bl-card bl-thread";
  view.setAttribute("role", "dialog");
  view.setAttribute("aria-label", `Comment by ${comment.authorName}`);
  view.innerHTML = `
    ${cardHeaderHtml({
      authorName: comment.authorName,
      title: comment.authorName,
      titleClass: "bl-thread-message-author",
      pagePath: comment.pagePath,
      closeLabel: "Close comment",
      trailingHtml: statusHtml(onStatusChange !== null),
    })}
    <div class="bl-cp-body">
      <p class="bl-thread-message-body bl-cv-text"></p>
      ${
        comment.tags.length > 0
          ? `<div class="bl-cp-sec">
              <span class="bl-cp-lbl">TAGGED AS</span>
              <div class="bl-cp-tags">
                ${comment.tags
                  .map((tag) => `<span class="bl-cp-tag bl-is-on">${svg(TAG_ICONS[tag] ?? "")}${escapeHtml(tag)}</span>`)
                  .join("")}
              </div>
            </div>`
          : ""
      }
      ${
        comment.attachments.length > 0
          ? `<div class="bl-cv-files">${comment.attachments.map(attachmentHtml).join("")}</div>`
          : ""
      }
      ${onStatusChange ? '<p class="bl-status" role="status" aria-live="polite"></p>' : ""}
    </div>
  `;
  // textContent, not innerHTML: the body is user-written text, shown exactly as typed.
  view.querySelector<HTMLParagraphElement>(".bl-cv-text")!.textContent = comment.body;

  const pill = view.querySelector<HTMLElement>(".bl-cv-status")!;
  const trigger = pill instanceof HTMLButtonElement ? pill : null;
  const wrap = view.querySelector<HTMLDivElement>(".bl-cv-status-wrap");
  const menu = view.querySelector<HTMLDivElement>(".bl-cv-status-menu");
  const message = view.querySelector<HTMLParagraphElement>(".bl-status");
  const options = Array.from(view.querySelectorAll<HTMLButtonElement>(".bl-cv-status-opt"));
  let currentStatus = comment.status;
  let pending = false;

  function renderStatus(status: string): void {
    pill.querySelector<HTMLElement>(".bl-cv-status-dot")!.style.background = statusColor(status);
    pill.querySelector<HTMLElement>(".bl-cv-status-label")!.textContent = statusLabel(status);
    trigger?.setAttribute("aria-label", `Status: ${statusLabel(status)}. Change status`);
    for (const option of options) {
      option.setAttribute("aria-checked", String(option.dataset.status === status));
    }
  }
  renderStatus(currentStatus);

  shadow.appendChild(view);
  placeCard(view, x, y);

  const menuOpen = (): boolean => menu !== null && !menu.hidden;

  function openMenu(): void {
    if (!menu || !trigger) return;
    menu.classList.remove("bl-is-up");
    menu.hidden = false;
    trigger.setAttribute("aria-expanded", "true");
    // Opens downward, over the card's body, unless that runs off the bottom of the
    // viewport and there's room for it above the pill instead.
    const menuRect = menu.getBoundingClientRect();
    const triggerRect = trigger.getBoundingClientRect();
    if (menuRect.bottom > window.innerHeight - 8 && triggerRect.top - menuRect.height - 6 >= 8) {
      menu.classList.add("bl-is-up");
    }
    (options.find((option) => option.dataset.status === currentStatus) ?? options[0])?.focus();
  }

  function closeMenu(returnFocus: boolean): void {
    if (!menu || !trigger || menu.hidden) return;
    menu.hidden = true;
    trigger.setAttribute("aria-expanded", "false");
    if (returnFocus) trigger.focus();
  }

  async function chooseStatus(status: string): Promise<void> {
    closeMenu(true);
    if (!onStatusChange || !trigger || pending || status === currentStatus) return;
    const previous = currentStatus;
    pending = true;
    trigger.setAttribute("aria-busy", "true");
    if (message) message.textContent = "";
    // Shown straight away rather than after the round trip, then settled to whatever
    // the server actually saved - or put back, if it refused.
    currentStatus = status;
    renderStatus(status);
    try {
      currentStatus = await onStatusChange(status);
    } catch {
      currentStatus = previous;
      if (message) message.textContent = "Couldn't change the status. Please try again.";
    } finally {
      pending = false;
      trigger.removeAttribute("aria-busy");
      renderStatus(currentStatus);
    }
  }

  if (trigger && menu && wrap) {
    trigger.addEventListener("click", () => {
      if (pending) return;
      if (menuOpen()) closeMenu(false);
      else openMenu();
    });
    for (const option of options) {
      option.addEventListener("click", () => void chooseStatus(option.dataset.status ?? currentStatus));
    }
    menu.addEventListener("keydown", (event) => {
      const index = options.indexOf(event.target as HTMLButtonElement);
      let next = -1;
      if (event.key === "ArrowDown") next = (index + 1) % options.length;
      else if (event.key === "ArrowUp") next = (index - 1 + options.length) % options.length;
      else if (event.key === "Home") next = 0;
      else if (event.key === "End") next = options.length - 1;
      else if (event.key === "Tab") closeMenu(false);
      if (next === -1) return;
      event.preventDefault();
      options[next].focus();
    });
    // A click anywhere else in the card closes the menu, the same way a click outside
    // the card closes the card.
    view.addEventListener("click", (event) => {
      if (menuOpen() && !event.composedPath().includes(wrap)) closeMenu(false);
    });
  }

  let closed = false;
  function close(): void {
    if (closed) return;
    closed = true;
    document.removeEventListener("click", outsideClickHandler, true);
    document.removeEventListener("keydown", escapeHandler, true);
    view.remove();
    onClose();
  }

  view.querySelector<HTMLButtonElement>(".bl-cancel")!.addEventListener("click", close);

  const outsideClickHandler = (event: MouseEvent) => {
    // Same event-retargeting reasoning as openComposer's own outside-click handler.
    if (!event.composedPath().includes(view)) close();
  };
  const escapeHandler = (event: KeyboardEvent) => {
    if (event.key !== "Escape") return;
    // Backs out of an open status menu first; the next Escape closes the card.
    if (menuOpen()) closeMenu(true);
    else close();
  };
  // Deferred so the click that opened this card doesn't immediately count as outside it.
  setTimeout(() => {
    if (closed) return;
    document.addEventListener("click", outsideClickHandler, true);
    document.addEventListener("keydown", escapeHandler, true);
  }, 0);

  return {
    close,
    setStatus: (status) => {
      // A change this card is still waiting on settles to the server's answer itself.
      if (pending || status === currentStatus) return;
      currentStatus = status;
      renderStatus(status);
    },
  };
}
