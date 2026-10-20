# TDR-0088: File review links and protected navigation

Date: 2026-10-20. Scope: FD-05/09/20/21 PDF/image review flow follow-up.

## Decision

Make the selected asset, its page identity, document page (`filePage`) and selected
comment URL state. Preserve unrelated parameters; retain legacy `page`, `thread`
and `comment` links on read and canonicalize resolved file/thread links. Clamp
invalid/out-of-range document pages. Previous/next, keyboard page navigation, a
bounded PDF page picker and comment/pin selection update the URL, so reload and
Back/Forward can restore the same view. A ticket's actual asset and region take
precedence while resolving its link. Key review state by project to avoid carrying
drafts/preview state into a different project.

Use the existing data router's navigation blocker for drafts, replies, active saves
and uncertain retries. Stay preserves the original context. Discard-and-continue
explicitly drops tab-local details and explains that an uncertain request may have
committed. Active saves cannot be discarded through the dialog. The native reload/
close warning also applies. Keep the original rendered URL context if navigation
changes before resolution; no draft queue or localStorage business data. A confirmed
new comment is inserted from its actual API response into the scoped query cache
before showing its URL. Immutable retry still targets the original asset/request.

File and comment read failures get retry actions; an unavailable explicit file or
thread is distinct from empty data. Never silently show another file as the requested
one. Offer an explicit first-available-file recovery. Retain reply text with manual
copy when its original thread disappears, plus clipboard fallback for normal replies.
No new API contract, account, production file, comment or screenshot is required.

## Verification

Affected web lint/typecheck/build passed 3/3 before the final page-picker/reply
recovery refinement; the final check is in progress. No suite written/run, per the
task's Codex instruction. Existing large-chunk advisory remains. Browser use is
unavailable. Pending manual acceptance: direct member/guest file/thread links,
reply-to-parent selection, PDF page limits/picker, reload and Back/Forward, nested
route leave/stay/discard, Escape/native unload, lost responses, a disappearing
file/thread and current role/session negatives. Build/deployment success does not
establish these interactions or durable drafts after deliberately leaving/reloading.

Final affected web lint/typecheck/build passes 3/3 after picker/reply recovery,
and diff checks pass. No test suite or production data write. Rollout follows in
the delivery ledger; browser acceptance remains open.

Web rollout: 5db789c reports Vercel success. This slice changes no backend source;
backend services remain on the verified 7b25ac3 deployment. Interaction acceptance
is still pending, including browser history and in-flight save navigation.
