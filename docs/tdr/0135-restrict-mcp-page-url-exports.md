# TDR-0135: Restrict reviewed-page URLs in MCP and implementation briefs

Date: 2026-10-24 (Asia/Calcutta). Backlog item: BUG-08.

## Decision

MCP project lists, ticket lists, ticket details and generated implementation briefs
previously included a stored review URL or page path. A site can place credentials
in userinfo, path, query or fragment. MCP output and copied briefs may be sent to
an external coding assistant, so use the existing integration-export `page_site`
formatter for these page labels. It emits only a validated HTTP(S) origin and
uses an unknown-site label for malformed addresses. A missing page remains
identified as a standalone ticket. The authorized Backline ticket link still
provides the exact page and review context when needed.

This is a display/export change. Keep exact stored URLs, page identity,
dashboard API fields, project access checks, comments and attachments intact.
User-authored project names, page titles, comment text and replies are not
automatically redacted; the existing expiring screenshot/attachment links need
a separate access and retention review. No schema, generated declarations,
index or migration changes are needed.

## Acceptance and verification

Verify MCP list/detail/brief output and the dashboard-generated brief with a
token-bearing URL after the matching API release. The origin and authenticated
Backline link should remain; userinfo, route, query and fragment should be
absent from page labels. Check standalone and malformed URL labels, workspace
scope, and ordinary comment content. Record the live outcome in the delivery
ledger. Local source verification uses Ruff, mypy, workspace-scope and diff
checks; no test suite is added under the Codex instruction in AGENTS.md.
