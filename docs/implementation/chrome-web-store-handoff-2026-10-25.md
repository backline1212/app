# Backline Chrome Web Store handoff

Updated: 2026-10-25

## Current status

Backline extension **0.4.13** is submitted under publisher account
`contact.dwarkesh@gmail.com`. Google dashboard status is **Pending review**.
Automatic publication after approval was selected, so the listing is not live
until Google completes its review. Google warned that `<all_urls>` host access
may require an in-depth review; it supports Backline's review-any-site flow.

The store listing now has a valid 1280x800 screenshot, the public privacy and
support links, the verified publisher contact, data collection disclosures,
the owner's confirmed data-use certifications, and private guest reviewer
instructions. The three data-use statements were confirmed by the owner.
Trader verification is still marked pending. No new fee was requested or paid
during submission; a prior registration payment was not independently verified.

## Update ready: 0.5.14 (2026-10-27, supersedes 0.5.2-0.5.13)

0.5.14 = 0.5.13 plus composer fixes shared with the website SDK: no tag is preselected
(copy and design notes were saved as "Bug"), the device label follows the real device
on phones, and the post button no longer wraps (TDR-0207, TDR-0213). Package 66704 bytes,
SHA-256 `74136a2ec9c97f83b416a4159b327f2ace2a58dcd020ac6157cdbe27b8a6c713`. Same targets and permissions. Submit 0.5.14.

## Previous: 0.5.13 (2026-10-27)

0.5.13 = 0.5.12 plus screenshot markers on new comments (where the pin or area was on its
screenshot) and, for team members, the start-page view offered as the project card's
picture when Backline's servers can't fetch the site (TDR-0197). Package 66663 bytes,
SHA-256 `493a7b8da27c164981bdc912555260bde53cab5134fda79d36bf0c0cb195c6a2`. Same targets
and permissions.

## Previous: 0.5.12 (2026-10-25)

0.5.12 = 0.5.11 plus black-outs in the screenshot preview (drag to hide private areas,
TDR-0195) and the overlay staying styled on sites with a strict style policy (TDR-0193).
Package 65903 bytes, SHA-256
`5108563d62183c20001b5627c0c9a4eccae493be5ef8d3170e4ed303df23d15a`. Same targets and
permissions.

## Previous: 0.5.11 (2026-10-25)

0.5.11 = 0.5.10 plus a **Preview** of the automatic screenshot in the composer (the
previewed image is the one attached, TDR-0189) and screenshots that grey out content a
site marks `data-backline-private` (TDR-0192). Package 64700 bytes, SHA-256
`7ed262a99f4ba67b91b8015bfa9311b8faaa2208f88e2caa3e3be60abb51f129`. Same targets and
permissions.

## Previous: 0.5.10 (2026-10-25)

0.5.10 = 0.5.9 rebuilt with the current widget code: clearer first-use hint and
"Can't reach Backline - check your connection" instead of the browser's "Failed to
fetch" (TDR-0187, delivery log). Package 63097 bytes, SHA-256
`209ac8d4990bfa1cec466a212ff162fa0ab6dc27bb9cf99e14fc3190b48c6e8f`. Same targets and
permissions.

## Previous: 0.5.9 (2026-10-25)

0.5.9 = 0.5.8 plus the composer hiding its keyboard hint on touch screens (TDR-0181), so
the package matches the current widget source. Package 62674 bytes, SHA-256
`9cf14930419766a535a92a2d91ea35c0a239b2dbe10a6f072e2ab925653a3afa`. Same targets and
permissions.

## Previous: 0.5.8 (2026-10-25)

0.5.8 = 0.5.7 plus "Add an automatic screenshot of this page" in the composer, so a
reviewer can leave the screenshot out (TDR-0176). Package 62603 bytes, SHA-256
`b4f7008eeef81decb54b7cb01af3f19bba4b248ce771d2fbf63907e7ba813a1f`. Same targets and
permissions.

## Previous: 0.5.7 (2026-10-25)

0.5.7 = 0.5.6 plus file attachments on replies during a review (TDR-0175). Package
62354 bytes, SHA-256 `6c5450b6358de3565bfb23191695768ddfe89cc20716b0f30eab4b09ee26a939`.
Same targets and permissions.

## Previous: 0.5.6 (2026-10-25)

0.5.6 = 0.5.5 plus: "Open with extension" from a selected thread opens that thread on
the live page (TDR-0174). Package 61820 bytes, SHA-256
`276503175540c71fa5103a4235b96f7e926bfb98044db3392106c3c27379f9c3`. Same targets and
permissions.

## Previous: 0.5.5 (2026-10-25)

0.5.5 = 0.5.4 plus Edit / Delete / Mark resolved on the reviewer's own comments during a
review (TDR-0172). Package 61036 bytes, SHA-256
`34416872901cbd0fff9fa7f9069b3b0126682cc5feace33853ee6b19c7cb6768`. Same targets and
permissions.

