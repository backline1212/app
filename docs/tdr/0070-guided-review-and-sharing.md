# TDR-0070: Guided review, sharing and session exit

Date: 2026-10-19. Status: implemented and deployed; signed-in acceptance pending.

## Problem

Reviewers encounter extension errors without setup guidance, transient recovery
failures without an action, and a return link that opens another portal tab and
loses tab-local guest identity. Project edits save settings separately from metadata.
Sharing can present expired links as active or offer unimplemented safeguards.

## Decision

Keep existing proxy/snippet and native extension adapters. This is a usability and
recovery increment, not CR-02/03's installed-site connection/exchange. A website
reviewer joins once, then answers whether the website needs sign-in (including
"not sure"). Public-page review keeps the portal open in another tab and offers
explicit browser fallback. Login-required review guides desktop Chrome/Edge setup.
Website authentication uses the reviewer's own website account; Backline never
promises a shared login or universal site compatibility.

The shared accessible dialog reports checking, setup, opening, acknowledged
connection and actionable failure separately. It checks extension protocol/API
before minting credentials, supports retry and stopping the wait, and discards
late portal results. Failed/cancelled member launches revoke their issued token.
Stopping the wait does not promise to cancel a browser operation already sent.
Extension 0.4.0 forwards HTTP failure status and can offer guest rejoin. Successful
toolbar acknowledgement, not a tab-open event, declares connection.

The extension records the originating portal tab and focuses it on Return to
Backline when it still has the exact return URL, otherwise an existing matching
tab or a new tab. It never navigates a tab that has moved elsewhere. A closed
portal/new-tab fallback may require joining again; no bearer goes into a return
URL. Website tab selection excludes the launching portal, including when reviewing
Backline itself. Closing website tools removes that tab's overlay/session only;
the portal's Leave review action ends the guest identity on the server.

POST `/guest-sessions/current/end` is a no-store, rate-limited, idempotent action on
the caller's signed guest session. Persist additive `ended_at`; shared HTTP/socket
access rejects ended identities and member canvas reuse excludes them. Existing
documents without that field remain active. Ending works after revoke/archive.
Portal exit clears tab storage and caches only after success or authoritative
authentication rejection; transient errors retain identity and expose retry.
Recovery errors offer Check saved session again or Leave and rejoin. Board errors
offer retry and hide cached rows on permission loss. Route changes cannot apply an
old join/leave completion to the new review.

Sharing uses one expiry/revocation helper, updates while open/on focus, rechecks
before copying and labels expired history accurately. Project creation asks the
owner to load the site and save a first comment before sharing. New share links
reject nonempty domain restrictions or guest export, in both Pydantic and service
validation; neither is implemented as an identity/export feature. Existing links
remain readable and keep their historical request-origin filter. The UI explains
that this is not verified reviewer identity and recommends replacement with a
passcode. Legacy identity-policy enforcement remains an open F15 migration issue;
no existing link is silently stripped of its filter. New expiry inputs require a
timezone and a future instant. Guest export remains unavailable even on old flags.

Project metadata and optional validated settings share one scoped Mongo document
update. Null settings are ignored; nullable metadata such as client association
retains its existing meaning. The old settings endpoint remains compatible and
also ignores nulls. Existing settings not included in the patch are preserved.
Cross-browser capture settings are shown as unavailable while the server-browser
isolation gate is in force, preserving legacy values. Creation/event/integration
delivery is not made transactional by this change; F30 remains partially open.

## Verification and remaining gates

Regenerate contracts from Pydantic; run lint/typecheck/build and workspace scoping.
No test suite is written under this task's Codex instructions. Record results and
deployment evidence in the delivery ledger. Browser control became available on
this follow-up; Chrome reaches Backline's signed-out login page. The verification
tab awaits user sign-in. Actual Chrome/Edge installation, login/SSO, two-tab guest
return, expired-link replacement and concurrent/end-session behavior remain open.
The deployed invalid-link recovery page and its loading/retry cycle were verified
in Chrome. Deployment artifacts/guards and exact revisions are in the ledger.
Do not infer universal reliability from static or HTTP artifact checks.

Still pending: CR-02/03 connection and short-lived launch exchange, URL-bearer
retirement in legacy proxy/snippet handoff, native panel parity, actual email
receipt, cross-origin site migration and isolated storage/queue failure acceptance.
