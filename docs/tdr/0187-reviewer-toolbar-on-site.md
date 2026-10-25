# TDR-0187: Browse / Comment / Draw toolbar for reviewers on the real site

Date: 2026-10-25. Source: SPA/route acceptance (QA-02) - a client reviewing through the
review link (proxy or snippet) was always in Comment mode with no visible control. Every
click, links included, started a comment, so a client could not move to another page
except through the site's own script handlers (which then also opened a composer), and a
plain or hash link never navigated at all. Draw (area comments) was unreachable.

## Decisions

- The widget shows a small toolbar at the bottom centre when it runs on the real site
  (not inside the dashboard canvas, which drives the mode itself, and never in view
  mode): **Browse** (site works normally, pins hidden), **Comment** (default, as before)
  and **Draw**. Each button explains itself in its title.
- Switching uses the existing in-place mode change (no reload). A half-written comment
  keeps the current mode and is pointed out; an empty one is cancelled, an open thread
  closes.
- Cards, toasts and the hint keep clear of the toolbar. The first-visit hint now says
  "Choose Browse to use the site normally."
- The extension is unchanged (its own toolbar; it does not load the SDK entry point).
  SDK bundle: 33.2 kB gzipped (budget 40 kB).

## Verification

Workspace lint/typecheck/build. Chromium on a test SPA (pushState and `#/` routes): the
toolbar showed with Comment pressed; Browse hid the pins and links navigated without a
composer; each route showed only its own pins, comments landed on the right route, and
Back restored each page's pins. In a proxied guest review Draw opened the composer after
a drag and saved the area comment; switching tools with a draft was refused with
"Post or cancel this comment first"; on a 390 px screen the card sat above the toolbar.

## Addendum (same day): the snippet's name prompt

When a site embeds the review snippet, the reviewer's first screen was a bare "Your
name" box in the old indigo style with no length limit. It now matches Backline
("Leave feedback on this page"), limits the name to 100 characters (the API's limit),
and offers the same optional email as the review page, sent with the new guest session
so the team's replies and resolutions can be emailed (TDR-0164). Verified: the prompt
rendered, the session stored the name and email, and the toolbar appeared afterwards.
SDK 33.6 kB gzipped.
