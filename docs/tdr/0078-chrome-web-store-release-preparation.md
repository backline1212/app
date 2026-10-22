# TDR-0078: Prepare Backline for Chrome Web Store submission

Date: 2026-10-20. Status: package prepared; account, payment and submission pending.

## Decision

The user explicitly requested publishing the existing Backline extension and buying
the one-time developer registration. Prepare a new 0.4.5 package containing the
existing functionality and branded PNG icons derived from the web favicon. Declare
Chrome 110 as the minimum supported browser, matching the existing bundle target.
Copy icons into dist before creating the ZIP, keeping manifest.json at its root.
No permissions, authentication, tenant scopes or API contracts change.

The existing unrelated working-tree changes are preserved. No public listing,
payment, account creation or production deployment is inferred from a successful
local build. Do not replace the web app's manual-install links with a guessed store
URL; that requires the actual approved item ID.

## Evidence and remaining work

The connected Chrome Backline settings page reports installed extension 0.4.3.
Browser inventory and existing-tab reads work. Creating a developer-dashboard tab
returns `Not allowed`, including after selecting the returned Chrome browser ID.
The user was asked to open the dashboard. No alternative computer-control mechanism
was used to bypass that restriction; no registration or payment was attempted.
A later Chrome inventory shows Google sign-in for the Web Store. The user was
asked to finish sign-in; authentication UI was not automated.

Store copy, permission explanations and remaining inputs are recorded in
[the release handoff](../implementation/chrome-web-store-release-2026-10-20.md).
A public privacy-policy URL, publisher/support details, real screenshot, account
registration and owner certifications remain required. Do not fabricate these or
claim Google review/approval. Installed-0.4.5 interactive acceptance remains open.

## Verification

Run affected extension/widget lint, typecheck and build only, inspect the rendered
icons and ZIP structure, and record results in the delivery ledger. No suite is
written or run under this Codex task's instructions. Extension/widget lint,
typecheck and build passed (6/6 Turbo tasks); the final icon-only rebuild passed.
The ZIP includes the root manifest and all declared icon sizes. Rendered icons were
visually inspected. Installed-extension/browser behavior remains unverified.
