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
  "image/jpeg,image/png,image/webp,image/gif,application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document,application/vnd.ms-excel,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,text/markdown,.md,video/webm,video/mp4,audio/webm,audio/mp4,audio/ogg";
const MAX_ATTACHMENT_BYTES = 10 * 1024 * 1024;
// Screen/voice recordings made in the composer may use the server's full 20 MiB cap.
const MAX_RECORDING_BYTES = 20 * 1024 * 1024;

export function attachmentIcon(): string {
  return `<svg viewBox="0 0 16 16" width="13" height="13" fill="none" aria-hidden="true"><path d="M11.5 5.5 6.8 10.2a2 2 0 1 1-2.8-2.8l5-5a3 3 0 1 1 4.2 4.2l-5.2 5.2a1 1 0 1 1-1.4-1.4L11 5.9" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
}

/**
 * Uploaded eagerly, one at a time, the moment each file is picked - not deferred until
 * submit - so a reviewer sees per-file upload failures immediately (a chip that just
 * won't leave its pending state) rather than the whole comment silently failing to post
 * later. `uploadFile` does the actual network work (index.ts owns the API client; ui.ts
 * doesn't import it, same separation as everywhere else in this file). A failed chip
 * retains its File for an explicit retry and blocks posting until retried or removed.
 * `onCountChange` reports how many chips are showing (pending uploads included) after
 * every add/remove, for a caller whose attach button label depends on it.
 */
export function setupAttachments(
  composer: HTMLElement,
  uploadFile: (file: File) => Promise<AttachmentResult | null>,
  onCountChange?: (count: number) => void,
  // A file that won't be attached - too large, or its upload failed - says so here,
  // instead of its chip just disappearing.
  onProblem?: (message: string) => void,
): {
  getAttachments: () => AttachmentResult[];
  pendingCount: () => number;
  failedCount: () => number;
  addFiles: (files: File[]) => void;
  disable: () => void;
  enable: () => void;
  reset: () => void;
} {
  const attachmentsEl = composer.querySelector<HTMLDivElement>(".bl-attachments")!;
  const fileInput = composer.querySelector<HTMLInputElement>(".bl-attach-input")!;
  const attachButton = composer.querySelector<HTMLButtonElement>(".bl-attach-button")!;
  const uploaded: AttachmentResult[] = [];
  let pending = 0;
  let disabled = false;
  const reportCount = () => onCountChange?.(attachmentsEl.children.length);

  function addFiles(files: File[]): void {
    if (disabled) return;
    for (const file of files) {
      const media = file.type.startsWith("video/") || file.type.startsWith("audio/");
      if (file.size > (media ? MAX_RECORDING_BYTES : MAX_ATTACHMENT_BYTES)) {
        onProblem?.(`${file.name} is over ${media ? 20 : 10} MB and wasn't attached.`);
        continue;
      }

      const chip = document.createElement("span");
      chip.className = "bl-attachment-chip bl-attachment-pending";
      chip.innerHTML = `${attachmentIcon()}<span class="bl-attachment-name"></span><span class="bl-attachment-failure" hidden>Failed</span><button type="button" class="bl-attachment-retry" hidden>Retry</button><button type="button" class="bl-attachment-remove" aria-label="Remove attachment">&times;</button>`;
      chip.querySelector(".bl-attachment-name")!.textContent = file.name;
      attachmentsEl.appendChild(chip);
      reportCount();

      const removeButton = chip.querySelector<HTMLButtonElement>(".bl-attachment-remove")!;
      const retryButton = chip.querySelector<HTMLButtonElement>(".bl-attachment-retry")!;
      const failureLabel = chip.querySelector<HTMLSpanElement>(".bl-attachment-failure")!;
      let result: AttachmentResult | null = null;
      // Removed before its upload finished: the upload still completes, but it must not
      // be attached to the comment the reviewer took it out of.
      let removed = false;
      removeButton.addEventListener("click", () => {
        if (disabled) return;
        removed = true;
        chip.remove();
        reportCount();
        if (result) {
          const idx = uploaded.indexOf(result);
          if (idx !== -1) uploaded.splice(idx, 1);
        }
      });

      function attemptUpload(): void {
        chip.classList.remove("bl-attachment-failed");
        chip.classList.add("bl-attachment-pending");
        retryButton.hidden = true;
        failureLabel.hidden = true;
        pending += 1;
        void uploadFile(file)
          .catch(() => null)
          .then((uploadedResult) => {
            pending -= 1;
            if (removed) return;
            chip.classList.remove("bl-attachment-pending");
            if (!uploadedResult) {
              chip.classList.add("bl-attachment-failed");
              retryButton.hidden = false;
              failureLabel.hidden = false;
              onProblem?.(`${file.name} couldn't be uploaded. Retry or remove it.`);
              return;
            }
            result = uploadedResult;
            uploaded.push(uploadedResult);
          });
      }
      retryButton.addEventListener("click", () => {
        if (!disabled && !removed) attemptUpload();
      });
      attemptUpload();
    }
  }

  attachButton.addEventListener("click", () => fileInput.click());

  fileInput.addEventListener("change", () => {
    const files = Array.from(fileInput.files ?? []);
    fileInput.value = "";
    addFiles(files);
  });

  return {
    getAttachments: () => uploaded,
    pendingCount: () => pending,
    failedCount: () => attachmentsEl.querySelectorAll(".bl-attachment-failed").length,
    addFiles,
    disable: () => {
      disabled = true;
      attachButton.setAttribute("disabled", "true");
      fileInput.setAttribute("disabled", "true");
      attachmentsEl.querySelectorAll<HTMLButtonElement>("button").forEach(button => { button.disabled = true; });
    },
    enable: () => {
      disabled = false;
      attachButton.removeAttribute("disabled");
      fileInput.removeAttribute("disabled");
      attachmentsEl.querySelectorAll<HTMLButtonElement>("button").forEach(button => { button.disabled = false; });
    },
    reset: () => {
      uploaded.length = 0;
      attachmentsEl.innerHTML = "";
      reportCount();
    },
  };
}
