/**
 * The ticket's human-readable reference ("#14") - the per-workspace number the API
 * assigns when a ticket or top-level comment is created (comments/schemas.py's
 * `ticket_number`). One place for it so every surface prints the same thing.
 *
 * Records created before numbering existed have none until
 * `backend/scripts/migrate_ticket_numbers.py` has run, so this falls back to a short
 * form of the record's own id rather than inventing a number that would collide with
 * a real one (and would change under the reader's feet as rows are filtered or sorted).
 */
export function ticketRef(ticket: { ticket_number?: number | null; id: string }): string {
  if (typeof ticket.ticket_number === "number") return `#${ticket.ticket_number}`;
  return `#${ticket.id.slice(-4)}`;
}
