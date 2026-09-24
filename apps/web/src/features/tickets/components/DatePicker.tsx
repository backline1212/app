import { useMemo, useRef, useState, type KeyboardEvent, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { useFocusTrap } from "../../../lib/use-focus-trap";
import { useOnClickOutside } from "../../../lib/use-click-outside";
import { closestPortalTarget, useFloatingPosition } from "../../../lib/use-floating-position";

// Generate locale-aware weekday names
const getWeekdays = () => {
  const baseDate = new Date(2023, 0, 1); // A known Sunday
  const formatter = new Intl.DateTimeFormat(navigator.language || 'en', { weekday: 'narrow' });
  return Array.from({ length: 7 }).map((_, i) => {
    const date = new Date(baseDate);
    date.setDate(baseDate.getDate() + i);
    return formatter.format(date);
  });
};

function utcKey(year: number, month: number, day: number): string {
  return `${year}-${String(month + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}T00:00:00Z`;
}

// `triggerClassName`/`children` restyle just the trigger button (the project review
// drawer's comment detail uses a compact date chip); the calendar itself is unchanged.
export function DatePicker({
  value,
  onChange,
  triggerClassName,
  children,
}: {
  value: string | null | undefined;
  onChange: (date: string | null) => void;
  triggerClassName?: string;
  children?: ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const popoverRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  // The popover is portaled out of the flow (closestPortalTarget) so it can escape
  // any ancestor with overflow:auto/hidden instead of being clipped by it - so
  // click-outside has to watch the portaled node too, since it no longer shares a DOM
  // subtree with rootRef.
  const popoverPos = useFloatingPosition(triggerRef, popoverRef, open);

  useFocusTrap(popoverRef, open);
  useOnClickOutside([rootRef, popoverRef], () => setOpen(false));

  // We keep 'month' as a local Date representing the displayed month/year (ignoring its day)
  const [month, setMonth] = useState(() => {
    if (value) {
      // Parse as UTC to avoid timezone shift, then use those UTC parts to create a local Date for calendar rendering
      const d = new Date(value);
      return new Date(d.getUTCFullYear(), d.getUTCMonth(), 1);
    }
    return new Date();
  });

  const weekdays = useMemo(getWeekdays, []);

  function closeAndRestoreFocus() {
    setOpen(false);
    requestAnimationFrame(() => triggerRef.current?.focus());
  }

  const handleDateSelect = (d: number) => {
    onChange(utcKey(month.getFullYear(), month.getMonth(), d));
    closeAndRestoreFocus();
  };

  const handleToday = () => {
    const now = new Date();
    onChange(utcKey(now.getFullYear(), now.getMonth(), now.getDate()));
    closeAndRestoreFocus();
  };

  const handleClear = () => {
    onChange(null);
    closeAndRestoreFocus();
  };

  const first = new Date(month.getFullYear(), month.getMonth(), 1);
  const days = new Date(month.getFullYear(), month.getMonth() + 1, 0).getDate();
  const cells = Array.from({ length: Math.ceil((first.getDay() + days) / 7) * 7 }, (_, i) => i - first.getDay() + 1);
  const weeks = Array.from({ length: cells.length / 7 }, (_, w) => cells.slice(w * 7, (w + 1) * 7));

  // Format the currently selected value for the button
  const displayValue = value ? new Intl.DateTimeFormat(navigator.language || 'en').format(
    new Date(new Date(value).getUTCFullYear(), new Date(value).getUTCMonth(), new Date(value).getUTCDate())
  ) : 'Select date...';

  const monthLabel = new Intl.DateTimeFormat(navigator.language || 'en', { month: "long", year: "numeric" }).format(month);

  // Helper to check if a rendered day matches the selected UTC value
  const isSelected = (day: number) => {
    if (!value) return false;
    const d = new Date(value);
    return d.getUTCDate() === day && d.getUTCMonth() === month.getMonth() && d.getUTCFullYear() === month.getFullYear();
  };

  const today = new Date();
  const isToday = (day: number) =>
    today.getDate() === day && today.getMonth() === month.getMonth() && today.getFullYear() === month.getFullYear();
  const selectedDate = value ? new Date(value) : null;
  const focusableDay = selectedDate &&
    selectedDate.getUTCFullYear() === month.getFullYear() &&
    selectedDate.getUTCMonth() === month.getMonth()
    ? selectedDate.getUTCDate()
    : today.getFullYear() === month.getFullYear() && today.getMonth() === month.getMonth()
      ? today.getDate()
      : 1;

  // Keyboard navigation for calendar grid
  const handleGridKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    const target = e.target as HTMLElement;
    if (target.getAttribute("role") !== 'gridcell') return;

    const day = parseInt(target.dataset.day || "0", 10);
    if (!day) return;

    let nextDay = day;
    if (e.key === 'ArrowRight') nextDay += 1;
    else if (e.key === 'ArrowLeft') nextDay -= 1;
    else if (e.key === 'ArrowDown') nextDay += 7;
    else if (e.key === 'ArrowUp') nextDay -= 7;
    else return;

    e.preventDefault();
    if (nextDay >= 1 && nextDay <= days) {
      const btn = popoverRef.current?.querySelector(`button[data-day="${nextDay}"]`) as HTMLButtonElement | null;
      btn?.focus();
    }
  };

  return (
    <div ref={rootRef} style={{ position: 'relative' }}>
      <button
        ref={triggerRef}
        type="button"
        className={triggerClassName ?? "bl-input"}
        aria-label={value ? `Change date, currently ${displayValue}` : 'Select date'}
        aria-haspopup="dialog"
        aria-expanded={open}
        style={triggerClassName ? undefined : { textAlign: 'left', minHeight: '38px', cursor: 'pointer' }}
        onClick={() => setOpen(!open)}
        onKeyDown={(e) => {
          if (e.key === 'Escape') closeAndRestoreFocus();
        }}
      >
        {children ?? displayValue}
      </button>
      {open && createPortal(
        <div
          ref={popoverRef}
          className="bl-dp"
          role="dialog"
          aria-label="Choose a date"
          style={{
            top: popoverPos?.top ?? -9999,
            left: popoverPos?.left ?? -9999,
            visibility: popoverPos ? 'visible' : 'hidden',
          }}
          onKeyDown={(e) => {
            if (e.key === 'Escape') closeAndRestoreFocus();
          }}
        >
          <div className="bl-dp-head">
            <button type="button" aria-label="Previous month" onClick={() => setMonth(new Date(month.getFullYear(), month.getMonth() - 1, 1))}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M15 18l-6-6 6-6" /></svg>
            </button>
            <b aria-live="polite">{monthLabel}</b>
            <button type="button" aria-label="Next month" onClick={() => setMonth(new Date(month.getFullYear(), month.getMonth() + 1, 1))}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M9 6l6 6-6 6" /></svg>
            </button>
          </div>
          <div className="bl-dp-dow" aria-hidden="true">
            {weekdays.map((d, i) => <span key={i}>{d}</span>)}
          </div>
          <div className="bl-dp-grid" role="grid" aria-label={monthLabel} onKeyDown={handleGridKeyDown}>
            {weeks.map((week, weekIndex) => (
              <div className="bl-dp-week" role="row" key={weekIndex}>
                {week.map((day, i) => {
                  const valid = day >= 1 && day <= days;
                  const selected = valid && isSelected(day);
                  return (
                    <button
                      key={i}
                      type="button"
                      role="gridcell"
                      data-day={valid ? day : undefined}
                      disabled={!valid}
                      tabIndex={valid ? (day === focusableDay ? 0 : -1) : undefined}
                      aria-label={valid ? new Date(month.getFullYear(), month.getMonth(), day).toLocaleDateString(undefined, { day: "numeric", month: "long", year: "numeric" }) : undefined}
                      aria-selected={selected}
                      className={`bl-dp-day${selected ? " is-on" : ""}${valid && isToday(day) ? " is-today" : ""}`}
                      onClick={() => valid && handleDateSelect(day)}
                    >
                      {valid ? day : ''}
                    </button>
                  );
                })}
              </div>
            ))}
          </div>
          <div className="bl-dp-foot">
            <button type="button" onClick={handleClear}>Clear</button>
            <button type="button" className="is-right" onClick={handleToday}>Today</button>
          </div>
        </div>,
        closestPortalTarget(triggerRef)
      )}
    </div>
  );
}
