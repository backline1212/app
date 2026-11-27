/* eslint-disable react-refresh/only-export-components */
import { useEffect, useRef, useState } from "react";

import { useOnClickOutside } from "../../../lib/use-click-outside";
import { ChevronIcon, MonitorIcon } from "../panel/icons";

export interface ViewportOption {
  name: string;
  width: number;
  height: number;
}

interface ViewportGroup {
  label: string;
  options: ViewportOption[];
}

// These presets resize only the safe Backline proxy frame. They do not claim to
// emulate another browser or device; the widget continues to capture the real browser
// context according to the existing contract. Names and widths follow the design's list.
function devices(list: [string, number, number][]): ViewportOption[] {
  return list.map(([name, width, height]) => ({ name, width, height }));
}

export const VIEWPORT_GROUPS: ViewportGroup[] = [
  {
    label: "Desktop",
    options: devices([
      ["Desktop 4K", 2560, 1440], ["Desktop HD", 1920, 1080], ['Laptop 16"', 1536, 960],
      ["Desktop", 1440, 900], ['Laptop 14"', 1366, 768], ["Laptop small", 1280, 800],
    ]),
  },
  {
    label: "Tablet",
    options: devices([
      ['iPad Pro 12.9"', 1024, 1366], ["Surface Pro 7", 912, 1368], ['iPad Pro 11"', 834, 1194],
      ["iPad Air", 820, 1180], ['iPad 10"', 810, 1080], ["Galaxy Tab S8", 800, 1280], ["iPad Mini", 768, 1024],
    ]),
  },
  {
    label: "Tablet landscape",
    options: devices([
      ['iPad Pro 12.9" landscape', 1366, 1024], ["iPad Air landscape", 1180, 820], ["iPad Mini landscape", 1024, 768],
    ]),
  },
  {
    label: "Mobile",
    options: devices([
      ["iPhone 15 Pro Max", 430, 932], ["iPhone XR", 414, 896], ["Pixel 8", 412, 915], ["Galaxy S23 Ultra", 412, 915],
      ["iPhone 15 Pro", 393, 852], ["Pixel 5", 393, 851], ["iPhone SE", 375, 667], ["Galaxy S8+", 360, 740],
      ["Galaxy Fold closed", 344, 882],
    ]),
  },
  {
    label: "Mobile landscape",
    options: devices([
      ["iPhone 15 Pro Max landscape", 932, 430], ["Pixel 8 landscape", 915, 412], ["iPhone 15 Pro landscape", 852, 393],
      ["Galaxy S8+ landscape", 740, 360], ["iPhone SE landscape", 667, 375],
    ]),
  },
  {
    label: "Other",
    options: devices([["Surface Duo", 540, 720], ["Nest Hub", 1024, 600], ["Nest Hub Max", 1280, 800]]),
  },
];

// Names the menu offered before this list: saved links still carry them.
const RETIRED_VIEWPORTS = devices([
  ["Desktop · 1440", 1440, 900], ["Laptop · 1280", 1280, 800], ["Laptop · 1024", 1024, 768],
  ["iPhone 12 Pro", 390, 844], ["Galaxy S20", 412, 915],
]);

// Kept as a flat export for callers that need to resolve a URL-persisted preset.
export const VIEWPORTS = [...VIEWPORT_GROUPS.flatMap((group) => group.options), ...RETIRED_VIEWPORTS];

export const MIN_VIEWPORT_WIDTH = 280;
export const MAX_VIEWPORT_WIDTH = 2560;

/** The design's "1440 px" box: shows the frame's width and sets a custom one. */
export function ViewportWidthInput({ width, onChange }: { width: number | null; onChange: (width: number) => void }) {
  const shown = width === null ? "" : String(width);
  const [draft, setDraft] = useState(shown);
  useEffect(() => setDraft(shown), [shown]);

  function commit() {
    const typed = Number(draft);
    if (!draft || !Number.isFinite(typed)) { setDraft(shown); return; }
    const next = Math.min(MAX_VIEWPORT_WIDTH, Math.max(MIN_VIEWPORT_WIDTH, Math.round(typed)));
    setDraft(String(next));
    if (next !== width) onChange(next);
  }

  return (
    <label className="bl-viewport-width" title={`Frame width, ${MIN_VIEWPORT_WIDTH}–${MAX_VIEWPORT_WIDTH} px`}>
      <input
        type="text"
        inputMode="numeric"
        maxLength={4}
        aria-label="Viewport width in pixels"
        placeholder="auto"
        value={draft}
        onChange={(event) => setDraft(event.target.value.replace(/\D/g, ""))}
        onBlur={commit}
        onKeyDown={(event) => {
          if (event.key === "Enter") commit();
          if (event.key === "Escape") setDraft(shown);
        }}
      />
      <span aria-hidden="true">px</span>
    </label>
  );
}

interface ViewportMenuProps {
  viewport: ViewportOption | null;
  onChange: (viewport: ViewportOption | null) => void;
}

export function ViewportMenu({ viewport, onChange }: ViewportMenuProps) {
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

  function select(option: ViewportOption | null) {
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
        aria-label={`Viewport: ${viewport?.name ?? "Fit canvas"}`}
        aria-expanded={open}
        className="bl-review-control bl-viewport-trigger"
      >
        <MonitorIcon width={14} height={14} />
        <span>{viewport?.name ?? "Fit canvas"}</span>
        <ChevronIcon width={11} height={11} className={open ? "rotate-180" : ""} />
      </button>

      {open && (
        <div className="bl-review-popover bl-viewport-popover" role="menu">
          <div className="bl-review-popover-label">Switch viewport</div>
          <button
            type="button"
            role="menuitemradio"
            aria-checked={viewport === null}
            onClick={() => select(null)}
            className="bl-review-menu-row"
          >
            <span>Fit canvas</span>
            <span>Responsive</span>
          </button>
          {VIEWPORT_GROUPS.map((group) => (
            <div key={group.label} className="bl-viewport-group">
              <div className="bl-review-popover-label">{group.label}</div>
              {group.options.map((option) => (
                <button
                  key={option.name}
                  type="button"
                  role="menuitemradio"
                  aria-checked={viewport?.name === option.name}
                  onClick={() => select(option)}
                  className="bl-review-menu-row"
                >
                  <span>{option.name}</span>
                  <span>{option.width}</span>
                </button>
              ))}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
