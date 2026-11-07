import type { NativeReviewInfo } from "@backline/types";
import { createShadowRoot, setCardBottomInset } from "@backline/widget";
import { nativeMessage } from "./native-client";

export type ReviewMode = "browse" | "point" | "region";

export function createNativeToolbar(info: NativeReviewInfo, onMode: (mode: ReviewMode) => Promise<void>, onEnd: () => Promise<void>) {
  const shadow = createShadowRoot();
  const style = document.createElement("style");
  style.textContent = `
    .native-bar {position:fixed;bottom:16px;left:50%;transform:translateX(-50%);z-index:2147483647;
      display:flex;flex-wrap:wrap;align-items:center;gap:6px;max-width:calc(100vw - 24px);width:max-content;
      background:#fff;color:#0b0b0b;border:1px solid #dddeda;border-radius:12px;padding:10px;box-shadow:0 5px 30px #0003;font:13px system-ui;}
    .native-bar button,.native-bar a {font:inherit;border:1px solid #dddeda;border-radius:7px;padding:8px 10px;background:#fff;color:#0b0b0b;cursor:pointer;text-decoration:none;}
    .native-bar button[aria-pressed=true] {background:#e3f8ef;border-color:#0a6b4b;}
    .native-status {flex-basis:100%;font-size:12px;max-width:530px;color:#515650;}
    .native-bar button.native-offer {background:#fff;border:1px dashed #0a6b4b;color:#0a6b4b;}
    .native-bar.is-min > :not(.native-title):not(.native-min) {display:none;}
    .native-bar.is-min {padding:6px 6px 6px 10px;gap:4px;}
    .native-bar button.native-min {padding:8px 10px;min-width:36px;}
    .native-title {max-width:180px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;margin:0 8px;}
  `;
  shadow.appendChild(style);
  const bar = document.createElement("div");
  bar.className = "native-bar";
  bar.setAttribute("role", "toolbar");
  bar.setAttribute("aria-label", "Backline browser review");
  const title = document.createElement("strong");
  title.className = "native-title";
  title.textContent = info.project.name;
  bar.appendChild(title);
  const buttons = new Map<ReviewMode, HTMLButtonElement>();
  const status = document.createElement("div");
  let accessEnded = false;
  let removed = false;
  let changingMode = false;
  status.className = "native-status";
  status.setAttribute("role", "status");
  // Set once the minimise button exists; choosing Comment/Draw always shows the tools.
  let expandTools: (() => void) | null = null;
  function setMode(mode: ReviewMode) {
    if (accessEnded || removed) return;
    if (mode !== "browse") expandTools?.();
    buttons.forEach((button, key) => button.setAttribute("aria-pressed", String(key === mode)));
    status.textContent = mode === "browse" ? "Browse and sign in normally. Choose Comment when you're ready."
      : mode === "point" ? "Click an element to leave a comment." : "Drag over an area to leave a comment.";
  }
  for (const [mode, label] of [["browse", "Browse"], ["point", "Comment"], ["region", "Draw"]] as const) {
    const button = document.createElement("button");
    button.textContent = label;
    button.onclick = () => {
      if (changingMode || accessEnded || removed) return;
      changingMode = true;
      buttons.forEach(item => { item.disabled = true; });
      void onMode(mode).then(() => setMode(mode), error => {
        if (!accessEnded && !removed) status.textContent = error.message;
      }).finally(() => {
        changingMode = false;
        if (!accessEnded && !removed) buttons.forEach(item => { item.disabled = false; });
      });
    };
    buttons.set(mode, button);
    bar.appendChild(button);
  }
  const back = document.createElement("button");
  back.textContent = "Return to Backline";
  back.onclick = () => { void nativeMessage("native-review-return").catch(error => { status.textContent = error.message; }); };
  bar.appendChild(back);
  const end = document.createElement("button");
  end.textContent = "Close website tools";
  end.onclick = () => { void onEnd().then(remove, error => { status.textContent = error.message; }); };
  bar.appendChild(end);
  // Collapses to the project name and this button, so the bar stops covering the
  // site's own cookie banners, sticky buttons and chat bubbles while browsing.
  const minimize = document.createElement("button");
  minimize.className = "native-min";
  const setMinimized = (min: boolean) => {
    bar.classList.toggle("is-min", min);
    minimize.textContent = min ? "Show tools" : "–";
    minimize.setAttribute("aria-label", min ? "Show Backline tools" : "Hide Backline tools");
    minimize.setAttribute("aria-expanded", String(!min));
    try { sessionStorage.setItem("backline:toolbar-min", min ? "1" : "0"); } catch { /* Storage may be blocked. */ }
  };
  minimize.onclick = () => setMinimized(!bar.classList.contains("is-min"));
  expandTools = () => { if (bar.classList.contains("is-min")) setMinimized(false); };
  bar.appendChild(minimize);
  bar.appendChild(status);
  shadow.appendChild(bar);
  let startMinimized = false;
  try { startMinimized = sessionStorage.getItem("backline:toolbar-min") === "1"; } catch { /* Storage may be blocked. */ }
  setMinimized(startMinimized);
  setMode("browse");
  const reserveToolbarSpace = () => {
    const rect = bar.getBoundingClientRect();
    // Native screenshots temporarily hide the overlay. Retain its space until it
    // is visible again instead of moving the draft behind it during capture.
    if (rect.height > 0) setCardBottomInset(window.innerHeight - rect.top + 12);
  };
  const observer = new ResizeObserver(reserveToolbarSpace);
  observer.observe(bar);
  reserveToolbarSpace();
  function remove(): void {
    if (removed) return;
    removed = true;
    observer.disconnect();
    shadow.host.remove();
    setCardBottomInset(12);
  }
  /** A one-off action the user has to choose (nothing happens until they click). */
  function offer(label: string, run: () => Promise<string>): void {
    if (accessEnded || removed) return;
    const button = document.createElement("button");
    button.textContent = label;
    button.className = "native-offer";
    const dismiss = document.createElement("button");
    dismiss.textContent = "Not now";
    dismiss.onclick = () => { button.remove(); dismiss.remove(); };
    button.onclick = () => {
      button.disabled = true;
      dismiss.remove();
      void run().then(message => { if (!removed) status.textContent = message; }, error => {
        if (!removed) status.textContent = error instanceof Error ? error.message : String(error);
      }).finally(() => button.remove());
    };
    bar.insertBefore(button, status);
    bar.insertBefore(dismiss, status);
  }
  return {
    setMode, remove, offer, error: (message: string) => { if (!accessEnded && !removed) status.textContent = message; },
    endAccess: (message: string) => {
      accessEnded = true;
      title.textContent = "Backline";
      buttons.forEach(button => { button.disabled = true; button.setAttribute("aria-pressed", "false"); });
      status.textContent = message;
    },
  };
}
