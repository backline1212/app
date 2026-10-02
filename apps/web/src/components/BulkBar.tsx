import { useEffect, useRef, useState, type ReactNode } from "react";
import { useOnClickOutside } from "../lib/use-click-outside";
import type { Selection } from "../lib/use-selection";

// A row checkbox (TDR-0058). Clicks never reach the row underneath, which opens the
// item; shift-click passes `range` so the list can select everything in between.
export function SelectBox({ checked, indeterminate = false, label, onToggle, className = "" }: {
  checked: boolean;
  indeterminate?: boolean;
  label: string;
  onToggle: (range: boolean) => void;
  className?: string;
}) {
  const ref = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (ref.current) ref.current.indeterminate = indeterminate;
  }, [indeterminate]);
  return (
    <label className={`bl-cbx ${className}`} onClick={(e) => e.stopPropagation()} onKeyDown={(e) => e.stopPropagation()}>
      <input
        ref={ref}
        type="checkbox"
        aria-label={label}
        checked={checked}
        onChange={() => undefined}
        onClick={(e) => onToggle(e.shiftKey)}
      />
      <span aria-hidden="true">
        <svg viewBox="0 0 24 24" width="11" height="11" fill="none" stroke="currentColor" strokeWidth="3.2" strokeLinecap="round" strokeLinejoin="round">
          {indeterminate ? <path d="M6 12h12" /> : <path d="M20 6 9 17l-5-5" />}
        </svg>
      </span>
    </label>
  );
}

// The "select every row on this page" box for a list's header or toolbar.
export function SelectAllBox({ selection, noun }: { selection: Selection; noun: string }) {
  return (
    <SelectBox
      checked={selection.allSelected}
      indeterminate={selection.someSelected}
      label={selection.allSelected ? `Clear selected ${noun}` : `Select all ${noun} on this page`}
      onToggle={() => selection.toggleAll()}
    />
  );
}

// The floating bar that appears once anything is selected: how many, the actions that
// apply to all of them, and a way out. It sits at the bottom of the viewport so it is
// reachable from anywhere in a long list without scrolling back to the toolbar.
export function BulkBar({ count, noun, onClear, busy, children }: {
  count: number;
  noun: string;
  onClear: () => void;
  busy?: string | null;
  children: ReactNode;
}) {
  if (count === 0) return null;
  return (
    <div className="bl-bulkbar" role="region" aria-label={`Actions for selected ${noun}`}>
      <span className="bl-bulkbar-count" aria-live="polite">
        <b>{count}</b> {noun.replace(/s$/, count === 1 ? "" : "s")} selected
      </span>
      <span className="bl-bulkbar-sep" aria-hidden="true" />
      {busy ? (
        <span className="bl-bulkbar-busy" role="status">
          <i aria-hidden="true" />
          {busy}
        </span>
      ) : (
        <div className="bl-bulkbar-actions">{children}</div>
      )}
      <button type="button" className="bl-bulkbar-clear" onClick={onClear} disabled={Boolean(busy)} aria-label="Clear selection" title="Clear selection (Esc)">
        <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
          <path d="M18 6 6 18M6 6l12 12" />
        </svg>
      </button>
    </div>
  );
}

export interface BulkOption {
  id: string;
  label: string;
  dot?: string;
}

// A bar action that needs one choice first (a status, a priority, a person). The menu
// opens upward, since the bar lives at the bottom of the screen.
export function BulkMenu({ label, options, onPick, disabled }: {
  label: string;
  options: readonly BulkOption[];
  onPick: (id: string) => void;
  disabled?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useOnClickOutside(ref, () => setOpen(false));
  return (
    <div className="bl-bulkmenu" ref={ref} onKeyDown={(e) => { if (e.key === "Escape" && open) { e.preventDefault(); setOpen(false); } }}>
      <button type="button" className="bl-bulkbar-btn" aria-haspopup="menu" aria-expanded={open} disabled={disabled} onClick={() => setOpen((v) => !v)}>
        {label}
        <svg viewBox="0 0 24 24" width="11" height="11" fill="none" stroke="currentColor" strokeWidth="2.2" aria-hidden="true">
          <path d="m6 15 6-6 6 6" />
        </svg>
      </button>
      {open && (
        <div className="bl-bulkmenu-pop" role="menu" aria-label={label}>
          {options.map((o) => (
            <button key={o.id} type="button" role="menuitem" onClick={() => { setOpen(false); onPick(o.id); }}>
              {o.dot && <i style={{ background: o.dot }} aria-hidden="true" />}
              {o.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
