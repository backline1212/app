# TDR-0158: MCP fix-and-verify loop

Date: 2026-10-24. Source: backlog FEAT-12.

## Decisions

- **`submit_fix` MCP tool.** One call for "the fix is ready": it posts a team-only reply
  recording the summary plus optional `preview_url` and `change_url` (http/https only,
  ≤ 2,000 chars) and moves the ticket to In review. It needs a read & write token and
  the member's `comment:reply` and `comment:update_status` permissions, and shares the
  workspace comment rate limit. `fix_ticket` now tells agents to call it instead of
  `reply_to_ticket` + `update_ticket`.
- **Fix history lives on replies.** The reply stores `fix` (`CommentOut.fix`, additive,
  `FixSubmissionOut`); every attempt stays in the thread and its plain-text body keeps
  the links for email, integrations and `get_ticket`. Guests never receive `fix`.
- **Human verification.** The ticket view (board/Tickets dialog and the review side
  panel) shows each fix as a card with "Open preview" / "View change". On the latest fix,
  while the ticket is In review, editors get "Verified – resolve" (status resolved,
  waiting cleared) and "Reopen" (in progress). Resolution stays a person's decision; the
  agent cannot mark its own fix resolved through this tool.

## Verification

Workspace lint/typecheck/build; backend ruff/format/mypy/scoping. Local MCP client:
`submit_fix` on #12 posted the reply and set In review; a `javascript:` preview URL was
rejected. Chromium: the fix card showed both links; "Verified – resolve" set Resolved.
