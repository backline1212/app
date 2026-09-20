import { attachmentIcon, type AttachmentInfo } from "./ui-attachments";
import { cardHeaderHtml, escapeHtml, placeCard, svg, TAG_ICONS } from "./ui-card";

export interface CommentViewData {
  authorName: string;
  body: string;
  tags: string[];
  attachments: AttachmentInfo[];
  pagePath: string;
}

export interface CommentViewControls {
  close: () => void;
}

function attachmentHtml(attachment: AttachmentInfo): string {
  const href = escapeHtml(attachment.url);
  const name = escapeHtml(attachment.filename);
  if (attachment.content_type.startsWith("image/")) {
    return `<a class="bl-attachment-link bl-cv-thumb" href="${href}" target="_blank" rel="noopener noreferrer" title="${name}"><img src="${href}" alt="${name}" /></a>`;
  }
  return `<a class="bl-attachment-link" href="${href}" target="_blank" rel="noopener noreferrer" title="${name}">${attachmentIcon()}<span class="bl-attachment-name">${name}</span></a>`;
}

/**
 * The card opened by clicking an *existing* pin: the same box as the new-comment
 * composer (openComposer), but read-only - just the comment as it was posted (its text,
 * the tag it was filed under and any attachments), with no input, tag picker or post
 * button. Dismissed by its "x", Escape, or a click anywhere outside it; `onClose` fires
 * once whichever way it closes.
 */
export function openCommentView(
  shadow: ShadowRoot,
  x: number,
  y: number,
  comment: CommentViewData,
  onClose: () => void,
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
    </div>
  `;
  // textContent, not innerHTML: the body is user-written text, shown exactly as typed.
  view.querySelector<HTMLParagraphElement>(".bl-cv-text")!.textContent = comment.body;
  shadow.appendChild(view);
  placeCard(view, x, y);

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
    if (event.key === "Escape") close();
  };
  // Deferred so the click that opened this card doesn't immediately count as outside it.
  setTimeout(() => {
    if (closed) return;
    document.addEventListener("click", outsideClickHandler, true);
    document.addEventListener("keydown", escapeHandler, true);
  }, 0);

  return { close };
}
