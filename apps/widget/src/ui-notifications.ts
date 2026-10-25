// F7 (01-Product-Vision.md, 07-Review-SDK.md §7.2): "single tooltip, dismissed after
// first successful comment" - the timeout is just a fallback for a reviewer who never
// comments at all; `dismiss()` is what the empty-state requirement actually describes,
// called the moment a comment successfully posts (index.ts).
export function showTooltip(shadow: ShadowRoot): { dismiss: () => void } {
  const tooltip = document.createElement("div");
  tooltip.className = "bl-tooltip";
  tooltip.textContent = "Click anything on the page to leave feedback. Choose Browse to use the site normally.";
  shadow.appendChild(tooltip);
  const timer = setTimeout(() => tooltip.remove(), 6000);
  return {
    dismiss: () => {
      clearTimeout(timer);
      tooltip.remove();
    },
  };
}

export function showToast(shadow: ShadowRoot, text: string): void {
  const toast = document.createElement("div");
  toast.className = "bl-toast";
  toast.textContent = text;
  shadow.appendChild(toast);
  setTimeout(() => toast.remove(), 6000);
}

export function showOfflineIndicator(shadow: ShadowRoot): { dismiss: () => void; setStatus: (status: string) => void } {
  const toast = document.createElement("div");
  toast.className = "bl-toast bl-toast-offline";
  toast.setAttribute("role", "status");
  toast.setAttribute("aria-live", "polite");
  toast.setAttribute("aria-atomic", "true");
  toast.textContent = "Connection lost. Trying to reconnect...";
  shadow.appendChild(toast);
  return {
    dismiss: () => toast.remove(),
    setStatus: (status: string) => { toast.textContent = status; },
  };
}

export interface ReviewerIdentity {
  name: string;
  /** Optional: where the team's replies and resolutions are emailed (TDR-0164). */
  email?: string | null;
}

/** The first thing a reviewer sees when a site embeds the review snippet directly. */
export function promptForName(shadow: ShadowRoot): Promise<ReviewerIdentity> {
  return new Promise((resolve) => {
    const form = document.createElement("form");
    form.className = "bl-name-form";
    form.setAttribute("aria-labelledby", "bl-name-title");
    form.innerHTML = `
      <h2 id="bl-name-title">Leave feedback on this page</h2>
      <p>Add your name so the team knows who left each comment.</p>
      <label>Your name<input name="name" type="text" required maxlength="100" autocomplete="name" placeholder="Jamie Lee" /></label>
      <label>Email <span>(optional)</span><input name="email" type="email" maxlength="254" autocomplete="email" placeholder="you@company.com" /></label>
      <p class="bl-name-note">Only used to email you when the team replies to or resolves your feedback.</p>
      <button type="submit">Start reviewing</button>
    `;
    form.addEventListener("submit", (event) => {
      event.preventDefault();
      const name = form.querySelector<HTMLInputElement>('input[name="name"]')!.value.trim();
      const email = form.querySelector<HTMLInputElement>('input[name="email"]')!.value.trim();
      if (!name) return;
      form.remove();
      resolve({ name: name.slice(0, 100), email: email || null });
    });
    shadow.appendChild(form);
    form.querySelector<HTMLInputElement>('input[name="name"]')!.focus();
  });
}

/** x/y are page (document) coordinates - e.g. MouseEvent.pageX/pageY, not clientX/
 * clientY - so the pin scrolls with the content instead of drifting off the element
 * it marks the moment the reviewer scrolls (.bl-pin is position: absolute). */
export function renderPin(shadow: ShadowRoot, x: number, y: number, ticketNumber?: number | null): HTMLElement {
  const pin = document.createElement("div");
  pin.className = "bl-pin";
  pin.style.left = `${x}px`;
  pin.style.top = `${y}px`;
  if (ticketNumber != null) pin.textContent = String(ticketNumber);
  shadow.appendChild(pin);
  return pin;
}
