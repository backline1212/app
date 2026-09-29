import { useEffect, useRef, useState } from "react";
import { useOnClickOutside } from "../../../lib/use-click-outside";
import { ChevronIcon } from "../panel/icons";
import { BROWSERS, type BrowserOption } from "./browsers";

interface BrowserMenuProps {
  browser: BrowserOption;
  onChange: (browser: BrowserOption) => void;
}

export function BrowserMenu({ browser, onChange }: BrowserMenuProps) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);

  useOnClickOutside(ref, () => setOpen(false));

  useEffect(() => {
    if (!open) return;
    function onKeyDown(event: KeyboardEvent) {
      if (event.key !== "Escape") return;
      setOpen(false);
      triggerRef.current?.focus();
    }
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [open]);

  function select(option: BrowserOption) {
    onChange(option);
    setOpen(false);
  }

  return (
    <div className="bl-review-popover-anchor" ref={ref}>
      <button
        ref={triggerRef}
        type="button"
        onClick={() => setOpen((prev) => !prev)}
        aria-haspopup="menu"
        aria-expanded={open}
        className="bl-review-control bl-viewport-trigger"
      >
        <div style={{ display: "flex", width: 14, height: 14 }}>
          {browser.icon}
        </div>
        <span>{browser.name}</span>
        <ChevronIcon width={11} height={11} className={open ? "rotate-180" : ""} />
      </button>

      {open && (
        <div className="bl-review-popover bl-viewport-popover" role="menu" aria-label="Browser">
          <div className="bl-review-popover-label">CAPTURE AS</div>
          {BROWSERS.map((option) => (
            <button
              key={option.name}
              type="button"
              role="menuitemradio"
              aria-checked={browser.name === option.name}
              onClick={() => select(option)}
              className="bl-review-menu-row"
            >
              <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                <div style={{ width: 14, height: 14, color: "var(--bl-muted)" }}>{option.icon}</div>
                <span>{option.name}</span>
              </div>
              <span>{option.version}</span>
            </button>
          ))}
          <div className="bl-review-popover-sep" style={{ borderTop: "1px solid var(--bl-line)", margin: "4px 0" }} />
          <div style={{ padding: "2px 10px 6px", fontFamily: "var(--bl-mono)", fontSize: "12px", color: "var(--ink-4)", lineHeight: "1.5" }}>
            Sets the browser recorded on new comments. Real cross-engine screenshots run on Backline’s device grid.
          </div>
        </div>
      )}
    </div>
  );
}
