import { useCallback, useEffect, useRef, useState } from "react";
import type { ReactNode } from "react";
import { ChevronLeftIcon, ChevronRightIcon } from "./icons";

/** A horizontal scroller that shows when columns are off-screen: the edge fades and a
 *  button scrolls one viewport over. Used by the ticket and project boards, whose sixth
 *  column ("Won't fix") sat hidden past the edge on laptop screens. */
export function HScroll({ className, label, children }: { className: string; label: string; children: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  const [edges, setEdges] = useState({ left: false, right: false });

  const measure = useCallback(() => {
    const el = ref.current;
    if (!el) return;
    const left = el.scrollLeft > 4;
    const right = el.scrollLeft + el.clientWidth < el.scrollWidth - 4;
    setEdges((old) => (old.left === left && old.right === right ? old : { left, right }));
  }, []);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    for (const child of Array.from(el.children)) observer.observe(child);
    return () => observer.disconnect();
  }, [measure]);

  function scrollBy(direction: 1 | -1) {
    const el = ref.current;
    if (!el) return;
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    el.scrollBy({ left: direction * el.clientWidth * 0.8, behavior: reduce ? "auto" : "smooth" });
  }

  return (
    <div className="bl-hscroll" data-more-left={edges.left} data-more-right={edges.right}>
      <div ref={ref} className={className} onScroll={measure} role="region" aria-label={label} tabIndex={0}>
        {children}
      </div>
      <button type="button" className="bl-hscroll-btn is-left" aria-label="Scroll left" tabIndex={-1} onClick={() => scrollBy(-1)}>
        <ChevronLeftIcon />
      </button>
      <button type="button" className="bl-hscroll-btn is-right" aria-label="Scroll right" tabIndex={-1} onClick={() => scrollBy(1)}>
        <ChevronRightIcon />
      </button>
    </div>
  );
}
