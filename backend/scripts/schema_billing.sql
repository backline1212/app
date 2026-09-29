-- ============================================================================
-- Backline Billing & Subscription Database Schema
-- Compatible with PostgreSQL (9.6+) / Supabase / Neon / MySQL / CockroachDB
-- ============================================================================

-- 1. BILLING PLANS (Master table for SaaS tiers, pricing, and resource quotas)
CREATE TABLE IF NOT EXISTS billing_plans (
    id VARCHAR(50) PRIMARY KEY,
    name VARCHAR(100) NOT NULL,
    badge VARCHAR(50),
    description TEXT NOT NULL,
    price_monthly_usd INTEGER NOT NULL DEFAULT 0,  -- In whole USD dollars (e.g. 24 = $24)
    price_annual_usd INTEGER NOT NULL DEFAULT 0,   -- In USD dollars/mo billed annually (e.g. 19 = $19)
    price_monthly_inr INTEGER NOT NULL DEFAULT 0,  -- In INR Rupees (e.g. 1899 = ₹1,899)
    price_annual_inr INTEGER NOT NULL DEFAULT 0,   -- In INR Rupees/mo billed annually (e.g. 1499 = ₹1,499)
    project_limit INTEGER NOT NULL DEFAULT 1,      -- 999 = unlimited
    member_limit INTEGER NOT NULL DEFAULT 2,       -- 999 = unlimited
    ai_credits_monthly INTEGER NOT NULL DEFAULT 25,
    storage_gb INTEGER NOT NULL DEFAULT 1,
    integrations_allowed JSON NOT NULL,            -- e.g. ["slack", "clickup"] or ["all"]
    features_json JSON NOT NULL,                   -- List of display feature bullet points
    is_popular BOOLEAN NOT NULL DEFAULT FALSE,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- 2. WORKSPACES BILLING (Workspace subscription state & provider links)
CREATE TABLE IF NOT EXISTS workspaces_billing (
    workspace_id VARCHAR(64) PRIMARY KEY,
    plan_id VARCHAR(50) NOT NULL REFERENCES billing_plans(id),
    subscription_status VARCHAR(30) NOT NULL DEFAULT 'active', -- active, trialing, past_due, canceled
    billing_interval VARCHAR(20) NOT NULL DEFAULT 'monthly',   -- monthly, annual
    billing_currency VARCHAR(10) NOT NULL DEFAULT 'usd',       -- usd, inr
    provider VARCHAR(30) NOT NULL DEFAULT 'free',             -- stripe, razorpay, free, manual
    stripe_customer_id VARCHAR(100),
    stripe_subscription_id VARCHAR(100),
    razorpay_customer_id VARCHAR(100),
    razorpay_subscription_id VARCHAR(100),
    current_period_start TIMESTAMP WITH TIME ZONE,
    current_period_end TIMESTAMP WITH TIME ZONE,
    cancel_at_period_end BOOLEAN NOT NULL DEFAULT FALSE,
    plan_limits_json JSON,                                     -- Snapshot of tier limits at purchase
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_workspaces_billing_stripe_cust ON workspaces_billing(stripe_customer_id);
CREATE INDEX IF NOT EXISTS idx_workspaces_billing_razorpay_cust ON workspaces_billing(razorpay_customer_id);
CREATE INDEX IF NOT EXISTS idx_workspaces_billing_stripe_sub ON workspaces_billing(stripe_subscription_id);
CREATE INDEX IF NOT EXISTS idx_workspaces_billing_razorpay_sub ON workspaces_billing(razorpay_subscription_id);

-- 3. BILLING SUBSCRIPTIONS (Detailed subscription lifecycle records)
CREATE TABLE IF NOT EXISTS billing_subscriptions (
    id VARCHAR(64) PRIMARY KEY,
    workspace_id VARCHAR(64) NOT NULL,
    plan_id VARCHAR(50) NOT NULL REFERENCES billing_plans(id),
    status VARCHAR(30) NOT NULL DEFAULT 'active',
    billing_interval VARCHAR(20) NOT NULL DEFAULT 'monthly',
    currency VARCHAR(10) NOT NULL DEFAULT 'usd',
    amount NUMERIC(10, 2) NOT NULL DEFAULT 0.00,
    provider VARCHAR(30) NOT NULL,                           -- stripe, razorpay, sandbox
    provider_subscription_id VARCHAR(100),
    provider_customer_id VARCHAR(100),
    current_period_start TIMESTAMP WITH TIME ZONE NOT NULL,
    current_period_end TIMESTAMP WITH TIME ZONE NOT NULL,
    cancel_at TIMESTAMP WITH TIME ZONE,
    canceled_at TIMESTAMP WITH TIME ZONE,
    ended_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_billing_subs_workspace ON billing_subscriptions(workspace_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_billing_subs_provider_id ON billing_subscriptions(provider_subscription_id);

-- 4. BILLING INVOICES & RECEIPTS
CREATE TABLE IF NOT EXISTS billing_invoices (
    id VARCHAR(64) PRIMARY KEY,
    workspace_id VARCHAR(64) NOT NULL,
    subscription_id VARCHAR(64),
    invoice_number VARCHAR(60) NOT NULL UNIQUE,              -- e.g. INV-2026-0001
    amount_paid NUMERIC(10, 2) NOT NULL DEFAULT 0.00,
    currency VARCHAR(10) NOT NULL DEFAULT 'usd',
    status VARCHAR(30) NOT NULL DEFAULT 'paid',              -- paid, open, void, uncollectible
    provider VARCHAR(30) NOT NULL DEFAULT 'sandbox',
    provider_invoice_id VARCHAR(100),
    hosted_invoice_url TEXT,
    pdf_url TEXT,
    plan_id VARCHAR(50) NOT NULL,
    billing_interval VARCHAR(20) NOT NULL DEFAULT 'monthly',
    period_start TIMESTAMP WITH TIME ZONE NOT NULL,
    period_end TIMESTAMP WITH TIME ZONE NOT NULL,
    paid_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_billing_invoices_ws ON billing_invoices(workspace_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_billing_invoices_num ON billing_invoices(invoice_number);

-- 5. BILLING AUDIT EVENTS
CREATE TABLE IF NOT EXISTS billing_events (
    id VARCHAR(64) PRIMARY KEY,
    workspace_id VARCHAR(64) NOT NULL,
    event_type VARCHAR(60) NOT NULL,                         -- checkout_completed, subscription_created, plan_changed, etc.
    provider VARCHAR(30) NOT NULL DEFAULT 'sandbox',
    provider_event_id VARCHAR(100),
    amount NUMERIC(10, 2) NOT NULL DEFAULT 0.00,
    currency VARCHAR(10) NOT NULL DEFAULT 'usd',
    plan_id VARCHAR(50) NOT NULL,
    billing_interval VARCHAR(20) NOT NULL DEFAULT 'monthly',
    metadata_json JSON,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_billing_events_ws ON billing_events(workspace_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_billing_events_type ON billing_events(event_type);

-- ============================================================================
-- SEED DATA: 4 STANDARD SAAS TIERS (Free, Solo, Team, Enterprise)
-- Benchmark aligned with Linear, BugHerd, Marker.io, Userback & Jam.dev
-- ============================================================================

INSERT INTO billing_plans (
    id, name, badge, description, 
    price_monthly_usd, price_annual_usd, 
    price_monthly_inr, price_annual_inr, 
    project_limit, member_limit, ai_credits_monthly, storage_gb, 
    integrations_allowed, features_json, is_popular
) VALUES 
(
    'free',
    'Free',
    'Starter',
    'For individual developers and freelancers getting started with visual reviews.',
    0, 0,
    0, 0,
    1, 2, 25, 1,
    '["community"]',
    '["1 Active Project", "Up to 2 Team Members", "Unlimited Guest & Client Reviewers", "25 AI actions/month (Summaries & Replies)", "Standard Pin & Area Comments", "1 GB Fast Asset Storage", "Community Support"]',
    FALSE
),
(
    'solo',
    'Solo',
    'Pro Freelancer',
    'For independent contractors, UI/UX designers, and freelance QA engineers.',
    24, 19,
    1899, 1499,
    5, 3, 250, 15,
    '["slack", "clickup"]',
    '["5 Active Projects", "Up to 3 Team Members", "Unlimited Guest & Client Reviewers", "250 AI actions/month", "Slack & ClickUp Two-Way Sync", "Passcode Protected Share Links", "15 GB Fast CDN Asset Storage", "Priority Email Support"]',
    FALSE
),
(
    'team',
    'Team',
    'Most Popular',
    'For fast-shipping digital agencies, product squads, and QA consulting teams.',
    59, 49,
    4699, 3899,
    20, 10, 1000, 100,
    '["slack", "clickup", "jira", "asana", "mcp"]',
    '["20 Active Projects", "Up to 10 Team Members", "Unlimited Guest & Client Reviewers", "1,000 AI actions/month (BugHunt AI included)", "All Integrations (Jira, Asana, ClickUp, Slack)", "Live Cloud Login Browser Sessions", "Multi-Browser Headless Renders", "Custom Link Expiry & Watermarks", "100 GB Fast CDN Storage", "Priority Support (4-hour SLA)"]',
    TRUE
),
(
    'enterprise',
    'Enterprise',
    'Agency Scale',
    'For large agency networks, enterprise QA departments, and mission-critical scale.',
    179, 149,
    14299, 11999,
    999, 999, 5000, 1000,
    '["all"]',
    '["Unlimited Projects & Workspaces", "Unlimited Team Members", "Unlimited Guest & Client Reviewers", "5,000 AI actions/month & Dedicated Model", "Custom Outbound Webhooks & MCP Server", "White-label Branding & Custom Domain", "1 TB Private Encrypted Storage", "Dedicated Customer Success Manager & 99.9% SLA"]',
    FALSE
)
ON CONFLICT (id) DO UPDATE SET
    name = EXCLUDED.name,
    badge = EXCLUDED.badge,
    description = EXCLUDED.description,
    price_monthly_usd = EXCLUDED.price_monthly_usd,
    price_annual_usd = EXCLUDED.price_annual_usd,
    price_monthly_inr = EXCLUDED.price_monthly_inr,
    price_annual_inr = EXCLUDED.price_annual_inr,
    project_limit = EXCLUDED.project_limit,
    member_limit = EXCLUDED.member_limit,
    ai_credits_monthly = EXCLUDED.ai_credits_monthly,
    storage_gb = EXCLUDED.storage_gb,
    integrations_allowed = EXCLUDED.integrations_allowed,
    features_json = EXCLUDED.features_json,
    is_popular = EXCLUDED.is_popular,
    updated_at = CURRENT_TIMESTAMP;
