# TDR-0213: The composer names the real device

Date: 2026-10-27. Source: phone walkthrough of a website review.

## Finding

On an iPhone, the website comment composer said "Tablet · Safari · 980px": the label
came from the page's layout width, and a page without a mobile viewport tag is laid out
about 980px wide on a phone. The comment itself was saved as `mobile` (from the user
agent), so the composer contradicted what was saved.

## Decision

The label uses the same user-agent device type that is saved with the comment, treating
iPadOS (a Mac user agent with touch) as a tablet. The width shown next to it stays the
layout width, which is what the developer needs to reproduce the issue.
