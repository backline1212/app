# TDR-0121: Give extension reviewers public privacy and support pages

Date: 2026-10-23. Status: implemented in source; live verification pending.

## Decision

Expose `/privacy` and `/support` outside member authentication in the existing
React/Vite app. The privacy notice describes the data the extension sends for a
website review, its local connection state, project access, named optional
integrations and service providers, and a contact route. The support page gives
reviewers a clear path for sign-in, project matching and unsupported sites. Keep
both pages separate from authenticated workspace routes so Chrome reviewers and
users can open them without a Backline account.

The signup screen's privacy and support links now lead to those pages. Do not
present a dead Terms link or demand agreement to non-existent terms: the signup
checkbox acknowledges reading the privacy notice. This does not create a legal
terms agreement or replace any future owner-authored terms.

The public notice is based on current source and architecture. The publisher must
still check live processor configuration, retention/deletion practices and the
data-use certification before linking it in the Chrome Web Store or submitting
for review. No certification is inferred from writing the notice.

## Verification

Web lint, typecheck and production build passed after the final notice copy.
Browser
control was disabled in Work settings at the time of this pass, so signed-out
navigation, visual layout and deployed public URLs remain unverified. No new test
suite was written or run under the Codex task instruction.
