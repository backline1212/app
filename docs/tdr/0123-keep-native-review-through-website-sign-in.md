# TDR-0123: Keep browser review available through website sign-in

Date: 2026-10-23. Status: portal deployed; installed-browser acceptance pending.

## Problem and decision

The extension waited 15 seconds for the toolbar, then treated a timeout as a
launch failure. It removed the tab-bound review session and the portal revoked
the newly issued project token. A normal password or third-party sign-in that
took longer could therefore finish on the right website but never regain its
Backline tools.

The extension now returns whether its toolbar confirmed within the initial
window. A timeout means **waiting for website sign-in**, and retains the
tab-bound session. When the reviewer returns to the project's origin, the
content script reads that session, checks current access and displays the
toolbar. Explicit launch failures still roll the session back and revoke the
new token. The portal also treats an uncertain response timeout or a closed
launch dialog as potentially in progress; it does not revoke a credential that
the extension may already be using. These project tokens expire after eight
hours and remain revocable from Browser Extension settings.

The portal requires extension 0.4.10 for this handshake. Its manual download
uses a versioned 0.4.10 package while the 0.4.9 Web Store draft is replaced.
The previous 0.4.9 static file remains available for rollback until the new
bundle is accepted. This does not make arbitrary website login possible in a
proxy, or guarantee a toolbar on unsupported/restricted browser pages.

## Verification boundary

Extension and web lint, typecheck and production build passed. The source
extension ZIP and portal ZIP have SHA-256
`82AA528F00701E885F39C6DF635BEDC1447B652F72ABBA0A05676D0F335DEE1A`;
manifest version is 0.4.10. Vercel reported success for `ca6219f`; the public
versioned ZIP returned HTTP 200, manifest 0.4.10 and the same SHA-256, and the
portal root returned HTTP 200. A real password/SSO redirect, installed update,
return-to-project, save and capture still require browser acceptance after
deployment. The Chrome Web Store draft remains 0.4.9 until it is updated; it
must not be submitted as the current build. No test suite was written or run
under the Codex task instruction.