## Previous: 0.5.4 (2026-10-25, supersedes 0.5.2/0.5.3)

0.5.4 = 0.5.3 plus a popup that shows "Reviewing <project> in this tab" during a
review and leads with "open the project in Backline → Open with extension" (token setup
moved under an advanced section), Backline colours, and no duplicate floating hint over
the toolbar (TDR-0170). Package 59281 bytes, SHA-256 `45561f7fdc87f9b11db5d26c1c53756e61ae156a6a086bf52c7245bbc93f0173`. Same targets and
permissions.

## Previous: 0.5.3 (2026-10-25, supersedes 0.5.2)

0.5.3 = 0.5.2 plus: while the extension reviews a tab, a Backline snippet the site
itself embeds steps aside (no second toolbar / name prompt). Package
`apps/extension/dist/backline-extension.zip` (58,720 bytes, SHA-256
`12c4c0058e8b8a1d53e2a452b01f876726f8445cb33c624cffd85c263eaf41e9`), same production
API/dashboard targets and permissions as below. Verified in Chromium with the unpacked
build: readiness check, Open with extension, toolbar on the site, a saved comment with
its screenshot (TDR-0169). Submit 0.5.3 instead of 0.5.2.

## Previous: 0.5.2 (2026-10-25)

Source and the dashboard's download are at **0.5.2** (screen/voice recording, console &
network capture, steps to reproduce, snapshot hash fix for the 422, version-first
polling). Package: `apps/extension/dist/backline-extension.zip` from `pnpm --filter
@backline/extension build` (58658 bytes, SHA-256 `84c9d56e0e6e4e2fd1d20ee7d34dcf8ca684278f5f58fa185a3cb6fae15279e8`); it targets the production
API `backlinewidget-production.up.railway.app` and dashboard `backline-qa.vercel.app`.
Permissions are unchanged from 0.4.13 (`storage`, `activeTab`, `scripting`,
`<all_urls>`), so no new permission warning.

To ship it: while 0.4.13 is still *Pending review*, either wait for that result and then
upload 0.5.2 as an update (Package → Upload new package → Submit for review), or cancel
the pending review and submit 0.5.2 directly (review restarts). 0.4.13 keeps working with
the dashboard (`MIN_EXTENSION_VERSION`), which offers 0.5.2 as an update. Once the
listing is public, set `VITE_EXTENSION_STORE_URL` in Vercel so setup shows "Add to
Chrome" (TDR-0160).

## Key paths and identifiers

- Chrome Web Store item: `kdijhbgnbpjoaalbpnimfomemeheokca`
- Dashboard: `https://chrome.google.com/webstore/devconsole/5fd8da85-962c-4216-b346-8f4b6ab6f004/kdijhbgnbpjoaalbpnimfomemeheokca/edit/listing`
- Current unpacked Chrome build: `apps/extension/dist/`
- Uploaded package: `apps/extension/dist/backline-extension.zip`
- Screenshot uploaded as Screenshot 1: `.tools/verification/2026-10-24-extension-store-1280x800.jpg`
- Google Pending Review evidence: `.tools/verification/2026-10-24-store-pending-review.jpg`
- Package/version evidence: `.tools/verification/2026-10-24-store-package-0.4.13.jpg`
- Detailed decisions/evidence: [TDR-0143](../tdr/0143-current-chrome-store-draft-and-reviewer-access.md)
- Running handoff ledger: [06-delivery](06-delivery.md)

The screenshots above are in the local ignored `.tools/verification/` folder;
the paths are recorded here, but those image files are not committed to Git.
The private guest review URL remains in Google's private test instructions and
is intentionally omitted from public docs.

## Verified so far

- The Chrome tab displayed Backline's native toolbar and New comment composer
  on the isolated Example Project.
- A Copy-tagged demo comment saved successfully; its thread showed the saved
  text and a captured-screenshot link.
- The store accepted Screenshot 1 and accepted the 0.4.13 item for review.
- Extension/widget lint, typecheck and build passed (6/6 Turbo tasks, cached).
  The uploaded ZIP is 51,939 bytes with SHA-256
  `704885DDCF562B877C0160118888648AF91CDBFF3F8CF12DEFB597740D8DB2D6`.

## Next steps

1. Check the dashboard for Google's review result. If approved, verify the
   public listing and install the store version in Chrome.
2. Investigate the page-version capture HTTP 422 seen on example.com. Confirm
   the extension reports capture failure clearly while saved comments and
   captured screenshots continue to work.
3. Complete browser acceptance for guest/member review, point and rectangle
   comments, screenshot opening, return-to-Backline navigation, refresh and
   service-worker restart.
4. Check trader-verification status and any existing registration-fee receipt
   in the publisher account if the owner still needs payment confirmation.

For this Codex task, do not add a test suite. Use the repository-required
lint/typecheck/build checks for any code change and record manual browser
acceptance separately from automated verification.
