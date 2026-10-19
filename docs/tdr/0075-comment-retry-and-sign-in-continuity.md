# TDR-0075: Preserve a comment submission and sign-in destination

Date: 2026-10-19. Status: implemented; rollout and browser acceptance pending.

## Context

The user requested continued repairs to basic login/comment flows. The composer
reused a client request ID but recaptured the screenshot and page context on every
retry. The server correctly rejects a different fingerprint under that ID, so a
lost save response could leave the reviewer unable to recover. Text and attachment
removal also remained editable during a pending write. Login code countdowns
decremented interval ticks, which drift when a reviewer switches to an email tab.

## Decision

- Share one in-memory submission per point/region composer across installed widget
  and extension adapters. Serialize the full Pydantic-derived CommentCreate once,
  including screenshot, anchor, context and request ID; an ambiguous error replays
  identical bytes. Serialize concurrent attempts and cache successful responses.
  Preserve strict server actor/resource/fingerprint checks. Explicit pre-write
  validation/permission failures can unlock editing only when no earlier ambiguous
  attempt exists. Authentication loss remains ambiguous because local lifetime
  cancellation can race a committed write. Never mint a replacement ID implicitly.
- Freeze text, tag and attachment changes during save and ambiguous retry. Offer
  Retry save, Copy comment text and Close with honest unconfirmed-save guidance.
  Copy is also available for a normal nonempty draft. It copies only its text;
  unavailable clipboard access selects the text for manual copying. No browser
  storage queue, credential persistence or automatic background posting is added.
- Bind preparation to the registered document URL before and after capture. Reject
  a route change rather than save evidence on an old page; keep text for recovery.
  Widget page-follow registration and native point/region use the same guard.
- Use elapsed wall-clock OTP deadlines, refreshed on focus/visibility and interval.
  Base expiry conservatively on request start plus server lifetime. Guard auth
  actions synchronously and freeze identity fields/panel switches while pending.
  Consume the return destination once across explicit and restored-session paths;
  preserve URL fragments and reject unsafe path characters.
- Publish these shared overlay fixes together as extension 0.4.4. Existing extension
  permissions/protocol remain unchanged. No API/schema/migration changes.

## Verification

Run lint/typecheck/build only under this Codex task's instructions. Record actual
rollout, installed extension and browser evidence separately. Manual acceptance
includes nonempty draft copy/cancel, page-change refusal, exact replay after lost
response, safe rejection editing, attachment locking, sign-in destination, code
expiry after backgrounding and duplicate auth action prevention. Do not infer
provider/OTP acceptance from source checks or post additional shared QA comments
without explicit authorization. Full connected-site launch/native panel work and
the broader roadmap remain separate pending slices.
