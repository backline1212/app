# Branch Overview: Billing Plans, Stripe, Razorpay & UPI Integration

> **Branch:** `feat/billing-plans-stripe-razorpay`
> **Base:** `main`
> **Decision record:** [TDR-0052](tdr/0052-billing-plans-stripe-razorpay-upi.md)

---

## 1. Summary

This branch replaces the billing placeholder with paid plans, real payments and
server-enforced limits.

- **Pricing:** four tiers, monthly or yearly, in **USD ($)** or **INR (₹)**.
- **Two payment rails:**
  - **Stripe** for international cards, Apple Pay and Google Pay.
  - **Razorpay** for UPI (QR or UPI ID), RuPay and other Indian cards, and
    netbanking.
- **Plug-and-play gateways:** a gateway goes live as soon as its keys are in `.env`,
  with no code changes. Without keys, local and review environments complete
  checkouts as clearly labelled **test payments**. Production never does.
- **Limits:** active projects, team seats and monthly AI credits are enforced by the
  API, which returns a 402 with an upgrade link.
- **Invoices:** every payment gets a sequential `INV-YYYY-NNNN` invoice and an audit
  event. Stripe payments link Stripe's own invoice PDF.

---

## 2. Plans & Pricing

Pricing was benchmarked against BugHerd, Marker.io, Jam.dev and Linear. Yearly
billing saves about 20%.

| Plan | Monthly | Yearly (per month) | Limits & features |
| :--- | :--- | :--- | :--- |
| **Free Starter** | $0 / ₹0 | $0 / ₹0 | 2 active projects · 2 team members · 20 AI credits/mo · unlimited guest & client reviewers · live site, proxy & extension review · 5 GB storage |
| **Solo Pro** | $24 / ₹1,899 | $19 / ₹1,499 | 5 projects · 5 members · 200 AI credits/mo · 20 GB storage · video & audio recording *(coming soon)* · browser console replay *(coming soon)* |
| **Team Standard** *(Most Popular)* | $59 / ₹4,699 | $49 / ₹3,899 | 20 projects · 15 members · 1,000 AI credits/mo (BugHunt AI) · Slack, Jira, ClickUp, Asana & Trello · cloud login browser sessions · 100 GB storage · custom branding & domains *(coming soon)* |
| **Agency Enterprise** | $179 / ₹14,299 | $149 / ₹11,999 | Unlimited projects · 100 members · 10,000 AI credits/mo · dedicated 4-hour SLA support · 1,000 GB storage · white-label client portals *(coming soon)* |

Items marked *coming soon* aren't in the product yet. The pricing page labels them
that way so no one pays for them expecting them to work today. The plan catalogue
lives in `backend/app/modules/billing/plans.py`; change prices and limits there.

---

## 3. How Payment Works

**Plans are prepaid.**
- A payment buys 30 or 365 days, and nothing renews or charges automatically.
- When the period ends, the workspace drops back to Free until someone renews.
- Renewing the same plan early adds time to the end of the current period.
- Switching to another plan starts a new period today.

**Flow:**
1. The owner picks a plan, period, currency and payment method. The API records a
   **checkout** that fixes exactly what is being bought and for how much.
2. The payer completes the payment with the gateway:
   - **Stripe:** Backline redirects to Stripe's hosted checkout, then Stripe sends
     the payer back.
   - **Razorpay / UPI:** Razorpay's own payment window opens over the page. The payer
     scans the UPI QR, enters a UPI ID, or pays by card or netbanking.
3. The payment is confirmed:
   - **Stripe:** the API re-reads the session from Stripe.
   - **Razorpay:** the API checks the HMAC-SHA256 signature.
   The signed webhook from either gateway confirms it too. Whichever confirmation
   arrives first activates the plan and issues the invoice, exactly once.
4. **Test payments:** when a gateway has no keys and `BILLING_SANDBOX_ENABLED=true`,
   step 2 is skipped. The plan activates, and the plan and invoice are labelled
   "Test payment". This is never allowed when `ENVIRONMENT=production`.

Backline's own UI never asks for card numbers or UPI IDs; the gateways collect them.

---

## 4. What Users See

### A. Billing page (`/w/:slug/billing`)
- **Current plan:**
  - the plan name, when it's paid through, and whether it's a test payment;
  - live meters for active projects, team seats and this month's AI credits;
  - owners also get **Renew**, **Switch to Free** and, for Stripe customers,
    **Billing details in Stripe**.
