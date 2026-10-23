# Backline Chrome Web Store release preparation

Date: 2026-10-20. Original local package: 0.4.5. Store publication: pending.

## 2026-10-24 review-continuity update

TDR-0127 advances the source manifest to 0.4.12 so a Railway edge fallback
does not revoke an otherwise valid browser review session. Rebuild and verify
this package before replacing the 0.4.9 Web Store draft. Widget, extension
and web lint/typecheck/build passed (9/9 Turbo tasks). Its 51,774-byte ZIP
has SHA-256 `437239BF7173B79132651EB128447CEACE8CF97B03F7BEB9EC59049B0F84607D`;
source, portal-public and built-web hashes match, and manifest 0.4.12 and
scripts are present. The 0.4.11 public
ZIP remains a verified fallback while the API host is unavailable.

## 2026-10-24 release update

TDR-0125 advances the source manifest and portal download to 0.4.11 so the
on-site comment card reports screenshot outcome. The ZIP is 51,458 bytes with
SHA-256 `4239C81E53A9CB17E6D0C1B2B7C93956C383C3E0AA427F456C5A0F59E59E89E8`.
The 0.4.9 dashboard draft still needs replacement; do not submit that older
draft as the current version. Widget, extension and web lint/typecheck/build
passed (9/9 Turbo tasks); the source, portal-public and built-web ZIP hashes
match, and the root manifest and scripts are present. Browser acceptance
remains pending. Vercel reported success for `2bd0f87`; the public ZIP returned
HTTP 200 with the same hash and manifest. The API host was returning Railway
fallback 404 at the check, so login/comment acceptance remains blocked.

## 2026-10-23 release update

The current source manifest is 0.4.10 after TDR-0123's sign-in continuation
fix. Its rebuilt ZIP at `apps/extension/dist/backline-extension.zip` is 51,154
bytes, with SHA-256
`82AA528F00701E885F39C6DF635BEDC1447B652F72ABBA0A05676D0F335DEE1A`.
The root manifest, three bundled scripts, popup HTML and 16/32/48/128-pixel
PNG icons were checked. Extension and web lint/typecheck/build passed (7/7
Turbo tasks). Replace the 0.4.9 draft upload before submitting it. The
118-character manifest description fits Chrome's 132-character limit.

The 0.4.9 ZIP previously uploaded as a draft was 51,249 bytes with SHA-256
`4A6665644F33D0E343F6D0FCDB71B82C54BDDF548BB0788DB2EA2ED33F947197`.
The 0.4.5 hash below is historical; do not upload either older package.

The Chrome Web Store dashboard recognizes `contact.dwarkesh@gmail.com`. The owner
selected trader status and submitted Google's publisher verification; the settings
page says "Your verification is currently pending." The dashboard has not shown
an actual registration-fee amount or payment state. No charge is verified.

Uploaded the source-matched 0.4.9 ZIP as **draft** item
`kdijhbgnbpjoaalbpnimfomemeheokca`. The dashboard confirmed saved store copy,
Workflow & Planning category, English language, store icon, homepage URL,
single-purpose statement and permission justifications. Remote code is marked No.
The dashboard's current blockers are a real screenshot/video, data-use
certification, public contact email and contact-email verification. A public
privacy URL and source-matched data categories remain necessary even though the
current blocker dialog does not list them. No review submission or publication is
verified.

Public extension privacy/support URLs, a real extension screenshot, reviewer
access and truthful owner-level data-use certifications remain open. The current
dashboard requires a store icon and at least one screenshot or video; the small
promotional tile is offered as an optional field. A source build is not
interactive acceptance; test 0.4.10 in Chrome before submission. The public API
download still serves 0.4.4, so portal installation uses the separately verified
versioned web artifact below. Investigate the backend deployment mismatch before
using the API ZIP again.

Source now includes signed-out `/privacy` and `/support` pages (TDR-0121).
Vercel reported success for `8af3ce5`; both URLs returned HTTP 200 and the
deployed JS referenced their page chunk. Browser rendering/navigation and
service-wide privacy facts must still be checked before setting the Chrome
privacy-policy or support URL fields. Browser use was disabled for this pass.
Railway posted successful app/worker statuses for the same commit, but the public
extension ZIP still contains manifest version 0.4.4; the 0.4.9 download rollout
is not accepted.

The portal download links now target a checked-in, versioned static 0.4.9 ZIP
through the web deployment (TDR-0122). This avoids presenting the stale API ZIP
to portal users. Vercel reported success for `71cd5f1`; the hosted ZIP returned
HTTP 200, manifest 0.4.9 and SHA-256
`4A6665644F33D0E343F6D0FCDB71B82C54BDDF548BB0788DB2EA2ED33F947197`.
The portal download workaround is live. The original API route remains stale.

The portal now points to a new versioned 0.4.10 ZIP with the current hash above.
Vercel reported success for `ca6219f`, and the hosted ZIP returned HTTP 200,
manifest 0.4.10 and the same SHA-256. Installed acceptance is pending. The 0.4.9 static
file remains available for rollback until 0.4.10 is accepted.

## Upload package

Run `pnpm exec turbo run lint typecheck build --filter=@backline/extension --filter=@backline/widget`
from the repository root. Upload `apps/extension/dist/backline-extension.zip`, not
the repository or the enclosing dist folder. The ZIP includes manifest.json at its
root, three bundled scripts, popup.html and 16/32/48/128-pixel PNG icons. All scripts
are bundled locally; the configured remote API receives data, not executable code.

