# TDR-0113: Keep target-site credentials out of integration page fields

Date: 2026-10-22. Backlog item: BUG-08, outgoing integration slice.

## Plan and decision

Comments retain the exact review URL for page identity and navigation. Automatic
Slack, Discord, Teams, webhook and tracker messages currently copy that full URL
to an external provider. A reviewed site can put session or invite credentials in
the path, query or fragment. Those credentials should not be replicated to each
connected integration merely to identify which site had feedback.

Derive a display-only HTTPS/HTTP origin from the recorded page URL, stripping
userinfo, path, query and fragment. Use it in all automatic integration page
fields and tracker descriptions. If the address is invalid, show an unknown-site
label rather than the raw value. Keep the existing authenticated Backline ticket
backlink for the route, comment and context. The signed webhook `comment.page_url`
field remains a string/nullable field but now carries the origin only; recipients
that need the full URL must open the authorized ticket. This is a deliberate
privacy change to that external payload, not a page identity change.

Do not redact user-authored comment text or project names here. Screenshot
attachments and presigned screenshot URLs sent to explicitly connected providers
have separate consent/retention exposure and need another review. No stored URLs,
HTTP API contracts, indexes or legacy comments are changed.

## Acceptance and verification

Run backend Ruff, affected format, strict mypy, workspace-scope and diff checks.
Codex adds no test suite under this task's AGENTS.md rule. After backend rollout,
inspect one authorized provider/webhook delivery with a token-bearing review URL:
the origin and Backline link should arrive, without raw route/query/fragment or
userinfo. Confirm ordinary comments still carry their body and ticket reference.
Do not send a shared fixture or webhook for source verification.

Source verification on 2026-10-22: full backend Ruff, affected format, strict
mypy (217 files), workspace-scope (25 repositories) and diff checks pass. No
suite, provider call or shared-data write was run. Backend rollout remains pending.
