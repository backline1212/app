# TDR-0048: Real-Ready Billing Plans, Competitor Matrix, Stripe, Razorpay & UPI Integration

Date: 2026-09-29
Status: Accepted

## Context

The product amendment and roadmap required transitioning from the billing placeholder into a complete, production-grade billing system. This includes:
1. Realistic SaaS pricing tiers benchmarking competitors (BugHerd, Marker.io, Linear, Jam.dev) with USD ($) and INR (₹) monthly and annual billing.
2. Direct payment gateway integrations for Stripe, Razorpay, and Indian UPI rails.
3. Safe test sandbox simulation fallback for local development and review environments when live credentials are not yet configured in `.env`.
4. End-to-end plan limits enforcement (active projects, team seats, AI review quota) on both the FastAPI backend and React frontend.
5. Invoicing system with receipt generation, billing audit logs, and clean database schemas (MongoDB collections + additive SQL DDL definitions).

## Decisions

### 1. 4-Tier Plan Hierarchy & Pricing
Based on market analysis of web feedback tools:
- **Free Starter**: $0/mo (₹0) — 2 Active Projects, 2 Team Members, 20 AI review credits/mo, Unlimited Guests/Clients, Public URLs & Chrome Extension.
- **Solo Pro**: $24/mo ($19/mo billed annually) or ₹1,899/mo (₹1,499/mo billed annually) — 5 Active Projects, 5 Team Members, 200 AI credits/mo, Video & Audio Screen Recording, Session Console Replay.
- **Team Standard (Most Popular)**: $59/mo ($49/mo billed annually) or ₹4,699/mo (₹3,899/mo billed annually) — 20 Active Projects, 15 Team Members, 1,000 AI credits/mo, Full Integration Ecosystem (Slack, ClickUp, Trello, Jira, Webhooks), Custom Domain & Branding.
- **Agency Enterprise**: $179/mo ($149/mo billed annually) or ₹14,299/mo (₹11,999/mo billed annually) — Unlimited Projects, 100 Team Members, 10,000 AI credits/mo, Priority Support, 99.9% SLA, Custom Security.

### 2. Dual Gateway Architecture (Stripe + Razorpay + UPI)
- **Stripe Integration**:
  - `POST /api/v1/workspaces/{id}/billing/checkout` generates a Stripe Checkout Session via Stripe REST API (`https://api.stripe.com/v1/checkout/sessions`).
  - Webhook listener at `/api/v1/workspaces/{id}/billing/webhooks/stripe` handles `checkout.session.completed` and `customer.subscription.deleted`.
- **Razorpay + UPI Integration**:
  - Direct integration creating Razorpay Orders (`https://api.razorpay.com/v1/orders`) with payment capture options supporting Credit/Debit cards, Net Banking, and UPI QR / VPA.
  - Razorpay HMAC-SHA256 signature verification (`POST /billing/verify-payment`) using `razorpay_key_secret`.
  - Webhook listener at `/api/v1/workspaces/{id}/billing/webhooks/razorpay` verifies `X-Razorpay-Signature`.
- **Sandbox Fallback Mode**:
  - When `billing_sandbox_enabled` is true or keys are omitted in development, requests execute deterministic simulation paths that generate valid subscription records, sequential invoice numbers (`INV-YYYY-XXXX`), and billing audit entries.

### 3. Server-Side Plan Limit Enforcement (HTTP 402)
- Added `app.core.errors.PlanLimitExceededError` mapping to HTTP 402 `PAYMENT_REQUIRED`.
- Implemented `require_within_plan_limit` helper in `backend/app/modules/billing/limits.py`.
- Integrated checks into:
  - `projects.service.create_project`: checks active project count against `plan_limits_json.max_projects`.
  - `workspaces.service.invite_member`: checks member count against `plan_limits_json.max_team_members`.
- Frontend displays friendly upgrade prompts and redirects to `/w/:slug/billing` with context.

### 4. Database Schema & Migration
- Additive MongoDB indexes registered under `BILLING_INDEXES`:
  - `billing_events`: `(workspace_id, created_at)`
  - `invoices`: `(workspace_id, created_at)` and unique `(invoice_number)`
  - `workspaces`: `stripe_customer_id`, `razorpay_customer_id`
- Standalone SQL DDL file (`backend/scripts/schema_billing.sql`) providing relational schema definition and seed data for external SQL migrations.
- MongoDB migration script (`backend/scripts/migrate_billing_schema.py`) to safely backfill existing workspaces.

### 5. Frontend UI & UX
- Modular components under `apps/web/src/features/billing/`:
  - `PlanPricingCard.tsx`: Rich cards with USD/INR, Monthly/Annual switches, and Annual savings badges.
  - `PlanComparisonMatrix.tsx`: Detailed multi-category breakdown with competitor benchmarks.
  - `CurrentPlanBanner.tsx`: Active plan metrics, renewal dates, and real-time usage progress meters.
  - `InvoiceHistorySection.tsx`: Invoices table with simulated receipt download.
  - `CheckoutModal.tsx`: Complete multi-gateway checkout modal with Stripe, Razorpay, and UPI QR options.
  - `BillingPage.tsx`: Full billing dashboard with URL query handlers (`?upgrade=...`, `?checkout=success`).

## Verification
- Unit tests: `backend/tests/test_billing.py` (4/4 tests passed).
- Playwright E2E: `apps/e2e/tests/billing-plans-payments.spec.ts` and `apps/e2e/tests/journeys/journey-6-integrations-billing.spec.ts`.
- Typecheck: Full turbo typecheck passed across all 6 monorepo packages.
- Lint: Clean ESLint and Ruff passes with 0 errors.
