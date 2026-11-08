import { useEffect, useLayoutEffect, useRef } from "react";
import { useLocation, useNavigationType } from "react-router-dom";

// Workspace pages scroll inside .bl-main (the sidebar layout); other pages scroll the window.
function scroller(): HTMLElement | null {
  return document.querySelector<HTMLElement>(".bl-main");
}
function readScroll(): number {
  const el = scroller();
  return el ? el.scrollTop : window.scrollY;
}
function writeScroll(top: number) {
  const el = scroller();
  if (el) el.scrollTop = top;
  window.scrollTo(0, el ? 0 : top);
}

// Positions of pages you've left, by history entry, so Back returns you where you were.
const positions = new Map<string, number>();

export function ScrollToTop() {
  const { pathname, key } = useLocation();
  const navigationType = useNavigationType();
  const lastPath = useRef(pathname);

  // Remember where the page you're leaving was scrolled to.
  useLayoutEffect(() => () => { positions.set(key, readScroll()); }, [key]);

  useLayoutEffect(() => {
    const saved = navigationType === "POP" ? positions.get(key) : undefined;
    const pageChanged = lastPath.current !== pathname;
    lastPath.current = pathname;
    if (saved === undefined) {
      // A new page starts at the top; filters or a ticket opened over the same list don't move it.
      if (pageChanged) writeScroll(0);
      return;
    }
    if (!pageChanged) return;
    // Back/Forward: the list may still be loading, so keep trying until it's tall enough.
    let frames = 0;
    let raf = 0;
    const restore = () => {
      writeScroll(saved);
      if (Math.abs(readScroll() - saved) > 2 && frames++ < 60) raf = requestAnimationFrame(restore);
    };
    restore();
    return () => cancelAnimationFrame(raf);
  // eslint-disable-next-line react-hooks/exhaustive-deps -- once per history entry
  }, [key]);

  useEffect(() => {
    // Focus restoration for screen readers
    const focusContent = () => {
      const mainContent = document.querySelector<HTMLElement>('#workspace-content, main, .bl-project-route');
      if (mainContent && !document.querySelector('dialog[open]')) {
        mainContent.setAttribute('tabindex', '-1');
        mainContent.focus({ preventScroll: true });
        return true;
      }
      return false;
    };
    if (focusContent()) return;
    const observer = new MutationObserver(() => { if (focusContent()) observer.disconnect(); });
    observer.observe(document.body, { childList: true, subtree: true });
    return () => observer.disconnect();
  }, [pathname]);

  return null;
}
