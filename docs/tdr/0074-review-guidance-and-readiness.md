# TDR-0074: Make review setup and recovery predictable

Date: 2026-10-19. Status: deployed; observed setup/recovery/return journeys verified, broader acceptance open.

## Context

The user asked for a better product/user flow after native 0.4.3 verification.
The extension settings page emphasizes manual token generation even though
project/guest native launch already connects automatically. It labels unrevoked
credentials "Connected", including expired ones, without proving a live browser
connection. Updating an extension leaves older portal tabs with an invalidated
bridge; the launcher exposes that technical error as installation guidance.

The canvas exposes Comment/Draw and hotkeys before widget acknowledgement and
during preview failure. Readiness is kept only in a ref, so an acknowledgement
that does not otherwise change React state need not refresh the visible controls.
Two separate native launch components on the same project maintain separate
connection/dialog state. Failed embedded review also emphasizes proxy internals
and hides the main extension recovery action outside the failure card.

## Decision

- Make install/update -> check extension -> choose project -> Open with extension
  the settings journey. Show real local version/API/protocol readiness without
  issuing a credential. Keep manual standalone token creation in collapsed,
  explicitly optional controls. Separate readiness from website connection and
  access-token history. Filter expired records from active access, refresh expiry
  on a clock/focus and show scope/expiry; retain records and revocation controls.
- Share the existing exact-origin/source/request-ID bridge and compatibility
  validation between setup and launch. Preserve protocol 2/minimum 0.4.1,
  cancellation and timeouts. On invalidation, offer Reload Backline rather than
  requiring installation again. Reload is an explicit user action and retains
  the current route; no automatic page reload or credentials are added.
- Reflect widget acknowledgement in React state. Disable canvas mode/dock tools
  and ignore their shortcuts until the live widget is ready; disable them on
  static alternate-engine renders. Saved comments remain accessible independently.
- Use one native launcher/dialog per project. Recovery buttons delegate to that
  launcher, including inside the failed preview. Explain saved feedback and the
  next action in plain language; retain diagnostic details behind a disclosure.
  Reopening does not claim the prior website session remains connected.
- Give guests an explicit next-step prompt before choosing website sign-in needs.
  The read-only board returns to review through one truthful action and explains
  how to populate its empty state. Native guidance explains how to see saved pins.
- Clarify that Website projects already support native signed-in review. The Web
  App roadmap no longer implies website login is unavailable or promises a shared
  authenticated session. It describes planned state/diagnostic capabilities and
  offers a return to the supported Website project list.

This is a web-only increment. Extension 0.4.3, backend/tenant permissions, API
contracts, persisted guest/legacy records and existing review adapters remain
unchanged. No migration or extension installation is needed. CR-02/03 connected
setup/launch and native panel parity remain pending; this does not claim universal
website sign-in or finish the complete connected-site product.

## Verification

Verify web lint/typecheck/build and actual supported browser journeys. Do not
write/run test suites under this Codex task's instructions. Exercise ready setup,
optional standalone controls, live preview tools, failed-preview recovery and
saved-ticket return without generating another manual token or posting additional
feedback. Record deployment/static/browser evidence and remaining gates in the
delivery ledger. Induced invalidated-context, missing/old/wrong-server extension,
offline, narrow-window, guest/provider and concurrency checks must not be inferred
from a ready-extension pass.

Web lint, typecheck and production build pass (3/3). The existing large-chunk
advisory remains. Diff checks pass; no test suite written/run.

Final product source c945bcf is deployed on Vercel. Chrome verifies installed
0.4.3 readiness/recheck, collapsed optional standalone setup, project handoff,
new-project navigation without saving, supported Website guidance and the roadmap
exit to `?type=website`. Failed previews disable mode/dock/hotkeys while preserving
saved comments; their direct extension action reaches one acknowledged dialog and
the real website, then returns with the selected thread intact. The fresh guest
name gate renders without creating an identity. Final settings spacing is visually
verified and captured. See the ledger for exact rollout IDs and limitations.

The embedded preview did not connect during this run; a healthy readiness
re-enable pass remains open alongside induced invalidation/old/wrong-server,
offline, guest board and broader password/SSO/concurrency checks. Native recovery
success does not imply the preview itself worked. No additional feedback or
project/client/settings mutation was submitted.
