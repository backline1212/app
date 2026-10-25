# TDR-0166: Automated accessibility pass

Date: 2026-10-25. Source: production-readiness review. axe-core 4.10 (WCAG 2 A/AA rules)
run in Chromium against login, client review join, dashboard, tickets (+ ticket dialog),
website review, file review, activity, clients, settings, team, billing, integrations,
API keys, MCP, AI and browser extension pages, plus dashboard/tickets/settings in dark
mode.

## Fixes

- **Ticket rows** were `role="button"` containers holding selects and buttons (nested
  interactive controls; screen readers announce one button and keyboard users hit
  conflicting handlers). The row is now a plain clickable container and the ticket title
  is the row's real button.
- **Pressed segment count** (e.g. "Everyone 14") in dark mode was mint on the light
  pressed background (1.5:1); it now follows the button's text colour.
- `aria-label` on plain spans (brand lockup, plan comparison ticks) gained `role="img"`.

After the fixes every audited page reports no violations. Automated rules don't cover
everything (focus order, screen-reader wording, zoom/reflow); those remain manual
acceptance items (backlog SUG-07).

## Verification

Workspace lint/typecheck/build; axe re-run on all pages above: zero violations.
