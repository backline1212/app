# TDR-0143: Bring the existing Chrome Web Store draft up to date

Date: 2026-10-24. Status: submitted for review; automatic publication selected.

## Decision

The owner explicitly requested checking `contact.dwarkesh@gmail.com` and publishing
Backline. Use its existing item `kdijhbgnbpjoaalbpnimfomemeheokca`, preserving the
publisher and item identity. The signed-in dashboard was available in the in-app
browser, as the owner clarified; Chrome's extensions gallery cannot be scripted.

Replace the older 0.4.9 draft with the checked source package 0.4.13. Keep existing
permissions and protocol. Save the publicly rendered `/privacy` and `/support`
URLs and accurate collection categories: personal identifiers, authentication,
personal communications, reviewed page history, review activity and website
content. The owner explicitly confirmed all three data-use statements and
authorized checking the boxes; saved the three certifications on that basis.
Do not infer those facts from source alone.

Use a separate `Backline Store Demo` workspace and its automatically created
Example Project at example.com for screenshots and reviewer access. A first
attempt to create a demo in `sd` was rejected by its two-active-project limit;
no existing project was archived or changed to make room. Do not use private client
sites or real account credentials in listing assets. The private Google testing
instructions contain a guest demonstration link; that link is not copied into
public listing text or these source documents.

## Evidence and remaining gates

- The dashboard recognizes the intended account and existing item. Its Package
  table confirms version 0.4.13 after upload; the item is not published yet.
- The public privacy and support pages render while signed out. The saved URLs
  point to `https://backline-qa.vercel.app/privacy` and `/support`.
- Added the existing public support email as the publisher contact and requested
  Google's verification. The owner completed it; Settings confirms Verified email
  address. Trader verification independently remains pending.
- The owner's Chrome screenshot showed installed Backline 0.4.3 enabled with a
  background-script load error. After the owner loaded the current build, a
  live Chrome tab on example.com showed the native Backline toolbar and New
  comment composer. A draft comment was entered for the listing screenshot.
  After submission, a Copy-tagged demo comment was posted in the isolated
  Example Project; its on-site thread showed the saved text and a View captured
  screenshot link. Page-version capture separately reported HTTP 422 and
  remains open.
- Captured a genuine 1280x800 JPEG from that Chrome tab with the toolbar and
  composer visible. Uploaded it as Screenshot 1, saved the listing, and Google's
  Submit for review button became enabled.
- Submitted the item with automatic publication after approval selected. Google
  warned that broad host permissions may require an in-depth review; the
  extension's review-any-site behavior uses those permissions. The dashboard
  confirmed Item submitted and Status: Pending review. Google review and live
  publication remain external gates. No charge was made or verified.

## Verification

Affected extension/widget lint, typecheck and build pass (6/6 Turbo tasks, cached).
The uploaded 51,939-byte ZIP has root manifest 0.4.13, three bundled scripts,
popup HTML and all four declared icons. Its SHA-256 is
`704885DDCF562B877C0160118888648AF91CDBFF3F8CF12DEFB597740D8DB2D6`.
Package-table evidence is saved locally at
`.tools/verification/2026-10-24-store-package-0.4.13.jpg`.
The current listing screenshot and submission confirmation are saved at
`.tools/verification/2026-10-24-extension-store-1280x800.jpg` and
`.tools/verification/2026-10-24-store-pending-review.jpg`. No suite was added
or run. Browser evidence covers toolbar/composer rendering and a saved demo
comment with captured screenshot, but not successful page-version capture.
Submission does not make the item live; Google review remains a separate
external gate. A later dashboard read still showed Status: Pending review and
Screenshot 1.
