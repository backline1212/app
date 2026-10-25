# TDR-0194: One-click unsubscribe for digest and feedback emails

Date: 2026-10-25. Source: email deliverability. Gmail and Yahoo expect recurring
mail to carry RFC 8058 one-click unsubscribe headers; the digest and feedback emails only
said "manage emails in your account settings", which needs a sign-in.

## Decisions

- Digest and feedback-notification emails carry `List-Unsubscribe: <url>` and
  `List-Unsubscribe-Post: List-Unsubscribe=One-Click` (Resend), plus an "Unsubscribe" link
  under the card. Sign-in codes, invitations and client emails are transactional and have
  none.
- The URL is `{PUBLIC_API_BASE_URL}/api/v1/email/unsubscribe/{user}.{kind}.{signature}`:
  an HMAC (domain-separated, keyed by `JWT_SIGNING_KEY`) over user and kind (`digest` or
  `feedback`). It doesn't expire, so old emails keep working; rotating the key retires it.
- **POST** (what mail providers send) turns the preference off at once: `daily_digest`
  for digests, `email_notifications` (instant feedback emails) for feedback. **GET** only
  shows a confirmation page with an Unsubscribe button, so link scanners that open URLs
  can't unsubscribe anyone. Both answer with a small page in the email layout, a strict CSP
  (no scripts), and a link back to account settings. Invalid or tampered links get 404.
  Rate-limited to 30 a minute per IP.
- Turning the emails back on stays in the account settings.

## Verification

Backend ruff/mypy and the workspace-scoping check. Locally: GET showed "Stop receiving
Backline daily digest emails?" and changed nothing; a one-click POST
(`List-Unsubscribe=One-Click`) set `daily_digest` false; the feedback link set
`email_notifications` false; a tampered or malformed token returned 404. With a stubbed
Resend call the payload carried both headers, the footer link and the text part.
