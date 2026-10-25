# TDR-0188: Full Content-Security-Policy for the dashboard

Date: 2026-10-25. Source: security review - the web app (Vercel) only sent
`Content-Security-Policy: frame-ancestors 'none'`, so an injected script or a
`<base>`/`<object>` tag would have run with the signed-in user's session. The only inline
script was the theme bootstrap in `index.html`.

## Decisions

- The theme bootstrap moves to `public/theme-init.js`, still a blocking classic script in
  `<head>` (no theme flash), so scripts can be limited to the app's own origin.
- `vercel.json` sends one policy for every path:
  - `default-src 'self'`; `object-src 'none'`; `base-uri 'self'`; `frame-ancestors 'none'`.
  - `script-src 'self' 'wasm-unsafe-eval' https://checkout.razorpay.com` - no inline
    script, no `eval`; Wasm is allowed for the PDF engine's optional decoders.
  - `style-src 'self' 'unsafe-inline' https://fonts.googleapis.com` and
    `font-src 'self' data: https://fonts.gstatic.com` - React style attributes and Inter.
  - `img-src`/`media-src 'self' data: blob: https:` - private storage URLs, previews,
    recordings.
  - `connect-src 'self' https: wss:` and `frame-src 'self' https:` - the API, realtime,
    signed storage, Sentry, review preview domains and Razorpay. These stay scheme-wide
    because the API, storage and preview hosts are per-deployment settings; the script
    restriction is where the protection is.
  - `worker-src 'self' blob:` (PDF worker), `manifest-src 'self'`,
    `form-action 'self' https:`.
- The reviewed website, the widget and the extension are unaffected: they run on the
  preview origin or in the extension, not under the dashboard's policy.

## Verification

Production build served with the `vercel.json` headers (local services added to the
`https:`/`wss:` sources only for the test). Chromium, signed in and as a guest: login,
privacy, support, every workspace page, the website project with its proxy preview and
the widget connected, board, report, image review, a newly uploaded PDF rendered by the
PDF worker, guest file review and guest website entry, dark theme before first paint and
the Inter font - zero policy violations. An injected inline script, a script from an
unlisted host and `eval` were refused; the Razorpay checkout script was allowed.
