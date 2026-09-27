# TDR-0039: Tickets doc sweep — pin ticket numbers and paste-to-attach

Date: 2026-09-27
Status: Accepted

## Context

A second stakeholder document (a Google Doc, plain text, no images/screenshots this time)
listed 18 items for the QA review tool, distinct from TDR-0038's 13-item screenshot-based
report. Its wording ("Retain the Board View design...", "Fix the Due Date picker...",
"Allow login directly inside the QA review tool") suggested an older backlog that predates
the TDR-0021–TDR-0037 work already logged in `06-delivery.md`.

Each of the 18 items was checked against current source before anything was changed:

**Already done, confirmed by direct source read (13 of 18) — no change made:**
storing/displaying ticket IDs in the dashboard (`lib/ticket-ref.ts`, TDR-0032), the ticket
board design (TDR-0032 + two 2026-09-26 passes), multi-person assignee filter
(`TicketToolbar.tsx`'s `whoPop`), Add/Select Page (`ProjectPagesModal.tsx`,
`ProjectOverviewPage.tsx`), screenshot attachment on ticket creation (`NewTicket.tsx`),
default priority/page state on a new ticket, the due-date picker's dialog-portal fix
(TDR-0032), login/forgot-password/signup inside the tool (TDR-0024, TDR-0025), the
full-width draggable/resizable preview (TDR-0022), comment pins surviving a refresh
(TDR-0033–0036's `waitForAnchorElement`), and the comment composer/popup design
(`ui-composer.ts`). Most dropdown surfaces (Sort/Group/Who, menus) already use the shared
custom `.bl-pop` popover system.

**Genuinely still open (3 of 18), addressed here:**

1. **Ticket IDs not shown on the actual review-page pin or its read-only card.** The
   dashboard shows ticket numbers everywhere, but the widget's `CommentRecord` type never
   declared `ticket_number` (present on the backend's `CommentOut` all along — no API
   change needed) and `renderPin` never set any text, despite `.bl-pin`'s own CSS already
   being laid out to center text. Guests and reviewers looking at the live page had no way
   to see which ticket a pin corresponded to.
2. **Screenshot copy-paste** was entirely absent — no `paste`/`ClipboardEvent` handling
   anywhere in the widget or web app, and no such feature in the design HTML either
   (confirmed net-new, not a regression).

**Two items were a stakeholder call, not a code decision — asked directly, both answered:**
- Status/Priority pills in `TicketRow.tsx`/`TicketTable.tsx` use a native `<select>`
  overlaid on a styled pill, with an existing code comment stating this was intentional
  ("kept as native selects... so the list and table stay editable inline"); the design HTML
  has no interactive open-state for these to match against. **Decision: leave as-is** — not
  a bug, and rebuilding it as a per-row custom popover (like the toolbar's Sort/Group/Who)
  would add real regression risk to two high-traffic surfaces for a cosmetic preference
  with no reference frame to match.
- Paste-to-attach scope: **widget comment composer only** (not the dashboard's "New ticket"
  form), per stakeholder direction.

## Decision

Fixed the two genuine gaps; left the dropdown pattern untouched per the stakeholder's own
choice.

- `apps/widget/src/types.ts`: added `ticket_number: number | null` to `CommentRecord`
  (mirrors `CommentOut`, already sent by every comments endpoint — no backend change).
- `apps/widget/src/ui-notifications.ts`: `renderPin` takes an optional ticket number and
  sets it as the pin's text.
- `apps/widget/src/index.ts`, `apps/widget/src/region-drawer.ts`: pass the number for an
  existing comment's pin (`loadPagePins`), and set it once a draft/ghost pin's comment is
  actually created (a new pin has no number until the server assigns one).
- `apps/widget/src/ui-attachments.ts`: extracted the per-file chip/upload logic from the
  file-input `change` handler into a reusable `addFiles(files)`, returned from
  `setupAttachments` alongside the existing `getAttachments`/`disable`/`reset`.
- `apps/widget/src/ui-composer.ts`: a `paste` listener on the comment textarea extracts
  any image items from `ClipboardEvent.clipboardData` (`getAsFile()` has no filename, so
  one is generated from the MIME type), calls `attachments.addFiles(...)`, and prevents
  the default paste when an image was found (an image is never text worth inserting into
  the comment body). Reuses the exact same upload/chip/remove pipeline a picked file goes
  through — no parallel code path.

## Consequences

- Files touched: `apps/widget/src/types.ts`, `ui-notifications.ts`, `index.ts`,
  `region-drawer.ts`, `ui-attachments.ts`, `ui-composer.ts`.
- No API contract, database, or `packages/types` change — `ticket_number` already existed
  on `CommentOut`; this only teaches the widget's hand-kept type mirror to read a field the
  backend was already sending.
- Verification: `pnpm turbo run lint typecheck build` for `@backline/widget`,
  `@backline/extension` (re-exports `renderPin` via `extension-api.ts`), and
  `@backline/web` — all clean (web's 4 pre-existing lint warnings unchanged, none in
  touched files). No test suite was written or run, per this task's own instructions
  (Claude Code: verify via lint/typecheck/build only). Not exercised in a live browser
  against a running API in this session.
