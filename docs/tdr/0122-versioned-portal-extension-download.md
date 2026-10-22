# TDR-0122: Serve the current extension package from the portal

Date: 2026-10-23. Status: deployed; public artifact accepted.

## Decision

The two portal installation flows use a versioned, same-origin ZIP at
`/backline-extension-0.4.9.zip`. The file is copied from the source-matched
extension build used for the Chrome Web Store draft. This is a temporary release
path while the API-hosted `/extension/backline-extension.zip` still serves 0.4.4
despite newer source and successful Railway status reports. A versioned URL avoids
an old cached ZIP and makes the installed package explicit.

Keep the extension's normal API and dashboard endpoints unchanged; this only
changes where users download the installation file. For the next extension
release, rebuild and inspect the ZIP, update this public file and shared URL, and
remove the old static artifact after the new release is accepted. Once the Chrome
Web Store item is approved, prefer the store install flow and keep a direct ZIP
only where manual installation is still needed.

## Verification

The source ZIP, public copy and built web-dist copy have the same SHA-256:
`4A6665644F33D0E343F6D0FCDB71B82C54BDDF548BB0788DB2EA2ED33F947197`.
The root manifest is 0.4.9. Web lint, typecheck and production build passed
(3/3 Turbo tasks). Vercel reported success for `71cd5f1`; fetching the public
versioned URL returned HTTP 200, a ZIP with manifest 0.4.9, and the exact
SHA-256 above. This verifies the download artifact, not installation or comment
behavior in a browser. No test suite was written or run under the Codex task
instruction.
