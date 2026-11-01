# TDR-0229: Dashboard UX audit fixes

Date: 2026-11-01. Source: dashboard UI/UX audit (25 findings, each checked in code) and a
screen review.

## Fixed

- **Board tracker buttons** filed issues straight from the card and remembered them only
  in memory, so after a reload the same issue could be filed twice, and failures were
  silent. Cards now offer "Send to tracker…", which opens the ticket dialog that already
  lists existing links and shows sending/errors.
- **Board states:** a failed load shows the error with Try again (it looked like an empty
  filter result); a project with no tickets says so instead of "clear your filters".
- **Board list bulk change** is disabled while running ("Updating…"), reports "N tickets
  moved to …", and viewers no longer see selection checkboxes that do nothing.
- **Removing a review domain** asks first (warning when it's live) and reports the result.
- **Access changes** (going private, removing someone from a project) show a toast with
  Undo.
- **Toasts** pause while hovered or focused; toasts with an action stay at least 8 s.
- **Tickets page** gets search, status and priority filters (the API had them; nothing
  set them), a readable priority chip, and a note when Board/Calendar show only part of
  the results.
- **Share links** show the full review address in a select-on-focus field, so the
  copy-it-yourself fallback works; errors are no longer shown twice.
- **Activity** names ~30 more real events instead of raw names; the integration-failure
  notification names the provider.
- **Sticky table headers** work on desktop (tickets and projects tables scroll within the
  page).
- **Wording:** "Tickets by status", ticket (not comment) on the Board; invoices say
  Monthly/Yearly; AI results pluralise; Enter confirms the type-the-name delete dialogs.
- **Icons and motion:** shared SVG icons replace ×/✓/⚠/↻/←/✛ glyphs in dialogs, toasts,
  back links and the review dock; the dock's environment is a label, not a dead button;
  dialogs and the remaining popovers open with a short ease (flattened under reduced
  motion).
- Saving a client and revoking an API/MCP key confirm with a toast; "Waiting on you"
  reports a failure of either of its two lists; file review explains why "All comments"
  is disabled during a reply draft.

## Left as is

The two "Reopen" actions differ on purpose: a fix that failed verification goes back to
In progress; a resolved ticket reopened from its row goes back to Not started.
