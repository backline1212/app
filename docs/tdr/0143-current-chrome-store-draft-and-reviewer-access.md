# TDR-0143: Bring the existing Chrome Web Store draft up to date

Date: 2026-10-24. Status: draft and declarations saved; screenshot/submission pending.

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

- The dashboard recognizes the intended account and the existing draft. Its
  Package table confirms version 0.4.13 after upload; the item is not published.
- The public privacy and support pages render while signed out. The saved URLs
  point to `https://backline-qa.vercel.app/privacy` and `/support`.
- Added the existing public support email as the publisher contact and requested
  Google's verification. The owner completed it; Settings confirms Verified email
  address. Trader verification independently remains pending.
- The owner reported updating the installed extension. A fresh Chrome portal
  reload and actual launch still show Update browser extension (0.4.13 minimum).
  Asked the owner to check the extension-card version and duplicate copies.
- After saving the owner's three certifications, Google's Unable to publish
  dialog lists exactly one blocker: At least one screenshot or video is required.
  The owner requested one browser and a step-by-step flow. Continue only in the
  built-in browser, left at Store listing > Screenshots. Current-version native
  acceptance, screenshot upload, review submission and publication remain open.
  No charge was made or verified.

## Verification

Affected extension/widget lint, typecheck and build pass (6/6 Turbo tasks, cached).
The uploaded 51,939-byte ZIP has root manifest 0.4.13, three bundled scripts,
popup HTML and all four declared icons. Its SHA-256 is
`704885DDCF562B877C0160118888648AF91CDBFF3F8CF12DEFB597740D8DB2D6`.
Package-table evidence is saved locally at
`.tools/verification/2026-10-24-store-package-0.4.13.jpg`.
The remaining screenshot-upload section is recorded at
`.tools/verification/2026-10-24-store-screenshot-required.jpg`.
No suite was added or run. Do not infer browser acceptance from the static checks
or claim that submission makes the item immediately live; Google review remains
a separate external gate.
