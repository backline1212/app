import { registerRelatedDraft } from "./ui-composer";
import { placeCard } from "./ui-card";

export interface ThreadReplyRequest {
  body: string;
  layer: "client" | "team";
  client_request_id: string;
}

/** A reply stays outside the re-rendered thread content, so polling/realtime never
 * replaces its text, focus or immutable retry request. No draft leaves memory. */
export function setupThreadReply(
  view: HTMLElement,
  x: number,
  y: number,
  layer: "client" | "team",
  post: (request: ThreadReplyRequest) => Promise<void>,
) {
  const form = document.createElement("form");
  form.className = "bl-cv-reply-form";
  form.innerHTML = `
    <label class="bl-cp-lbl">Reply to this thread
      <textarea aria-label="Reply to this thread" placeholder="Write a reply…" maxlength="10000" required></textarea>
    </label>
    <p class="bl-cv-visibility">${layer === "team" ? "Team only" : "Visible to client reviewers"}</p>
    <p class="bl-status" role="status" aria-live="polite"></p>
    <button type="button" class="bl-copy-draft" hidden>Copy reply text</button>
    <div class="bl-cp-foot">
      <button type="button" class="bl-cp-cancel bl-reply-clear">Clear reply</button>
      <button type="submit" class="bl-submit">Post reply</button>
    </div>
    <div class="bl-reply-discard" hidden>
      <p>Discard this reply? If saving is unconfirmed, check Backline before posting it again.</p>
      <button type="button" class="bl-cp-cancel bl-reply-keep">Keep writing</button>
      <button type="button" class="bl-cp-cancel bl-reply-discard-confirm">Discard reply</button>
    </div>`;
  view.querySelector(".bl-cp-body")!.appendChild(form);
  const text = form.querySelector("textarea")!;
  const message = form.querySelector<HTMLElement>(".bl-status")!;
  const submit = form.querySelector<HTMLButtonElement>(".bl-submit")!;
  const clear = form.querySelector<HTMLButtonElement>(".bl-reply-clear")!;
  const copy = form.querySelector<HTMLButtonElement>(".bl-copy-draft")!;
  const discard = form.querySelector<HTMLElement>(".bl-reply-discard")!;
  let request: ThreadReplyRequest | null = null;
  let pending = false;
  let disposed = false;
  let afterDiscard: (() => void) | null = null;
  let slowTimer: ReturnType<typeof setTimeout> | null = null;

  const hasDraft = () => !disposed && (pending || request !== null || text.value.trim() !== "");
  function nudge(): void {
    if (disposed) return;
    view.scrollIntoView({ block: "nearest" });
    text.focus({ preventScroll: true });
    if (!pending && !request) message.textContent = "Post or clear this reply before switching comments or review modes.";
  }
  const unregister = registerRelatedDraft({ hasDraft, nudge });
  function render(): void {
    text.readOnly = pending || request !== null;
    submit.disabled = pending;
    clear.disabled = pending;
    copy.hidden = !text.value.trim();
    submit.textContent = pending ? "Saving reply…" : request ? "Retry reply save" : "Post reply";
    form.setAttribute("aria-busy", String(pending));
    placeCard(view, x, y);
  }
  function askDiscard(continuation: () => void): boolean {
    if (!hasDraft()) return true;
    if (pending) {
      message.textContent = "Wait for this reply save to finish. Keep this page open.";
      nudge();
      return false;
    }
    afterDiscard = continuation;
    discard.hidden = false;
    form.querySelector<HTMLButtonElement>(".bl-reply-keep")!.focus();
    placeCard(view, x, y);
    return false;
  }
  function reset(): void {
    request = null;
    text.value = "";
    discard.hidden = true;
    afterDiscard = null;
    render();
  }
  form.addEventListener("submit", event => {
    event.preventDefault();
    if (pending || disposed) return;
    if (!request) {
      const body = text.value.trim();
      if (!body) { message.textContent = "Write a reply before posting."; text.focus(); return; }
      request = { body, layer, client_request_id: crypto.randomUUID() };
    }
    const original = request;
    pending = true;
    discard.hidden = true;
    afterDiscard = null;
    message.textContent = "Saving reply…";
    render();
    slowTimer = setTimeout(() => {
      if (!disposed && pending) message.textContent = "Still waiting for Backline. Keep this page open; do not post the reply again in another tab.";
    }, 20_000);
    void Promise.resolve().then(() => post(original)).then(() => {
      if (disposed) return;
      pending = false;
      reset();
      message.textContent = "Reply posted.";
    }).catch((error: unknown) => {
      if (disposed) return;
      pending = false;
      const detail = error instanceof Error && error.message ? `${error.message} ` : "";
      message.textContent = `${detail}Saving is unconfirmed. Retry sends the same reply. You can copy the text and check Backline before clearing it.`;
      render();
    }).finally(() => {
      if (slowTimer) clearTimeout(slowTimer);
      slowTimer = null;
    });
  });
  text.addEventListener("input", () => { discard.hidden = true; afterDiscard = null; render(); });
  text.addEventListener("keydown", event => {
    if (event.key === "Enter" && (event.ctrlKey || event.metaKey)) {
      event.preventDefault();
      form.requestSubmit();
    }
  });
  clear.addEventListener("click", () => {
    if (askDiscard(() => { reset(); message.textContent = "Reply cleared."; text.focus(); })) {
      reset(); text.focus();
    }
  });
  form.querySelector(".bl-reply-keep")!.addEventListener("click", () => {
    discard.hidden = true; afterDiscard = null; text.focus(); placeCard(view, x, y);
  });
  form.querySelector(".bl-reply-discard-confirm")!.addEventListener("click", () => {
    if (pending) return;
    const continuation = afterDiscard;
    reset();
    continuation?.();
  });
  copy.addEventListener("click", () => {
    const manualCopy = () => {
      if (disposed) return;
      text.focus(); text.select();
      message.textContent = "Your reply text is selected. Press Ctrl+C or ⌘C to copy it.";
    };
    if (!navigator.clipboard) { manualCopy(); return; }
    void navigator.clipboard.writeText(text.value).then(() => {
      if (!disposed) message.textContent = "Reply text copied. Your draft is still here; saving status has not changed.";
    }).catch(manualCopy);
  });
  const beforeUnload = (event: BeforeUnloadEvent) => {
    if (!hasDraft()) return;
    event.preventDefault();
    event.returnValue = "";
  };
  window.addEventListener("beforeunload", beforeUnload);
  return {
    hasDraft,
    nudge,
    canClose: (close: () => void) => askDiscard(close),
    dispose: () => {
      disposed = true;
      unregister();
      if (slowTimer) clearTimeout(slowTimer);
      window.removeEventListener("beforeunload", beforeUnload);
      request = null;
      text.value = "";
      form.remove();
    },
  };
}
