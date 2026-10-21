# TDR-0110: Redact sensitive review URL labels without changing page identity

Date: 2026-10-22. Backlog item: BUG-08, portal display slice.

## Plan and decision

Review pages deliberately retain path, query and supported hash-route identity so
distinct screens keep separate feedback. A portal label that prints the full URL can
also expose a token, OAuth code, password or contact value during screen sharing.
Introduce one display-only URL formatter. It removes URL userinfo, masks common
sensitive query keys in normal and hash-route queries, and masks the segment after
obvious token/reset/invite/verify/session path markers. Invalid addresses display a
neutral label. Keep raw URLs for registration, page identity, iframe/navigation,
extension launch and editable project URL fields; never send the redacted value to
an API or use it as a lookup key.

Apply the formatter to project cards/table, page lists/confirmations, route-aware
page labels, canvas address/loading/alt text and version fallback labels. A
user-authored page title may still contain private text and a raw link target can
still reveal its URL on hover; this slice does not claim universal secret detection.
Backend events, stored URLs, screenshot/DOM evidence, logs and export paths require
separate reviewed redaction and privacy rules. No migration or HTTP contract change.

## Acceptance and verification

Run web lint, typecheck, production build and diff checks; Codex does not add test
suites under this task's AGENTS.md rule. Live acceptance remains: project/page/hash
route labels with sensitive and ordinary query keys, direct open and extension
navigation using the original URL, back/forward page identity, and no redacted URL
in API requests. Screen/evidence privacy remains open beyond these labels.

Source verification on 2026-10-22: web lint, typecheck, production build and diff
checks pass. The build reports the existing native review chunk size advisory.
