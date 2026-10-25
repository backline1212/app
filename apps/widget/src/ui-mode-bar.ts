import { svg } from "./ui-card";

export type ReviewTool = "browse" | "comment" | "draw";

const TOOLS: { mode: ReviewTool; label: string; icon: string; hint: string }[] = [
  { mode: "browse", label: "Browse", icon: '<path d="M5 3l14 8-6 2-2 6z"/>', hint: "Use the site normally: links and buttons work, pins are hidden." },
  { mode: "comment", label: "Comment", icon: '<path d="M21 12a8 8 0 0 1-11.6 7.1L4 20l1-4.6A8 8 0 1 1 21 12z"/>', hint: "Click anything on the page to leave feedback on it." },
  { mode: "draw", label: "Draw", icon: '<rect x="4" y="4" width="16" height="16" rx="2" stroke-dasharray="3 3"/>', hint: "Drag over an area to leave feedback on it." },
];

/**
 * Browse / Comment / Draw for a reviewer on the real site (TDR-0187). Before this a
 * client was always in Comment mode, so every click - links included - started a
 * comment and they could not move around the site. The dashboard canvas and the
 * extension have their own toolbars and never show this one.
 */
export function createModeBar(shadow: ShadowRoot, initial: ReviewTool, onChange: (mode: ReviewTool) => boolean) {
  const bar = document.createElement("div");
  bar.className = "bl-modebar";
  bar.setAttribute("role", "toolbar");
  bar.setAttribute("aria-label", "Review tools");
  const buttons = new Map<ReviewTool, HTMLButtonElement>();
  for (const tool of TOOLS) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "bl-modebar-btn";
    button.title = tool.hint;
    button.innerHTML = `${svg(tool.icon, 1.8, 14)}<span>${tool.label}</span>`;
    button.addEventListener("click", (event) => {
      event.stopPropagation();
      if (onChange(tool.mode)) setMode(tool.mode);
    });
    buttons.set(tool.mode, button);
    bar.appendChild(button);
  }
  function setMode(mode: ReviewTool): void {
    for (const [key, button] of buttons) button.setAttribute("aria-pressed", String(key === mode));
  }
  setMode(initial);
  shadow.appendChild(bar);
  return { setMode, remove: () => bar.remove() };
}
