-- Migration: 004_subscriptions
-- Extends the subscriptions table with Stripe-specific columns and plan enforcement.
-- The subscriptions table was created in 001_initial_schema.sql.

-- Add trial support
ALTER TABLE subscriptions
  ADD COLUMN IF NOT EXISTS trial_end TIMESTAMPTZ DEFAULT NULL;

-- Add Stripe price/product tracking
ALTER TABLE subscriptions
  ADD COLUMN IF NOT EXISTS stripe_price_id TEXT DEFAULT NULL;

-- Add metadata JSONB for future extensibility
ALTER TABLE subscriptions
  ADD COLUMN IF NOT EXISTS metadata JSONB DEFAULT NULL;

CREATE INDEX IF NOT EXISTS subscriptions_stripe_customer_idx
  ON subscriptions(stripe_customer_id);

CREATE INDEX IF NOT EXISTS subscriptions_stripe_sub_idx
  ON subscriptions(stripe_subscription_id);

-- View: current plan for each installation
CREATE OR REPLACE VIEW installation_plans AS
SELECT
  i.id            AS installation_id,
  i.account_login,
  COALESCE(s.plan, 'free')   AS plan,
  COALESCE(s.status, 'active') AS subscription_status,
  s.current_period_end,
  s.cancel_at_period_end
FROM installations i
LEFT JOIN subscriptions s ON s.installation_id = i.id;