The icons use the existing `apps/web/public/favicon.svg` artwork rasterized at each
native size. They are checked in as assets; building the extension does not require
an image-rendering tool or new package dependency.

## Listing copy

Name: Backline

Short description: Leave point and rectangle comments on any site, right from your browser, without opening the Backline dashboard first.

Suggested category: Workflow & Planning / Productivity, using the available console
category that best matches website review.

Detailed description:

> Review a project website in your own browser and keep contextual feedback in
> Backline. Start a review from a Backline project, or connect your workspace from
> the extension popup. On supported project websites, click an element or draw a
> rectangle, write feedback, and save the comment with its page context and an
> optional screenshot or attachment. Return to Backline to manage the saved work.
>
> Uses your normal website session. A Backline account or authorized project review
> invitation is required. Chrome internal pages, the Chrome Web Store and some
> protected websites cannot be annotated. Screenshot capture can fail; comments
> report capture status rather than inventing an image.

No claims of universal compatibility, unlimited plans, offline saving, AI or cloud
login availability should be added. The Chrome developer registration fee pays for
the publisher account; it does not purchase a Backline subscription.

## Privacy-practices draft from source

Single purpose: Save contextual website review comments and evidence to the user's
authorized Backline project.

| Permission | Justification |
| --- | --- |
| storage | Retains an optional Backline workspace connection in extension-local storage and project-bound review credentials/state in extension-session storage. |
| activeTab | Supports user-initiated visible-tab screenshots and website review actions. |
| scripting | Injects the packaged annotation tools into a project website tab, including tabs that were open before installing or updating Backline. |
| host permissions / `<all_urls>` | Backline projects can review arbitrary HTTP/HTTPS website origins, including authenticated client sites. The packaged content script also connects the configured Backline dashboard to the extension. Server/project checks constrain review access. |

Remote code: No. Executable scripts are included in the ZIP. API responses are data.

Source-backed collection disclosures to reconcile with the console categories:

- Account/workspace identifiers and email for the optional standalone connection.
- Backline access tokens and project review credentials for authentication.
- Reviewed page URLs, titles, browser/OS/device/viewport context where enabled,
  element anchors and website content. Starting review submits a normalized visible
  DOM snapshot, including visible text and selected attributes, to Backline before
  the first comment. Do not claim that only manually selected text leaves the page.
- User-authored comments, tags, screenshots and chosen attachments. Screenshots and
  website snapshots can contain personal or confidential website content.
- Tab URL inspection for matching an existing project/return tab. This is distinct
  from collecting the browser's full browsing history; no history permission exists.

The extension does not request cookies permission, use chrome.cookies, or copy the
reviewed website's login credentials into Backline. The ordinary website session
remains in that website's browser tab. Backline credentials are separate.

Data is sent to the configured Backline API at
`https://backlinewidget-production.up.railway.app`; dashboard origin is
`https://backline-qa.vercel.app`. Saved evidence uses the existing private storage
and project/workspace access controls. Disconnect removes the standalone local
connection; it does not delete previously saved project feedback.

The publisher must verify the full service's retention, deletion, subprocessors,
support contact and data-use certifications. Do not certify selling/advertising,
retention promises or other organization-wide practices from extension code alone.

## Required before submission

1. Wait for Google's pending trader verification decision and inspect the account
   status. Confirm any actual developer registration charge/currency if Google
   presents checkout; no charge was made in this task.
2. Supply and verify the public publisher contact email, public support details,
   and a reachable public privacy-policy
   URL describing the collection above and the actual service's practices. Current
   web source contains placeholder Privacy links; those are not a policy URL.
3. Load/update the packaged extension and verify actual Chrome behavior. The
   observed installed version remains 0.4.3. Keep pending retry/failure acceptance
   from TDR-0075 open until exercised on the updated build.
4. Capture a real extension screenshot for the store, avoiding credentials,
   personal/private website content and client information. Prepare the store's
   required promotional artwork separately; do not present a fabricated mockup as
   evidence of functional acceptance.
5. Complete the draft's data categories, privacy URL and distribution fields,
   provide reviewer access through an appropriate dedicated review account, and
   submit for review.
   Never use prototype passwords or expose a real user's credentials in listing
   text. Submission and Google approval are separate states.
6. After an approved store URL exists, wire it into the web extension-install flow
   and verify install, connection, supported-site review, save and return behavior.

## References

- [Register a developer account](https://developer.chrome.com/docs/webstore/register/)
- [Prepare an extension](https://developer.chrome.com/docs/webstore/prepare)
- [Privacy fields](https://developer.chrome.com/docs/webstore/cws-dashboard-privacy)
- [Store images](https://developer.chrome.com/docs/webstore/images)

Earlier preparation could not open the developer dashboard in the installed Chrome
profile. The owner completed sign-in, and the draft item was later created in the
available signed-in dashboard as recorded above. No payment, public certification
or review submission has occurred. Extension/widget lint, typecheck and build
passed (6/6 Turbo tasks); ZIP contents and icon appearance were inspected. No
test suite was written or run.

Final ZIP SHA-256: `CB02723E4BF34A26DC347DB483DDFA23446D4F20908110F07691A709F51C231C`.
