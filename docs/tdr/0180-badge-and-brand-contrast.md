# TDR-0180: Readable status badges, priority labels and brand colours

Date: 2026-10-25. Source: axe-core WCAG 2 A/AA audit of the screens added this round
(Tickets table and bulk bar, review report, guest file review).

## Findings

- Status badges (`@backline/ui` Badge) drew text in the same colour as their 15% tint:
  Not started 2.0:1, Resolved 1.8:1, In progress below 4.5:1.
- The Tickets table's priority pill coloured its label: amber "Medium" 1.85:1.
- In guest review, a client's brand colour replaces the accent; text drawn in it on
  the light tint fell under 4.5:1 for lighter brand colours (rose: 4.23:1).

## Decisions

- Badge text uses new `status-*-ink` colours (light: darker shades that clear 4.5:1 on
  each tint; dark theme: the existing brightened values). Tints and dots unchanged.
- The priority pill keeps its colour on the dot; the label is ink.
- Branding sets `--bl-brand-ink`: the brand colour itself when readable on white and
  the light surfaces, otherwise the same hue darkened in 5% steps until it is. Fills
  keep the exact brand colour.

## Verification

axe-core (wcag2a, wcag2aa): Tickets list and table with selection, review report and
guest file review thread now clean; login, dashboard, tickets, website review, file
review, settings and team remain clean. Workspace lint/typecheck/build.
