export function showSessionNotice(shadow: ShadowRoot, message: string, reviewUrl?: string): void {
  // Protected threads/composers must not remain visible after their session ends.
  shadow.replaceChildren();
  const notice = document.createElement("div");
  notice.setAttribute("data-backline-session-notice", "true");
  notice.setAttribute("role", "alert");
  notice.style.cssText = "position:fixed;bottom:20px;right:20px;z-index:2147483647;max-width:320px;padding:16px;background:#fff;color:#222;border:1px solid #ccc;border-radius:8px;box-shadow:0 4px 24px #0002;font:14px/1.5 system-ui;pointer-events:auto";
  const text = document.createElement("p");
  text.textContent = message;
  notice.append(text);
  if (reviewUrl) {
    try {
      const url = new URL(reviewUrl);
      if (url.protocol === "https:" || url.protocol === "http:") {
        const rejoin = document.createElement("a");
        rejoin.href = url.href;
        rejoin.target = "_blank";
        rejoin.rel = "noopener noreferrer";
        rejoin.textContent = "Return to Backline";
        notice.append(rejoin);
      }
    } catch { /* A malformed URL never becomes a navigation target. */ }
  }
  const dismiss = document.createElement("button");
  dismiss.type = "button";
  dismiss.textContent = "Dismiss";
  dismiss.style.marginLeft = "12px";
  dismiss.onclick = () => { (shadow.host as HTMLElement).remove(); };
  notice.append(dismiss);
  shadow.append(notice);
}
