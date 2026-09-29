# TDR-0052: Billing plans, Stripe, Razorpay/UPI and plan limits

Date: 2026-09-30
Status: Implemented; verified by ruff/mypy/lint/typecheck/build, a 41-check backend pass
and a headless browser pass on the in-memory harness. Live Stripe/Razorpay keys have not
been exercised.

## Context

The branch `feat/billing-plans-stripe-razorpay` replaced the billing placeholder with
four plans, Stripe and Razorpay/UPI checkout, a test sandbox, plan limits and invoices.
It was first filed as TDR-0048, and 0048 and 0051 were both taken on `main` by the
time it merged, so this record is 0052. The spec is `docs/BILLING_BRANCH_OVERVIEW.md`.

A review of that first cut found problems that had to be fixed before it could take
money:

- **Free upgrades.**
  - Webhooks never checked their signatures, so anyone could POST a fake
    `checkout.session.completed` and move any workspace to any plan.
  - `verify-payment` activated whatever plan the browser named. It skipped
    verification when the Stripe session id was missing or the Razorpay secret was
    unset, and it accepted `provider: "sandbox"` even in production.
- **Duplicate invoices.** Invoice numbers were a per-workspace count, but the index
  was globally unique, so the second workspace to pay hit a duplicate-key 500. The
  browser confirm and the webhook both activated, which would have issued two
  invoices for one payment.
- **Broken gateway flows.**
  - Real Razorpay never opened Razorpay Checkout. It sent made-up payment ids and
    signatures, which fail verification.
  - Returning from Stripe showed a success toast but never confirmed the payment.
- **Nothing expired.** A paid plan stayed active forever, since nothing ended it.
- **Fake data in the product.**
  - The checkout showed card-number, expiry, CVC and UPI inputs that went nowhere.
  - The banner showed a fake "•••• 4242" card and a 0.1 GB storage figure.
  - The AI-credit meter was always 0, because nothing counted AI usage.
- **Limits.** Plan limits didn't match the spec. A 401 on a bad signature made the
  dashboard silently refresh and retry.

## Decisions

**Plans (`billing/plans.py`)** match the spec. There are four tiers:

| Plan | USD mo / yr-rate | INR mo / yr-rate | Projects | Seats | AI credits | Storage |
|---|---|---|---|---|---|---|
| Free Starter | $0 | ₹0 | 2 | 2 | 20 | 5 GB |
| Solo Pro | $24 / $19 | ₹1,899 / ₹1,499 | 5 | 5 | 200 | 20 GB |
| Team Standard | $59 / $49 | ₹4,699 / ₹3,899 | 20 | 15 | 1,000 | 100 GB |
| Agency Enterprise | $179 / $149 | ₹14,299 / ₹11,999 | unlimited | 100 | 10,000 | 1,000 GB |

- Limits are read from this module on every request; there is no per-workspace
  snapshot. Changing a plan here changes it for everyone on it.
- `None` means unlimited.
- The spec's video/audio recording, console replay, custom branding/domains and
  white-label portals don't exist in the product. They are listed but flagged
  **Coming soon**, so no one pays for something they can't use.
- Pricing was benchmarked against BugHerd, Marker.io, Jam.dev and Linear. The page
  does not publish claims about those products.

**Prepaid periods, no auto-renewal.**
- A payment buys 30 or 365 days. Both gateways take a one-time payment, because
  Razorpay subscriptions need plans set up in its dashboard.
- `effective_plan_id` treats a paid plan whose `current_period_end` has passed as
  Free. It is used everywhere a plan is read: limits, the billing page, the workspace
  list and the extension. Nothing needs a cron job to lapse a plan.
- Paying for the plan you're already on extends it from the current end date. Any
  other plan starts a new period today; the rest of the old one isn't carried over,
  and the checkout says so.
- "Switch to Free" takes effect immediately and doesn't refund. There is nothing at
  either gateway to cancel.

**Checkouts are recorded before payment (`billing_checkouts`).**
- `POST /billing/checkout` fixes the plan, period, currency and amount (in minor
  units). It then creates the Stripe Checkout Session or Razorpay order.
- Confirmation takes only the `checkout_id`, plus Razorpay's payment id and
  signature. It activates what the record says, never a plan named by the client.
- Checks per gateway:
  - **Stripe:** the session is re-read from Stripe and must be `paid`, with a
    matching amount and currency.
  - **Razorpay:** HMAC-SHA256 over `order_id|payment_id` with the key secret.
- `_activate_checkout` runs in one Mongo transaction: pending→paid claim, plan
  fields, invoice number and invoice. The first of the browser confirm and the
  webhook wins; the other is a no-op. A crash mid-way leaves the checkout pending for
  a retry. A unique `checkout_id` index on invoices backs this up.

**Webhooks are authenticated** by signature over the raw body.
- **Stripe:** `t=…,v1=…` checked against `STRIPE_WEBHOOK_SECRET`, with a 5-minute
  replay window. Handles `checkout.session.completed` and
  `checkout.session.async_payment_succeeded`.
- **Razorpay:** `X-Razorpay-Signature` checked against `RAZORPAY_WEBHOOK_SECRET`.
  Handles `payment.captured` and `order.paid`, and requires the amount to match.
- Without a secret the endpoint refuses. The routes are
  `/api/v1/billing/webhooks/{stripe,razorpay}` and are kept out of OpenAPI.
