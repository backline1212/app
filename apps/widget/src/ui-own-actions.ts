import { registerRelatedDraft } from "./ui-composer";
import { placeCard } from "./ui-card";

/** What the viewer may do to a comment they wrote themselves. The server checks
 * authorship again on every call; these only decide which buttons appear. */
export interface OwnCommentActions {
  edit: (body: string) => Promise<void>;
  remove: () => Promise<void>;
  resolve: (() => Promise<void>) | null;
}

export interface OwnCommentState {
  body: string;
  status: string;
  replyCount: number;
}

const CLOSED_STATUSES = new Set(["resolved", "wont_fix"]);

/**
 * Edit, Delete and Mark resolved for the viewer's own comment. Kept outside the
 * re-rendered thread content (like the reply form), so polling or realtime updates
 * never replace an edit that is in progress.
 */
export function setupOwnActions(
  view: HTMLElement,
  x: number,
  y: number,
  actions: OwnCommentActions,
  initial: OwnCommentState,
) {
  const box = document.createElement("div");
  box.className = "bl-cv-own";
  box.innerHTML = `
    <div class="bl-cv-own-row">
      <button type="button" class="bl-cv-own-btn bl-own-edit">Edit</button>
      <button type="button" class="bl-cv-own-btn bl-own-delete">Delete</button>
      <button type="button" class="bl-cv-own-btn bl-own-resolve">Mark resolved</button>
    </div>
    <form class="bl-cv-edit" hidden>
      <textarea aria-label="Edit your comment" maxlength="10000" required></textarea>
      <div class="bl-cp-foot">
        <button type="button" class="bl-cp-cancel bl-edit-cancel">Cancel</button>
        <button type="submit" class="bl-submit">Save</button>
      </div>
    </form>
    <div class="bl-cv-confirm" role="alertdialog" aria-label="Delete comment" hidden>
      <p>Delete this comment? This can't be undone.</p>
      <div class="bl-cp-foot">
        <button type="button" class="bl-cp-cancel bl-delete-keep">Keep it</button>
        <button type="button" class="bl-submit bl-delete-confirm">Delete comment</button>
      </div>
    </div>
    <p class="bl-status" role="status" aria-live="polite"></p>`;
  view.querySelector(".bl-cv-content")!.after(box);

  const row = box.querySelector<HTMLElement>(".bl-cv-own-row")!;
  const editButton = box.querySelector<HTMLButtonElement>(".bl-own-edit")!;
  const deleteButton = box.querySelector<HTMLButtonElement>(".bl-own-delete")!;
  const resolveButton = box.querySelector<HTMLButtonElement>(".bl-own-resolve")!;
  const form = box.querySelector<HTMLFormElement>(".bl-cv-edit")!;
  const text = form.querySelector("textarea")!;
  const save = form.querySelector<HTMLButtonElement>(".bl-submit")!;
  const cancel = form.querySelector<HTMLButtonElement>(".bl-edit-cancel")!;
  const confirm = box.querySelector<HTMLElement>(".bl-cv-confirm")!;
  const confirmDelete = confirm.querySelector<HTMLButtonElement>(".bl-delete-confirm")!;
  const message = box.querySelector<HTMLElement>(".bl-status")!;

  let state = initial;
  let editing = false;
  let confirming = false;
  let pending = false;
  let disposed = false;

  const hasDraft = () => !disposed && (pending || (editing && text.value.trim() !== state.body.trim()));
  function nudge(): void {
    if (disposed) return;
    view.scrollIntoView({ block: "nearest" });
    if (editing) text.focus({ preventScroll: true });
    if (!pending) message.textContent = "Save or cancel your edit first.";
  }
  const unregister = registerRelatedDraft({ hasDraft, nudge });

  function render(): void {
    view.classList.toggle("bl-is-editing", editing);
    row.hidden = editing || confirming;
    form.hidden = !editing;
    confirm.hidden = !confirming;
    // Once someone has replied, the first message holds their thread together.
    deleteButton.hidden = state.replyCount > 0;
    resolveButton.hidden = !actions.resolve || CLOSED_STATUSES.has(state.status);
    for (const button of [editButton, deleteButton, resolveButton, save, cancel, confirmDelete]) {
      button.disabled = pending;
    }
    text.readOnly = pending;
    save.textContent = pending && editing ? "Saving…" : "Save";
    confirmDelete.textContent = pending && confirming ? "Deleting…" : "Delete comment";
    box.setAttribute("aria-busy", String(pending));
    placeCard(view, x, y);
  }

  function run(task: () => Promise<void>, done: string, failed: string): void {
    pending = true;
    message.textContent = "";
    render();
    void Promise.resolve().then(task).then(() => {
      if (disposed) return;
      pending = false;
      editing = false;
      confirming = false;
      message.textContent = done;
      render();
    }).catch((error: unknown) => {
      if (disposed) return;
      pending = false;
      message.textContent = error instanceof Error && error.message ? error.message : failed;
      render();
    });
  }

  editButton.addEventListener("click", () => {
    editing = true;
    text.value = state.body;
    message.textContent = "";
    render();
    text.focus();
    text.setSelectionRange(text.value.length, text.value.length);
  });
  cancel.addEventListener("click", () => {
    if (pending) return;
    editing = false;
    message.textContent = "";
    render();
    editButton.focus();
  });
  form.addEventListener("submit", (event) => {
    event.preventDefault();
    if (pending) return;
    const body = text.value.trim();
    if (!body) { message.textContent = "Write something before saving."; text.focus(); return; }
    if (body === state.body.trim()) { editing = false; message.textContent = ""; render(); return; }
    run(() => actions.edit(body), "Comment updated.", "Couldn't save your edit. Your text is still here; try again.");
  });
  text.addEventListener("keydown", (event) => {
    if (event.key === "Enter" && (event.ctrlKey || event.metaKey)) {
      event.preventDefault();
      form.requestSubmit();
    }
  });
  deleteButton.addEventListener("click", () => {
    confirming = true;
    message.textContent = "";
    render();
    confirm.querySelector<HTMLButtonElement>(".bl-delete-keep")!.focus();
  });
  confirm.querySelector(".bl-delete-keep")!.addEventListener("click", () => {
    if (pending) return;
    confirming = false;
    render();
    deleteButton.focus();
  });
  // A successful delete closes the whole card (the caller removes the thread).
  confirmDelete.addEventListener("click", () => {
    if (!pending) run(actions.remove, "", "Couldn't delete the comment. Please try again.");
  });
  resolveButton.addEventListener("click", () => {
    if (!pending && actions.resolve) run(actions.resolve, "Marked resolved.", "Couldn't resolve the comment. Please try again.");
  });
  render();

  return {
    hasDraft,
    nudge,
    update: (next: Partial<OwnCommentState>) => {
      if (disposed) return;
      state = { ...state, ...next };
      render();
    },
    dispose: () => {
      disposed = true;
      unregister();
      box.remove();
    },
  };
}
