# TDR-0050: Custom illustrations, project card artwork, and an interaction audit

Date: 2026-09-29
Status: Implemented; verified by lint/typecheck/build and a headless browser pass

## Context

This follows TDR-0049. The user asked for the pending items from that pass to be
finished. They had also originally asked for custom SVG artwork and animation. Two
items were open:

- Project card previews stayed white in dark mode and were labelled
  "website · illustration".
- There was no custom artwork for empty, error or "coming soon" states.

The audit was also extended past page loads, which TDR-0049 covered, into the dialogs,
popovers and drawers people actually open. This used the same scratch harness: the real
API on in-memory fakes, driven by headless Chromium in both themes.

## Decisions

**Project card artwork (`features/projects/ProjectArtwork.tsx`).**
- The flat letter tile was replaced by a schematic SVG page:
  - three layouts, picked per project so a grid doesn't repeat one image;
  - the site's real favicon in its header, with the project initial as fallback;
  - image and PDF projects keep sketches of their kind.
- The pins are real data:
  - one per open comment, up to three, with the last showing "+N" beyond that;
  - a single check once everything is closed;
  - none on a project with no comments.
- The pins drop in one after another on load; on hover they lift and a ring pulses.
- Colors come from the existing per-project palette, passed as CSS variables. The
  stylesheet re-mixes the pale ones for dark mode, so a card is no longer a white slab
  there.
- The corner label now reads just the type ("Website"). Nothing here claims to be a
  screenshot; the drawing is plainly schematic.

**Illustrations (`components/illustrations.tsx`).**
- Small SVG scenes for eight empty states:
  - tickets, clients, projects, activity, members, share links and the guest board;
  - "no matches", used wherever a search or filter caused the emptiness.
- Larger scenes:
  - a lost comment pin for 404;
  - a growing chart for AI Usage;
  - an invoice with a landing "SOON" stamp for Billing;
  - the brand mark with a pinging signal for the full-page loading screen.
- The Usage chart is plainly decorative, not data, so the page's "no fabricated
  numbers" rule still holds.
- Colors are theme tokens only. Every keyframe ends on the resting pose, so the global
  `prefers-reduced-motion` rule, which runs each animation once in about 0ms, leaves
  complete, still drawings.

**Loading inside pages.** Seven pages rendered the full-page `LoadingScreen` in their
content area. That is a whole viewport tall on its own background, with a second brand
mark under the page header. `LoadingScreen` gained an `inline` variant (about 220px,
transparent, no mark) for those pages.

**Tickets empty state says why it's empty.**
- With filters on, it offers "Clear filters".
- On an empty tab it says, for example, "Nothing is overdue" and offers "Show everyone's
  tickets". Before, "Show all tickets" kept the tab, so on an empty tab with no other
  filters it did nothing.
- In a workspace with no tickets it explains where tickets come from.

**Activity names what happened.**
- `ActivityOut` gained optional `ticket_number` and `comment_excerpt`: the first line,
  80 characters at most, and none once the comment is deleted. The service fills them
  with one workspace-scoped bulk read (`CommentRepository.find_many_in_workspace`).
- The contract change is additive; OpenAPI and `packages/types` were regenerated.
- Rows read as sentences:
  - before: "Olive Owner comment created · View project";
  - after: "Olive Owner commented #17 “…” · Open comment", or "added the client Globex".
- Unlisted event types fall back to the old raw rendering.

**Interaction fixes:**
- **Dialog intros:** the New ticket and Account subtitles sat 8px up under the sticky
  dialog header (`margin-top:-8px`), half hidden.
- **Ticket detail:** Priority listed raw values ("high"); it now uses the shared labels.
- **Global search:**
  - The input drew its own focus ring inside the box's focus ring.
  - Results for team tickets named the hidden holder page "Project tickets" (backend
    subtitle). They now read "Team ticket", as the Tickets list does.
- **Notifications:** "Mark all read" showed with nothing unread.
- **Mobile drawer:** the close "×" was drawn on top of the workspace switcher's chevron.
- **Canvas shortcuts:**
  - "?" now opens the shortcuts list, the common convention; it is listed there,
    non-editable.
  - Arrow keys show as ← → instead of "ArrowLeft"/"ArrowRight". Stored bindings are
    unchanged.

## Not changed

- Deep links still go to `/p/{project}/board?comment=`, the route notifications and
  search already use on purpose (see `notifications/service.py` `_comment_deep_link`).
- The harness needed shims for three more mongomock gaps. They are harness-only, not app
  issues:
  - `$toObjectId` (global search);
  - `$not` over an array;
  - `$lookup` with `let`.

## Verification

See the 2026-09-29 "Illustrations and interaction audit" entry in
`docs/implementation/06-delivery.md`.
