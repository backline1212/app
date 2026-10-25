# TDR-0178: Printable review report per project

Date: 2026-10-25. Source: product review - after a review round agencies send the client
a summary of what was raised and what was done. The only export was a CSV.

## Decisions

- New route `/w/:workspace/p/:project/report`, opened from the project menu ("Review
  report"). It reads the existing project comments, pages/files and clients queries;
  no new API.
- Content: workspace and project name, client, date, counts (feedback / open /
  resolved), then threads grouped by page or file (file version shown), ordered by
  ticket number: ticket ref, status, tags, author, date, text, screenshot, attachment
  names and replies.
- Options in the URL: All / Open only / Resolved only, Replies on/off, Team-only notes
  off by default (when on, a warning says not to send that version to the client).
- "Print or save as PDF" uses the browser's print dialog. Print CSS hides the options,
  forces light colours (also in dark mode), keeps each thread on one page where
  possible and sets page margins. A screenshot that can't load is left out.

## Verification

Workspace lint/typecheck/build. Chromium: opened from the project menu; website project
grouped by page (11 items, 10 open, 1 resolved), "Open only" showed 10; image project
grouped by file with version; printed to PDF with screenshots and replies.
