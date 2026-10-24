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

## Update ready: 0.5.2 (2026-10-25)

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
