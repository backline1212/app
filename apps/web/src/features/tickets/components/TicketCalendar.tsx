import { useState, type DragEvent } from "react";
import { STATUS_COLORS, STATUS_LABELS } from "../../../lib/workflow";
import { ticketRef } from "../../../lib/ticket-ref";
import * as api from "../api";
import type { TicketUpdateMutation } from "./types";

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
// The design shows three tickets per day and counts the rest, so a busy week can't
// stretch one row to the height of the page.
const CHIPS_PER_DAY = 3;

function dayKey(year: number, month: number, day: number): string {
  return `${year}-${String(month + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

function todayKey(): string {
  const now = new Date();
  return dayKey(now.getFullYear(), now.getMonth(), now.getDate());
}

export function TicketCalendar({ tickets, update, onOpen }: { tickets: api.Ticket[]; update: TicketUpdateMutation; onOpen: (id: string) => void }) {
  const [month, setMonth] = useState(() => new Date(new Date().getFullYear(), new Date().getMonth(), 1));
  const [draggedId, setDraggedId] = useState<string | null>(null);
  // Which day (if any) has been asked to show every ticket rather than the first three.
  const [expandedDay, setExpandedDay] = useState<string | null>(null);

  const first = new Date(month.getFullYear(), month.getMonth(), 1);
  const days = new Date(month.getFullYear(), month.getMonth() + 1, 0).getDate();
  const cells = Array.from({ length: Math.ceil((first.getDay() + days) / 7) * 7 }, (_, i) => i - first.getDay() + 1);
  const weeks = Array.from({ length: cells.length / 7 }, (_, w) => cells.slice(w * 7, (w + 1) * 7));
  const today = todayKey();

  const byDay = new Map<string, api.Ticket[]>();
  for (const ticket of tickets) {
    const key = ticket.due_at?.slice(0, 10);
    if (!key) continue;
    byDay.set(key, [...(byDay.get(key) ?? []), ticket]);
  }
  const undated = tickets.filter((t) => !t.due_at);

  // Dropping a ticket on a day (or on "No due date") sets/clears due_at - same
  // draggedId/dataTransfer pattern as TicketBoard's status columns (FD-AUD-034).
  function dropOnDay(key: string | null) {
    return (e: DragEvent) => {
      e.preventDefault();
      e.currentTarget.removeAttribute("data-dragover");
      const id = e.dataTransfer.getData("text/plain");
      const ticket = tickets.find((t) => t.id === id);
      const nextDueAt = key ? `${key}T00:00:00Z` : null;
      if (ticket && (ticket.due_at ?? null) !== nextDueAt) {
        update.mutate({ id, patch: { due_at: nextDueAt } });
      }
      setDraggedId(null);
    };
  }
  function dragOverDay(e: DragEvent) {
    e.preventDefault();
    e.currentTarget.setAttribute("data-dragover", "true");
  }
  function dragLeaveDay(e: DragEvent) {
    e.currentTarget.removeAttribute("data-dragover");
  }

  function ticketChip(t: api.Ticket) {
    return (
      <button
        key={t.id}
        type="button"
        draggable
        onDragStart={(e) => {
          e.dataTransfer.setData("text/plain", t.id);
          e.dataTransfer.effectAllowed = "move";
          setDraggedId(t.id);
        }}
        onDragEnd={() => setDraggedId(null)}
        onClick={() => onOpen(t.id)}
        aria-label={`${ticketRef(t)} ${STATUS_LABELS[t.status]}: ${t.body}`}
        title={`${ticketRef(t)} ${t.body} · ${t.project_name}`}
        className={`bl-cal-chip${draggedId === t.id ? " bl-dragging" : ""}`}
      >
        <i className="bl-status-dot" style={{ background: STATUS_COLORS[t.status] }} aria-hidden="true" />
        <span><b>{ticketRef(t)}</b> {t.body}</span>
      </button>
    );
  }

  return (
    <section className="bl-cal-view">
      <div className="bl-cal-head">
        <button type="button" className="bl-quiet bl-cal-nav" aria-label="Previous month" onClick={() => setMonth(new Date(month.getFullYear(), month.getMonth() - 1, 1))}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M15 18l-6-6 6-6" /></svg>
        </button>
        <h2 id="calendar-heading">{month.toLocaleDateString(undefined, { month: "long", year: "numeric" })}</h2>
        <button type="button" className="bl-quiet bl-cal-nav" aria-label="Next month" onClick={() => setMonth(new Date(month.getFullYear(), month.getMonth() + 1, 1))}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M9 6l6 6-6 6" /></svg>
        </button>
        <button type="button" className="bl-quiet" onClick={() => setMonth(new Date(new Date().getFullYear(), new Date().getMonth(), 1))}>Today</button>
        <span className="bl-mono bl-cal-hint">Dates from the current results page — drag a ticket onto a day to set its due date</span>
      </div>

      <div className="bl-cal" role="grid" aria-labelledby="calendar-heading">
        <div className="bl-cal-dow" role="row">
          {WEEKDAYS.map((d) => <span key={d} role="columnheader">{d}</span>)}
        </div>
        {weeks.map((week, weekIndex) => (
          <div className="bl-cal-week" role="row" key={weekIndex}>
            {week.map((day, i) => {
              const valid = day >= 1 && day <= days;
              if (!valid) return <div key={i} className="bl-cal-day is-out" role="gridcell" aria-hidden="true" />;
              const key = dayKey(month.getFullYear(), month.getMonth(), day);
              const dayTickets = byDay.get(key) ?? [];
              const expanded = expandedDay === key;
              const shown = expanded ? dayTickets : dayTickets.slice(0, CHIPS_PER_DAY);
              const hidden = dayTickets.length - shown.length;
              return (
                <div
                  key={i}
                  className={`bl-cal-day${key === today ? " is-today" : ""}`}
                  role="gridcell"
                  aria-label={`${new Date(`${key}T00:00:00`).toLocaleDateString(undefined, { day: "numeric", month: "long" })}, ${dayTickets.length} ticket${dayTickets.length === 1 ? "" : "s"} due`}
                  onDragOver={dragOverDay}
                  onDragLeave={dragLeaveDay}
                  onDrop={dropOnDay(key)}
                >
                  <span className="bl-cal-date">{day}{key === today && <i>today</i>}</span>
                  {shown.map(ticketChip)}
                  {hidden > 0 && (
                    <button type="button" className="bl-cal-more" onClick={() => setExpandedDay(key)}>+{hidden} more</button>
                  )}
                  {expanded && dayTickets.length > CHIPS_PER_DAY && (
                    <button type="button" className="bl-cal-more" onClick={() => setExpandedDay(null)}>Show less</button>
                  )}
                </div>
              );
            })}
          </div>
        ))}
      </div>

      <div className="bl-cal-unscheduled" onDragOver={dragOverDay} onDragLeave={dragLeaveDay} onDrop={dropOnDay(null)}>
        <b>No due date ({undated.length})</b>
        {undated.length === 0
          ? <p>Every ticket in these results has a due date. Drag one here to clear it.</p>
          : <div className="bl-cal-unscheduled-list">{undated.map(ticketChip)}</div>}
      </div>
    </section>
  );
}
