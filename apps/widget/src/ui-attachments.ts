export interface AttachmentResult {
  key: string;
  filename: string;
  content_type: string;
}

// The shape a *display-ready* attachment takes (mirrors the backend's AttachmentOut) -
// a fetchable url, not the upload-time key. Distinct from AttachmentResult above (what
// uploadFile returns while composing) since the widget never re-derives one from the
// other; they're just used in different places (composing vs. rendering an existing
// message).
export interface AttachmentInfo {
  filename: string;
  url: string;
  content_type: string;
}

// "for now" support (images, PDF, Word/Excel docs, Markdown) - matches the backend
// allowlist (backend/app/modules/storage/schemas.py) exactly; the `accept` attribute is
// just a UI hint (the browser's own file picker still lets a user override it), the real
// enforcement is server-side.
export const ATTACHMENT_ACCEPT =
  "image/jpeg,image/png,image/webp,image/gif,application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document,application/vnd.ms-excel,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,text/markdown,.md";
const MAX_ATTACHMENT_BYTES = 10 * 1024 * 1024;

export function attachmentIcon(): string {
  return `<svg viewBox="0 0 16 16" width="13" height="13" fill="none" aria-hidden="true"><path d="M11.5 5.5 6.8 10.2a2 2 0 1 1-2.8-2.8l5-5a3 3 0 1 1 4.2 4.2l-5.2 5.2a1 1 0 1 1-1.4-1.4L11 5.9" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
}

/**
 * Uploaded eagerly, one at a time, the moment each file is picked - not deferred until
 * submit - so a reviewer sees per-file upload failures immediately (a chip that just
 * won't leave its pending state) rather than the whole comment silently failing to post
 * later. `uploadFile` does the actual network work (index.ts owns the API client; ui.ts
 * doesn't import it, same separation as everywhere else in this file) and returns null
 * on failure, which removes the chip and never gets included in the submitted result.
 * `onCountChange` reports how many chips are showing (pending uploads included) after
 * every add/remove, for a caller whose attach button label depends on it.
 */
export function setupAttachments(
  composer: HTMLElement,
  uploadFile: (file: File) => Promise<AttachmentResult | null>,
  onCountChange?: (count: number) => void,
): { getAttachments: () => AttachmentResult[]; disable: () => void; reset: () => void } {
  const attachmentsEl = composer.querySelector<HTMLDivElement>(".bl-attachments")!;
  const fileInput = composer.querySelector<HTMLInputElement>(".bl-attach-input")!;
  const attachButton = composer.querySelector<HTMLButtonElement>(".bl-attach-button")!;
  const uploaded: AttachmentResult[] = [];
  const reportCount = () => onCountChange?.(attachmentsEl.children.length);

  attachButton.addEventListener("click", () => fileInput.click());

  fileInput.addEventListener("change", () => {
    const files = Array.from(fileInput.files ?? []);
    fileInput.value = "";
    for (const file of files) {
      if (file.size > MAX_ATTACHMENT_BYTES) continue;

      const chip = document.createElement("span");
      chip.className = "bl-attachment-chip bl-attachment-pending";
      chip.innerHTML = `${attachmentIcon()}<span class="bl-attachment-name"></span><button type="button" class="bl-attachment-remove" aria-label="Remove attachment">&times;</button>`;
      chip.querySelector(".bl-attachment-name")!.textContent = file.name;
      attachmentsEl.appendChild(chip);
      reportCount();

      const removeButton = chip.querySelector<HTMLButtonElement>(".bl-attachment-remove")!;
      let result: AttachmentResult | null = null;
      removeButton.addEventListener("click", () => {
        chip.remove();
        reportCount();
        if (result) {
          const idx = uploaded.indexOf(result);
          if (idx !== -1) uploaded.splice(idx, 1);
        }
      });

      void uploadFile(file).then((uploadedResult) => {
        if (!uploadedResult) {
          chip.remove();
          reportCount();
          return;
        }
        result = uploadedResult;
        uploaded.push(uploadedResult);
        chip.classList.remove("bl-attachment-pending");
      });
    }
  });

  return {
    getAttachments: () => uploaded,
    disable: () => {
      attachButton.setAttribute("disabled", "true");
      fileInput.setAttribute("disabled", "true");
    },
    reset: () => {
      uploaded.length = 0;
      attachmentsEl.innerHTML = "";
      reportCount();
    },
  };
}