- **Plans:** four cards with a monthly/yearly toggle and a $/₹ toggle. Both toggles
  are kept in the URL (`?interval=monthly&currency=inr`).
- **Comparison table:** every plan side by side in four groups: Core Feedback &
  Review, Video & Replay Capture, Integrations & Team, and AI & Security.
- **Invoices & receipts:** each payment shows its invoice number, date, period and
  amount. Each row links a Stripe PDF or offers a downloadable receipt.

### B. Limits and upgrade prompts
- **Projects:** creating, duplicating, extension auto-create and restoring an archived
  project all count. Free allows 2, and a new workspace's sample project is one of
  them.
- **Seats:** inviting a member counts. The check runs before any user record is
  created.
- **AI credits:** each completed AI summary, suggested reply or BugHunt analysis uses
  one credit. Credits reset on the 1st of each month (UTC).
- When a limit is hit, the error offers **See plans**, which opens
  `/w/:slug/billing?upgrade=<next plan>` with that plan's checkout already open. Only
  the workspace owner can pay; other roles are told so.

---

## 5. Data & Migration

**MongoDB collections:**
- `billing_checkouts`: what each checkout is for (plan, period, currency, amount) and
  its gateway reference.
- `invoices`: one per paid checkout, sequential `INV-YYYY-NNNN` numbers.
- `billing_events`: audit trail (`payment_succeeded`, `plan_canceled`).
- `ai_usage`: one row per AI credit spent.
- New fields on `workspaces`: `billing_interval`, `billing_currency`,
  `billing_provider`, `current_period_start/end` and `stripe_customer_id/mode`.

Existing workspaces need no backfill; a workspace without these fields reads as Free.
The indexes are additive (`BILLING_INDEXES` in `app/core/indexes.py`) and are created
at startup.

**Migration script:** `python -m scripts.migrate_billing_schema` lists the missing
billing indexes. Add `--apply` to create them.

**SQL reference:** `backend/scripts/schema_billing.sql` is a PostgreSQL mirror of the
same data for reporting exports. The app itself doesn't use it.

---

## 6. Going Live

Add the keys to `.env`; no code changes are needed.

```env
ENVIRONMENT=production

# Stripe - https://dashboard.stripe.com/apikeys
STRIPE_SECRET_KEY=sk_live_...
STRIPE_WEBHOOK_SECRET=whsec_...

# Razorpay - https://dashboard.razorpay.com/app/keys
RAZORPAY_KEY_ID=rzp_live_...
RAZORPAY_KEY_SECRET=...
RAZORPAY_WEBHOOK_SECRET=...

BILLING_SANDBOX_ENABLED=false
```

Then:
1. **Stripe webhook:** point it at `https://<api>/api/v1/billing/webhooks/stripe`
   with `checkout.session.completed` and `checkout.session.async_payment_succeeded`.
2. **Razorpay webhook:** point it at `https://<api>/api/v1/billing/webhooks/razorpay`
   with `payment.captured` and `order.paid`.
3. **Stripe portal:** turn on the customer portal in the Stripe dashboard to enable
   "Billing details in Stripe".
4. **Test payment:** make one small real payment through each gateway before
   launch.

The webhook secrets matter. Without them, a payer who closes the tab before landing
back on Backline pays but doesn't get the plan.

---

## 7. Verification

| Check | Scope | Result |
| :--- | :--- | :--- |
| Production build | `pnpm build` (web, widget, extension) | Passed |
| TypeScript | `pnpm typecheck` (6 packages) | Passed |
| ESLint | `pnpm lint`, zero warnings | Passed |
| Python types | `mypy app scripts` (201 files) | Passed |
| Ruff | `ruff check` + `ruff format --check` | Passed |
| Tenant isolation | `scripts/check_workspace_scoping.py` (20 repositories) | Passed |
| Unit tests | `tests/test_billing.py`, `tests/test_permissions.py` | 11 passed |
| Backend flows | Real app on in-memory Mongo/Redis: limits, checkout, signatures, webhooks, idempotency, expiry, production sandbox block | 41/41 checks |
| Browser | Billing page, test-mode upgrade, invoice, deep link, light/dark, 390px wide | Passed |
| Live gateways | Real Stripe/Razorpay keys | **Not yet run** |
| E2E specs | `billing-plans-payments.spec.ts`, journey 6 (need the full stack) | **Updated, not yet run** |

**Still to decide:**
- GST/VAT and receipt legal details.
- Whether the comparison table's integration, cloud-login and MCP rows should become
  enforced limits.
