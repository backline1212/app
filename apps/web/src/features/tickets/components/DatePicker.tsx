import { useMemo, useRef, useState, type KeyboardEvent } from "react";
import { createPortal } from "react-dom";
import { useFocusTrap } from "../../../lib/use-focus-trap";
import { useOnClickOutside } from "../../../lib/use-click-outside";
import { useFloatingPosition } from "../../../lib/use-floating-position";

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

export function DatePicker({ value, onChange }: { value: string | null | undefined, onChange: (date: string | null) => void }) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const popoverRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  // The popover is portaled to <body> (see the render below) so it can escape any
  // ancestor with `overflow:auto/hidden` (dialogs, table wrappers) instead of being
  // clipped by it - so click-outside has to watch the portaled node too, since it no
  // longer shares a DOM subtree with rootRef.
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

  const handleDateSelect = (d: number) => {
    // Generate UTC ISO string from the calendar's currently viewed year/month and the selected day
    const key = `${month.getFullYear()}-${String(month.getMonth() + 1).padStart(2, '0')}-${String(d).padStart(2,'0')}T00:00:00Z`;
    onChange(key);
    closeAndRestoreFocus();
  };

  const handleToday = () => {
    const now = new Date();
    const key = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2,'0')}T00:00:00Z`;
    onChange(key);
    closeAndRestoreFocus();
  };

  const handleClear = () => {
    onChange(null);
    closeAndRestoreFocus();
  };

  const first = new Date(month.getFullYear(), month.getMonth(), 1);
  const days = new Date(month.getFullYear(), month.getMonth() + 1, 0).getDate();
  const cells = Array.from({ length: Math.ceil((first.getDay() + days) / 7) * 7 }, (_, i) => i - first.getDay() + 1);

  // Format the currently selected value for the button
  const displayValue = value ? new Intl.DateTimeFormat(navigator.language || 'en').format(
    new Date(new Date(value).getUTCFullYear(), new Date(value).getUTCMonth(), new Date(value).getUTCDate())
  ) : 'Select date...';

  // Format the month header
  const monthLabel = new Intl.DateTimeFormat(navigator.language || 'en', { month: "short", year: "numeric" }).format(month);

  // Helper to check if a rendered day matches the selected UTC value
  const isSelected = (day: number) => {
    if (!value) return false;
    const d = new Date(value);
    return d.getUTCDate() === day && d.getUTCMonth() === month.getMonth() && d.getUTCFullYear() === month.getFullYear();
  };

  const today = new Date();
  const selectedDate = value ? new Date(value) : null;
  const focusableDay = selectedDate &&
    selectedDate.getUTCFullYear() === month.getFullYear() &&
    selectedDate.getUTCMonth() === month.getMonth()
    ? selectedDate.getUTCDate()
    : today.getFullYear() === month.getFullYear() && today.getMonth() === month.getMonth()
      ? today.getDate()
      : 1;

  function closeAndRestoreFocus() {
    setOpen(false);
    requestAnimationFrame(() => triggerRef.current?.focus());
  }

  // Keyboard navigation for calendar grid
  const handleGridKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    const target = e.target as HTMLElement;
    if (target.role !== 'gridcell') return;

    const day = parseInt(target.textContent || "0", 10);
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
        className="bl-input"
        aria-label={value ? `Change date, currently ${displayValue}` : 'Select date'}
        aria-haspopup="dialog"
        aria-expanded={open}
        style={{ textAlign: 'left', minHeight: '38px', cursor: 'pointer' }}
        onClick={() => setOpen(!open)}
        onKeyDown={(e) => {
          if (e.key === 'Escape') closeAndRestoreFocus();
        }}
      >
        {displayValue}
      </button>
      {open && createPortal(
        <div
          ref={popoverRef}
          className="bl-popover"
          role="dialog"
          aria-label="Date picker"
          style={{
            position: 'fixed',
            zIndex: 1000,
            top: popoverPos?.top ?? -9999,
            left: popoverPos?.left ?? -9999,
            visibility: popoverPos ? 'visible' : 'hidden',
            padding: '1rem',
          }}
          onKeyDown={(e) => {
            if (e.key === 'Escape') closeAndRestoreFocus();
          }}
        >
          <div className="bl-toolbar" style={{ marginBottom: '8px' }}>
            <button type="button" aria-label="Previous month" className="bl-quiet" onClick={() => setMonth(new Date(month.getFullYear(), month.getMonth() - 1, 1))}>←</button>
            <strong aria-live="polite" style={{ margin: '0 8px' }}>{monthLabel}</strong>
            <button type="button" aria-label="Next month" className="bl-quiet" onClick={() => setMonth(new Date(month.getFullYear(), month.getMonth() + 1, 1))}>→</button>
          </div>
          <div className="bl-calendar bl-datepicker-grid" role="grid" aria-label="Calendar grid" style={{ minHeight: 'auto', gap: '4px', marginBottom: '8px' }} onKeyDown={handleGridKeyDown}>
            <div role="row">
              {weekdays.map((d, i) => <strong key={i} role="columnheader" aria-label={d} style={{ width: '28px', textAlign: 'center', display: 'inline-block' }}>{d}</strong>)}
            </div>
            {Array.from({ length: cells.length / 7 }).map((_, weekIndex) => (
              <div key={weekIndex} role="row">
                {cells.slice(weekIndex * 7, (weekIndex + 1) * 7).map((day, i) => {
                  const valid = day >= 1 && day <= days;
                  const selected = valid && isSelected(day);
                  return (
                    <button
                      key={i}
                      type="button"
                      data-day={valid ? day : undefined}
                      disabled={!valid}
                      tabIndex={valid ? (day === focusableDay ? 0 : -1) : undefined}
                      aria-label={valid ? `${monthLabel.split(' ')[0]} ${day}, ${month.getFullYear()}` : undefined}
                      aria-selected={selected}
                      onClick={() => valid && handleDateSelect(day)}
                      style={{ width: '28px', height: '28px', cursor: valid ? 'pointer' : 'default' }}
                      role="gridcell"
                    >
                      {valid ? day : ''}
                    </button>
                  );
                })}
              </div>
            ))}
          </div>
          <div className="bl-form-actions bl-datepicker-actions" style={{ marginTop: '8px', paddingTop: '8px' }}>
            <button type="button" className="bl-quiet" onClick={handleClear}>Clear</button>
            <button type="button" className="bl-button" onClick={handleToday}>Today</button>
          </div>
        </div>,
        document.body
      )}
    </div>
  );
}
