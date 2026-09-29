import type { NativeReviewInfo } from "@backline/types";
import { createShadowRoot } from "@backline/widget";

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
  status.className = "native-status";
  status.setAttribute("role", "status");
  function setMode(mode: ReviewMode) {
    buttons.forEach((button, key) => button.setAttribute("aria-pressed", String(key === mode)));
    status.textContent = mode === "browse" ? "Browse and sign in normally. Choose Comment when you're ready."
      : mode === "point" ? "Click an element to leave a comment." : "Drag over an area to leave a comment.";
  }
  for (const [mode, label] of [["browse", "Browse"], ["point", "Comment"], ["region", "Draw"]] as const) {
    const button = document.createElement("button");
    button.textContent = label;
    button.onclick = () => { void onMode(mode).then(() => setMode(mode), error => { status.textContent = error.message; }); };
    buttons.set(mode, button);
    bar.appendChild(button);
  }
  const back = document.createElement("a");
  back.textContent = "Backline";
  back.href = info.returnUrl;
  back.target = "_blank";
  back.rel = "noopener noreferrer";
  bar.appendChild(back);
  const end = document.createElement("button");
  end.textContent = "End review";
  end.onclick = () => { void onEnd().then(() => shadow.host.remove(), error => { status.textContent = error.message; }); };
  bar.appendChild(end);
  bar.appendChild(status);
  shadow.appendChild(bar);
  setMode("browse");
  return { setMode, remove: () => shadow.host.remove(), error: (message: string) => { status.textContent = message; } };
}
