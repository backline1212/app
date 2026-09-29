-- ============================================================================
-- Backline billing schema - relational reference (PostgreSQL)
--
-- Reference only. Backline stores billing in MongoDB (docs/tdr/0051); nothing runs
-- this file. It mirrors those collections one-to-one for teams that export billing
-- data to a SQL warehouse or reporting database. The plan catalogue itself lives in
-- backend/app/modules/billing/plans.py - keep the seed rows below in step with it.
-- ============================================================================

-- Plan catalogue. NULL limit = unlimited. Annual prices are per month, billed x12.
CREATE TABLE IF NOT EXISTS billing_plans (
    id                  VARCHAR(20) PRIMARY KEY,     -- free, solo, team, enterprise
    name                VARCHAR(100) NOT NULL,
    price_monthly_usd   INTEGER NOT NULL,
    price_annual_usd    INTEGER NOT NULL,
    price_monthly_inr   INTEGER NOT NULL,
    price_annual_inr    INTEGER NOT NULL,
    project_limit       INTEGER,
    member_limit        INTEGER,
    ai_credits_monthly  INTEGER NOT NULL,
    storage_gb          INTEGER NOT NULL
);

-- Billing fields on the `workspaces` collection. A workspace with no row is on Free.
CREATE TABLE IF NOT EXISTS workspace_billing (
    workspace_id          VARCHAR(24) PRIMARY KEY,
    plan                  VARCHAR(20) NOT NULL REFERENCES billing_plans(id),
    billing_interval      VARCHAR(10),               -- monthly, annual
    billing_currency      CHAR(3),                   -- usd, inr
    billing_provider      VARCHAR(10),               -- stripe, razorpay, sandbox
    current_period_start  TIMESTAMPTZ,
    current_period_end    TIMESTAMPTZ,               -- plan lapses to Free after this
    stripe_customer_id    VARCHAR(64),
    stripe_customer_mode  VARCHAR(4)                 -- live, test
);

-- `billing_checkouts`: what is being bought, fixed before the customer pays.
CREATE TABLE IF NOT EXISTS billing_checkouts (
    id                   VARCHAR(24) PRIMARY KEY,
    workspace_id         VARCHAR(24) NOT NULL,
    created_by           VARCHAR(24) NOT NULL,
    provider             VARCHAR(10) NOT NULL,       -- stripe, razorpay, sandbox
    reference            VARCHAR(128) NOT NULL,      -- Stripe session id / Razorpay order id
    plan_id              VARCHAR(20) NOT NULL REFERENCES billing_plans(id),
    "interval"           VARCHAR(10) NOT NULL,
    currency             CHAR(3) NOT NULL,
    amount_minor         INTEGER NOT NULL,           -- cents / paise
    status               VARCHAR(10) NOT NULL,       -- pending, paid
    provider_payment_id  VARCHAR(128),
    created_at           TIMESTAMPTZ NOT NULL,
    paid_at              TIMESTAMPTZ,
    UNIQUE (provider, reference)
);
CREATE INDEX IF NOT EXISTS billing_checkouts_workspace_created
    ON billing_checkouts (workspace_id, created_at DESC);

-- `invoices`: one per paid checkout, numbered INV-YYYY-NNNN across the service.
CREATE TABLE IF NOT EXISTS invoices (
    id                   VARCHAR(24) PRIMARY KEY,
    workspace_id         VARCHAR(24) NOT NULL,
    checkout_id          VARCHAR(24) UNIQUE REFERENCES billing_checkouts(id),
    invoice_number       VARCHAR(20) NOT NULL UNIQUE,
    amount_minor         INTEGER NOT NULL,
    currency             CHAR(3) NOT NULL,
    status               VARCHAR(10) NOT NULL,       -- paid
    plan_id              VARCHAR(20) NOT NULL REFERENCES billing_plans(id),
    plan_name            VARCHAR(100) NOT NULL,
    "interval"           VARCHAR(10) NOT NULL,
    provider             VARCHAR(10) NOT NULL,
    provider_payment_id  VARCHAR(128),
    hosted_invoice_url   TEXT,                       -- Stripe only
    pdf_url              TEXT,                       -- Stripe only
    period_start         TIMESTAMPTZ NOT NULL,
    period_end           TIMESTAMPTZ NOT NULL,
    paid_at              TIMESTAMPTZ NOT NULL,
    created_at           TIMESTAMPTZ NOT NULL
);
CREATE INDEX IF NOT EXISTS invoices_workspace_created ON invoices (workspace_id, created_at DESC);

-- `billing_events`: audit trail (payment_succeeded, plan_canceled).
CREATE TABLE IF NOT EXISTS billing_events (
    id            VARCHAR(24) PRIMARY KEY,
    workspace_id  VARCHAR(24) NOT NULL,
    event_type    VARCHAR(40) NOT NULL,
    provider      VARCHAR(10),
    plan_id       VARCHAR(20) NOT NULL,
    amount_minor  INTEGER NOT NULL DEFAULT 0,
    currency      CHAR(3),
    "interval"    VARCHAR(10),
    metadata      JSONB NOT NULL DEFAULT '{}',
    created_at    TIMESTAMPTZ NOT NULL
);
CREATE INDEX IF NOT EXISTS billing_events_workspace_created
    ON billing_events (workspace_id, created_at DESC);

-- `ai_usage`: one row per AI credit spent; counted per calendar month (UTC).
CREATE TABLE IF NOT EXISTS ai_usage (
    id            VARCHAR(24) PRIMARY KEY,
    workspace_id  VARCHAR(24) NOT NULL,
    action        VARCHAR(40) NOT NULL,              -- summarize, suggest_reply, analyze_project
    created_at    TIMESTAMPTZ NOT NULL
);
CREATE INDEX IF NOT EXISTS ai_usage_workspace_created ON ai_usage (workspace_id, created_at DESC);

INSERT INTO billing_plans (
    id, name,
    price_monthly_usd, price_annual_usd, price_monthly_inr, price_annual_inr,
    project_limit, member_limit, ai_credits_monthly, storage_gb
) VALUES
    ('free',       'Free Starter',        0,   0,     0,     0,    2,   2,    20,    5),
    ('solo',       'Solo Pro',           24,  19,  1899,  1499,    5,   5,   200,   20),
    ('team',       'Team Standard',      59,  49,  4699,  3899,   20,  15,  1000,  100),
    ('enterprise', 'Agency Enterprise', 179, 149, 14299, 11999, NULL, 100, 10000, 1000)
ON CONFLICT (id) DO UPDATE SET
    name = EXCLUDED.name,
    price_monthly_usd = EXCLUDED.price_monthly_usd,
    price_annual_usd = EXCLUDED.price_annual_usd,
    price_monthly_inr = EXCLUDED.price_monthly_inr,
    price_annual_inr = EXCLUDED.price_annual_inr,
    project_limit = EXCLUDED.project_limit,
    member_limit = EXCLUDED.member_limit,
    ai_credits_monthly = EXCLUDED.ai_credits_monthly,
    storage_gb = EXCLUDED.storage_gb;
