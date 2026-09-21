import { useState, useRef, useEffect } from "react";
import { useOnClickOutside } from "../../../lib/use-click-outside";
import { useFocusTrap } from "../../../lib/use-focus-trap";
import { ThemeToggle } from "../../../components/ThemeToggle";
import { CommentsIcon } from "../panel/icons";
import { GearIcon } from "../../../components/icons";
import { BrandMark } from "../../../components/BrandMark";
import { NotificationBell } from "../../notifications/NotificationBell";

interface QuickToolsDockProps {
  environment: string;
  mode: "browse" | "comment" | "draw";
  onModeChange?: (mode: "browse" | "comment" | "draw") => void;
}

export function QuickToolsDock({ environment, mode, onModeChange }: QuickToolsDockProps) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [preferencesOpen, setPreferencesOpen] = useState(false);
  const [startHidden, setStartHidden] = useState(() => localStorage.getItem("bl-dock-hidden") === "true");
  const [hidden, setHidden] = useState(startHidden);

  const menuRef = useRef<HTMLDivElement>(null);
  useOnClickOutside(menuRef, () => setMenuOpen(false));

  const prefRef = useRef<HTMLDivElement>(null);
  useOnClickOutside(prefRef, () => setPreferencesOpen(false));
  // Styled and behaves like a real modal (its own header + close button), unlike the
  // plain dropdown menu above it - so it gets the same Escape + focus-trap protections
  // every other modal in the app has, instead of only closing via click-outside/the X.
  useFocusTrap(prefRef, preferencesOpen);

  useEffect(() => {
    if (!menuOpen && !preferencesOpen) return;
    function onKeyDown(event: KeyboardEvent) {
      if (event.key !== "Escape") return;
      setMenuOpen(false);
      setPreferencesOpen(false);
    }
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [menuOpen, preferencesOpen]);

  useEffect(() => {
    localStorage.setItem("bl-dock-hidden", String(startHidden));
  }, [startHidden]);

  // Global shortcut to unhide
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.ctrlKey && e.key === ".") {
        setHidden((h) => !h);
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);

  if (hidden) {
    return null;
  }

  return (
    <div className="bl-quick-dock-wrapper">
      <div className="bl-quick-dock" role="toolbar" aria-label="Quick tools dock">
        <div className="bl-dock-logo">
          <BrandMark compact />
        </div>
        <div className="bl-dock-divider" />
        <button type="button" className="bl-dock-env">
          <span className={`bl-review-environment is-${environment}`}><i aria-hidden="true" /></span>
          {environment}
        </button>
        <div className="bl-dock-divider" />
        <button type="button" className={`bl-dock-btn ${mode === "comment" ? "active" : ""}`} onClick={() => onModeChange?.("comment")} aria-label="Comment (C)" title="Comment (C)">
          <CommentsIcon width={16} height={16} />
        </button>
        <button type="button" className={`bl-dock-btn ${mode === "draw" ? "active" : ""}`} onClick={() => onModeChange?.("draw")} aria-label="Draw Region (D)" title="Draw Region (D)">
          <span style={{ fontSize: "16px", lineHeight: 1 }}>✛</span>
        </button>
        <NotificationBell />
        <div className="bl-dock-divider" />
        <div style={{ position: "relative" }} ref={menuRef}>
          <button type="button" className="bl-dock-btn" onClick={() => setMenuOpen(!menuOpen)} aria-label="More" title="More">
            <GearIcon width={16} height={16} />
          </button>
          {menuOpen && (
            <div className="bl-dock-menu">
              <div className="bl-dock-menu-head">Quick Tools</div>
              <button type="button" className="bl-dock-menu-item" onClick={() => setHidden(true)}>
                Hide Toolbar <kbd>Ctrl .</kbd>
              </button>
              <button type="button" className="bl-dock-menu-item" onClick={() => { setMenuOpen(false); setPreferencesOpen(true); }}>
                <GearIcon width={14} height={14} /> Preferences
              </button>
              <button type="button" className="bl-dock-menu-item" onClick={() => {
                setMenuOpen(false);
                // Triggering a custom event to open the shortcuts modal
                window.dispatchEvent(new CustomEvent("backline:open-shortcuts"));
              }}>
                <BrandMark compact /> Keyboard Shortcuts
              </button>
            </div>
          )}
        </div>
      </div>

      {preferencesOpen && (
        <div className="bl-dock-prefs-modal" ref={prefRef}>
          <div className="bl-dock-prefs-head">
            <h3>Preferences</h3>
            <button type="button" className="bl-icon" aria-label="Close preferences" onClick={() => setPreferencesOpen(false)}>×</button>
          </div>
          <div className="bl-dock-prefs-body">
            <div className="bl-setting-row bl-setting-row-static">
              <span className="bl-setting-copy">
                <strong>Theme</strong>
                <span>Select your theme preference.</span>
              </span>
              <ThemeToggle />
            </div>
            <label className="bl-setting-row">
              <span className="bl-setting-copy">
                <strong>Start Hidden</strong>
                <span>Hide the toolbar on load. You can use <kbd>Ctrl .</kbd> to show it.</span>
              </span>
              <input
                className="bl-switch-input"
                type="checkbox"
                checked={startHidden}
                onChange={(e) => setStartHidden(e.target.checked)}
              />
              <span className="bl-switch" aria-hidden="true"><i /></span>
            </label>
          </div>
        </div>
      )}
    </div>
  );
}
