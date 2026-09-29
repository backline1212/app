# Branch Overview: Billing Plans, Stripe, Razorpay & UPI Integration

> **Branch:** `feat/billing-plans-stripe-razorpay`  
> **Base:** `main`  
> **Target:** Complete SaaS subscription, multi-gateway payments, plan limits, and invoicing architecture.

---

## 1. Executive Summary

This branch transitions the application from a placeholder billing page to a **production-ready, end-to-end subscription & payments system**. 

### Key Highlights:
- **Realistic Pricing & Competitor Tiering:** Standardized SaaS pricing with monthly/annual intervals in dual **USD ($)** and **INR (₹)** currencies.
- **Dual Payment Rails:** Direct integration for **Stripe** (International cards/checkout) and **Razorpay + UPI** (Indian domestic cards, NetBanking, and instant UPI QR).
- **Plug-and-Play Gateway Setup:** Works immediately with a safe **Test Sandbox Fallback** in development, and switches to live transactions simply by adding API keys to `.env` without any code changes.
- **Server-Side Plan Limit Enforcement:** Enforces project limits, team member seats, and AI review quotas with friendly upgrade redirects.
- **Invoicing & Audit Ledger:** Generates sequential invoices (`INV-YYYY-XXXX`) and billing timeline events with downloadable receipts.

---

## 2. Plans & Pricing Structure

Tiered pricing was benchmarked against industry-standard visual review and QA tools (*BugHerd, Marker.io, Jam.dev, Linear*):

| Plan | Monthly Pricing | Annual Pricing (Save ~20%) | Limits & Included Features |
| :--- | :--- | :--- | :--- |
| **Free Starter** | **$0** / **₹0** | **$0** / **₹0** | <ul><li>2 Active Projects</li><li>2 Team Members</li><li>20 AI review credits/mo</li><li>Unlimited Guest/Client Reviewers</li><li>Public Live Site & Extension Review</li><li>5 GB Storage</li></ul> |
| **Solo Pro** | **$24/mo** / **₹1,899/mo** | **$19/mo** / **₹1,499/mo** | <ul><li>5 Active Projects</li><li>5 Team Members</li><li>200 AI credits/mo</li><li>Video & Audio Screen Recording</li><li>Browser Console Replay</li><li>20 GB Storage</li></ul> |
| **Team Standard**<br>*(Most Popular)* | **$59/mo** / **₹4,699/mo** | **$49/mo** / **₹3,899/mo** | <ul><li>20 Active Projects</li><li>15 Team Members</li><li>1,000 AI credits/mo (BugHunt AI)</li><li>Full Integrations (Slack, Jira, ClickUp, Asana, Trello)</li><li>Cloud Login Browser Sessions</li><li>Custom Branding & Domains</li><li>100 GB Storage</li></ul> |
| **Agency Enterprise** | **$179/mo** / **₹14,299/mo** | **$149/mo** / **₹11,999/mo** | <ul><li>Unlimited Projects</li><li>100 Team Members</li><li>10,000 AI credits/mo</li><li>Dedicated 4-hour SLA Support</li><li>1,000 GB Fast CDN Storage</li><li>White-label client portals</li></ul> |

---

## 3. How the Payment Flow Works

### Dual Gateway Architecture
1. **Stripe (International Checkout):**
   - Initiates standard Stripe Checkout sessions.
   - Handles redirects to Stripe hosted checkout and processes incoming webhooks (`checkout.session.completed`, `customer.subscription.deleted`).
2. **Razorpay & UPI (Indian Rails):**
   - Generates Razorpay orders with support for Cards, UPI IDs (VPA), and interactive UPI QR codes.
   - Cryptographically verifies payments using HMAC-SHA256 signatures before activating workspace subscriptions.
3. **Automatic Sandbox / Demo Mode:**
   - When payment gateway API keys are empty in `.env`, the system automatically enters **Sandbox Mode**.
   - Clicking *"Complete Payment"* simulates the full payment gateway handshake, updates the workspace plan, adjusts quota limits, records the transaction in MongoDB, and issues an invoice.

---

## 4. End-to-End User Experience & Connected Flows

### A. Billing Dashboard (`/w/:slug/billing`)
- **Current Plan Banner:** Displays active plan status, renewal date, and real-time usage meters for Projects, Team Seats, and AI Credits.
- **Interactive Plan Selector:** Dynamic toggles between Monthly / Annual and USD ($) / INR (₹).
- **Competitor Comparison Matrix:** In-depth breakdown comparing features across Feedback, Video Capture, Team Tools, and AI Security.
- **Invoices History:** Chronological table of all past transactions with instant receipt downloads.

### B. Plan Limit Enforcement & Upgrade Triggers
- **Creating Projects:** If a workspace on the Free tier tries to create a 3rd project, the backend returns a `402 Payment Required` error. The UI displays an upgrade CTA prompting the user to upgrade to Solo or Team.
- **Inviting Members:** Team invitations enforce the seat limit defined by the active tier.
- **Deep Linking:** Modals and error states automatically redirect to `/w/:slug/billing?upgrade=<plan_id>` with pre-selected tiers.

---

## 5. Database Schema & Migration

### MongoDB Collections (Live Persistence)
- `workspaces`: Added billing fields (`plan`, `plan_limits_json`, `subscription_status`, `billing_interval`, `billing_currency`, `provider`, `current_period_end`).
- `invoices`: Stores historical invoices with amount, currency, provider reference, PDF/download URLs, and status.
- `billing_events`: Audit trail of all subscription changes and webhook events.
- **Additive Indexes:** Created in `app/core/indexes.py` for high-performance workspace-scoped queries.

### Relational SQL DDL Script
- Located at: `backend/scripts/schema_billing.sql`
- Contains complete DDL (`CREATE TABLE billing_plans`, `workspaces_billing`, `billing_subscriptions`, `billing_invoices`, `billing_events`) and default seed data.

### Migration Script
- Located at: `backend/scripts/migrate_billing_schema.py`
- Safely backfills existing workspaces with default free tier limits and ensures indexes are built.

---

## 6. How to Switch to Live Production Gateways

When you receive live Stripe or Razorpay credentials, simply add them to your `.env` file. **No code modifications are required**:

```env
# Stripe Credentials
STRIPE_SECRET_KEY=sk_live_51...
STRIPE_PUBLISHABLE_KEY=pk_live_51...
STRIPE_WEBHOOK_SECRET=whsec_...

# Razorpay Credentials
RAZORPAY_KEY_ID=rzp_live_...
RAZORPAY_KEY_SECRET=...
RAZORPAY_WEBHOOK_SECRET=...

# Disable Sandbox for Live Mode
BILLING_SANDBOX_ENABLED=false
```

---

## 7. Quality Assurance & Verification Summary

| Check | Scope | Result |
| :--- | :--- | :--- |
| **Frontend Production Build** | `apps/web`, `apps/widget`, `apps/extension` |  Passed (0 bundling errors) |
| **TypeScript Typecheck** | All 6 monorepo packages |  Passed (0 type errors) |
| **ESLint** | Strict zero-warning linting |  Passed (0 lint errors) |
| **Backend Python Mypy** | 189 source files |  Passed (`Success: no issues found`) |
| **Backend Ruff Format & Check** | 201 source files |  Passed (100% formatted) |
| **Multi-Tenant Isolation** | Workspace boundary verification |  Passed (20/20 repos verified) |
| **Unit & E2E Test Suites** | `backend/tests/test_billing.py` & Playwright |  Passed |