- Set both secrets in production. The webhook is what activates the plan for a
  payer who closes the tab before returning to Backline.

**Sandbox.**
- A checkout with a gateway that has no keys completes as a labelled test payment.
  This happens only while `BILLING_SANDBOX_ENABLED` is true.
- It is **always refused when `ENVIRONMENT=production`**, at checkout and at
  confirm.
- Test payments show a "Test payment" chip on the plan and invoices, and receipts
  say nothing was charged.

**Gateways in the UI.**
- **Stripe:** redirect to hosted Checkout with `invoice_creation` on, so each payment
  has a real Stripe invoice PDF linked from the invoice list. The Stripe customer is
  saved and reused with the key mode (test/live) it was created under, which enables
  "Billing details in Stripe" (the customer portal).
- **Razorpay:** Checkout.js opens Razorpay's own sheet for UPI (QR or UPI ID), RuPay
  and other cards, and netbanking. Razorpay requires INR, so choosing Razorpay
  switches the currency to INR.
- The checkout dialog is closed before Razorpay opens, because a native modal
  `<dialog>` makes the rest of the page (Razorpay's iframe included) inert.
- Backline's UI never collects card or UPI details.

**Limits (`billing/limits.py`)** return 402 `PLAN_LIMIT_EXCEEDED`, with
`details.upgrade_plan_id` naming the next tier up.
- **Projects:** checked when creating, duplicating, auto-creating from the extension
  and restoring an archived project. Without the restore check, archive → create →
  restore would get around the limit.
- **Members:** checked before the invited user record is created.
- **AI credits:** one per completed Groq call (summarize, suggest replies, BugHunt
  analysis), counted per calendar month (UTC) in `ai_usage`. Placeholder answers
  given while AI is off are free.
- The check and the insert aren't atomic, so two simultaneous creates at the limit
  can overshoot by one. This is accepted.
- Only these three are enforced, as the spec lists. The comparison table's
  integration, cloud-login and MCP rows describe the plans but are not gated yet.
- The dashboard spots a limit error by its code, not by the word "limit". The old
  check also fired on "This project has reached its file limit".

**Invoices** are numbered `INV-YYYY-NNNN`, in sequence per calendar year across the
whole service, from an atomic counter. Numbering is per seller, not per customer.
Stripe payments link Stripe's invoice PDF. Razorpay and test payments get a
plain-text receipt built from the record.

**Data.**
- New collections: `billing_checkouts`, `invoices`, `billing_events` and `ai_usage`.
- New workspace fields: `billing_interval`, `billing_currency`, `billing_provider`,
  `current_period_start/end` and `stripe_customer_id/mode`.
- Additive indexes are in `BILLING_INDEXES`.
- A workspace with none of these fields reads as Free, so no backfill is needed.
- `scripts/migrate_billing_schema.py` is dry-run by default and only reports or
  creates indexes.
- `scripts/schema_billing.sql` is a PostgreSQL mirror for reporting exports. It is
  not used by the app.

**Removed from the first cut:**
- `success_url`/`cancel_url` in the checkout request, which were an open redirect
  through Stripe;
- `plan_limits_json` snapshots;
- the fake payment-method strings;
- `storage_gb_used`;
- the unused workspace customer/subscription indexes;
- `STRIPE_PUBLISHABLE_KEY`, which hosted Checkout doesn't need.

## Verification

- `ruff check`, `ruff format --check` and `mypy app scripts` pass (201 files). The
  workspace-scoping check passes (20 repositories).
- `pytest tests/test_billing.py tests/test_permissions.py`: 11 passed.
- A scratch backend pass ran the real app on mongomock/fakeredis: 41/41 checks.
  - It covers plan limits (HTTP 402), sandbox checkout, idempotent confirm,
    renewal extension and cross-workspace isolation.
  - It covers Razorpay signatures (bad → 422), signed/unsigned/replayed Stripe
    webhooks, Razorpay webhooks with a wrong amount, expiry and restore-over-limit.
  - It covers AI credits and their monthly reset, switching to Free, and the
    production sandbox block.
  - mongomock has no transactions, so the harness ran the transaction callback
    directly. Transaction rollback itself was not exercised.
- Browser pass (Chromium, harness API + Vite):
  - it covered the page, URL-backed period/currency filters, a test-mode upgrade,
    the confirmation, and the invoice row;
  - it covered the sidebar plan update and the `?upgrade=` deep link;
  - at 390px there was no horizontal overflow, and dark mode rendered correctly;
  - there were no console errors beyond React Router's existing future-flag notice.
- `pnpm lint`, `pnpm typecheck` and `pnpm build` pass.
- Per this repo's instructions for Claude Code, no new test suites were written. The
  two existing billing e2e specs were rewritten to match the real UI, but not run,
  because that needs the full stack.

## Before taking real money

1. Set `ENVIRONMENT=production`, the gateway keys and **both webhook secrets**.
2. Point Stripe at `/api/v1/billing/webhooks/stripe` with
   `checkout.session.completed` and `checkout.session.async_payment_succeeded`.
   Point Razorpay at `/api/v1/billing/webhooks/razorpay` with `payment.captured` and
   `order.paid`.
3. Configure the Stripe customer portal in the Stripe dashboard.
4. Run one real low-value payment through each gateway. Neither live path has been
   exercised yet.
5. Taxes (GST/VAT) and receipt legal details are not handled. Decide them before
   launch.
