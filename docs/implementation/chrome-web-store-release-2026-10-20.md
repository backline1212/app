# Backline Chrome Web Store release preparation

Date: 2026-10-20. Original local package: 0.4.5. Store publication: pending.

## 2026-10-23 release update

The current source manifest is 0.4.9. Rebuilt the package at
`apps/extension/dist/backline-extension.zip` from that manifest. The ZIP contains
the root manifest, three bundled scripts, popup HTML, and 16/32/48/128-pixel PNG
icons. Its size is 51,249 bytes and SHA-256 is
`4A6665644F33D0E343F6D0FCDB71B82C54BDDF548BB0788DB2EA2ED33F947197`.
The 118-character manifest description fits Chrome's 132-character limit.
Extension/widget lint, typecheck and build passed (6/6 Turbo tasks). The 0.4.5
hash below is historical; do not upload that old package.

The Chrome Web Store dashboard recognizes `contact.dwarkesh@gmail.com` after the
account owner completed Google's sign-in verification. An account-settings dialog
now requires an EEA trader or non-trader declaration. Do not guess or submit that
legal declaration. The dialog also shows that a contact email must be added and
verified before publishing or editing items. The dashboard has not yet shown an
actual registration-fee amount or payment state. No charge, ZIP upload, listing
submission or publication is verified in this release pass.

Public extension privacy/support URLs, a real extension screenshot, promotional
art, reviewer access and truthful owner-level data-use certifications remain open.
Google's image guidance says the extension icon, small promotional image and one
screenshot are mandatory. A source build is not interactive acceptance; test 0.4.9
in Chrome before submission. The current public API download still serves 0.4.4;
ship and verify the 0.4.9 backend image before presenting the store upload as the
latest installed build.

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

1. Open the developer dashboard using the intended Google publisher account.
   Confirm the actual one-time charge/currency on Google's checkout. No charge has
   been made in this task. Google agreements/account setup remain uncompleted.
2. Supply the public publisher/support details and a reachable public privacy-policy
   URL describing the collection above and the actual service's practices. Current
   web source contains placeholder Privacy links; those are not a policy URL.
3. Load/update the packaged extension and verify actual Chrome behavior. The
   observed installed version remains 0.4.3. Keep pending retry/failure acceptance
   from TDR-0075 open until exercised on the updated build.
4. Capture a real extension screenshot for the store, avoiding credentials,
   personal/private website content and client information. Prepare the store's
   required promotional artwork separately; do not present a fabricated mockup as
   evidence of functional acceptance.
5. Upload the ZIP, enter listing/privacy/distribution fields, provide reviewer
   access through an appropriate dedicated review account, and submit for review.
   Never use prototype passwords or expose a real user's credentials in listing
   text. Submission and Google approval are separate states.
6. After an approved store URL exists, wire it into the web extension-install flow
   and verify install, connection, supported-site review, save and return behavior.

## References

- [Register a developer account](https://developer.chrome.com/docs/webstore/register/)
- [Prepare an extension](https://developer.chrome.com/docs/webstore/prepare)
- [Privacy fields](https://developer.chrome.com/docs/webstore/cws-dashboard-privacy)
- [Store images](https://developer.chrome.com/docs/webstore/images)

Browser control could read the existing Backline tab, but opening the developer
dashboard was rejected with `Not allowed`. The user was asked to open it manually.
No upload, payment, public certification or submission has occurred. A subsequent
Chrome inventory shows Google sign-in for the Web Store; the user was asked to
complete sign-in. Extension/widget lint, typecheck and build passed (6/6 Turbo
tasks); the final icon-only rebuild also passed. ZIP contents and icon appearance
were inspected. No test suite was written or run.

Final ZIP SHA-256: `CB02723E4BF34A26DC347DB483DDFA23446D4F20908110F07691A709F51C231C`.
