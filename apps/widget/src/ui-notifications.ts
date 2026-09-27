// F7 (01-Product-Vision.md, 07-Review-SDK.md §7.2): "single tooltip, dismissed after
// first successful comment" - the timeout is just a fallback for a reviewer who never
// comments at all; `dismiss()` is what the empty-state requirement actually describes,
// called the moment a comment successfully posts (index.ts).
export function showTooltip(shadow: ShadowRoot): { dismiss: () => void } {
  const tooltip = document.createElement("div");
  tooltip.className = "bl-tooltip";
  tooltip.textContent = "Tap anywhere on the page to leave feedback.";
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

export function promptForName(shadow: ShadowRoot): Promise<string> {
  return new Promise((resolve) => {
    const form = document.createElement("form");
    form.className = "bl-name-form";
    form.innerHTML = `
      <label for="bl-name-input" style="font-size:13px;font-weight:600;">Your name</label>
      <input id="bl-name-input" type="text" required placeholder="Jamie" />
      <button type="submit">Continue</button>
    `;
    form.addEventListener("submit", (event) => {
      event.preventDefault();
      const input = form.querySelector("input")!;
      const value = input.value.trim();
      if (!value) return;
      form.remove();
      resolve(value);
    });
    shadow.appendChild(form);
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
