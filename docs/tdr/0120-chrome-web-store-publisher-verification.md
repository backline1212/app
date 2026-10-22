# TDR-0120: Use the intended Chrome Web Store publisher and keep release claims evidence based

Date: 2026-10-23. Status: release preparation; publisher verification pending.

## Decision

Use the existing Chrome Web Store dashboard associated with
`contact.dwarkesh@gmail.com` for Backline. The account owner identified this as a
trader account for business/professional publishing. Google then presented a
publisher-verification flow requiring a payment profile and legal identity or
organization evidence. The owner completes that flow in Google's page; credentials,
identity documents and payment details are not collected in the repository or this
task. Do not equate entering that flow with a paid fee, completed verification or a
published listing.

Prepare the source-matched 0.4.9 ZIP and truthful listing disclosures. Keep the
store listing in draft until the owner has verified service-wide privacy facts,
provided a public privacy policy/support route and reviewer access, and the actual
extension UI has been captured and tested. Google review and publication are
separate states. The live install link changes only after an approved item URL is
known.

## Evidence and follow-up

The Chrome Web Store dashboard showed the intended account email, trader prompt,
and publisher-verification preparation dialog. Google lists legal name/address,
phone, ID/address evidence for individuals or organization registration evidence
for organizations. The account page also showed a contact email verification
requirement. No registration-fee amount, charge, package upload or review state
has been observed.

The built ZIP's root manifest is 0.4.9. Extension/widget lint, typecheck and
build passed (6/6 tasks); the ZIP structure, icon dimensions and SHA-256 are in
the [release handoff](../implementation/chrome-web-store-release-2026-10-20.md).
The public API's extension download still returns 0.4.4 at the time of this
check, so the source-matched 0.4.9 package needs a backend rollout and public
artifact verification before the Web Store submission. Installed-extension
acceptance and owner certifications remain open.
