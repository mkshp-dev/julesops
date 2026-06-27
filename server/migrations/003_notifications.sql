-- Migration: 003_notifications
-- Adds notification_destinations and alert_rules tables for the alert worker.

CREATE TABLE IF NOT EXISTS notification_destinations (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  installation_id  BIGINT NOT NULL REFERENCES installations(id) ON DELETE CASCADE,
  name             TEXT NOT NULL,
  type             TEXT NOT NULL,         -- 'webhook' | 'email' | 'slack'
  url              TEXT,                  -- webhook or Slack incoming webhook URL
  email            TEXT,                  -- recipient address (type=email)
  enabled          BOOLEAN NOT NULL DEFAULT TRUE,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS notification_destinations_install_idx
  ON notification_destinations(installation_id);

CREATE TABLE IF NOT EXISTS alert_rules (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  installation_id  BIGINT NOT NULL REFERENCES installations(id) ON DELETE CASCADE,
  rule_type        TEXT NOT NULL,         -- 'dispatch_failure' | 'stale_in_progress' | 'stale_review' | 'webhook_failure' | 'config_drift'
  threshold_hours  INTEGER NOT NULL DEFAULT 24,
  enabled          BOOLEAN NOT NULL DEFAULT TRUE,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS alert_rules_install_idx
  ON alert_rules(installation_id);

-- Alert delivery log (prevents duplicate notifications)
CREATE TABLE IF NOT EXISTS alert_deliveries (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  rule_id          UUID NOT NULL REFERENCES alert_rules(id) ON DELETE CASCADE,
  destination_id   UUID NOT NULL REFERENCES notification_destinations(id) ON DELETE CASCADE,
  job_id           UUID REFERENCES jobs(id) ON DELETE SET NULL,
  sent_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  status           TEXT NOT NULL DEFAULT 'sent',  -- 'sent' | 'failed'
  error_message    TEXT
);

CREATE INDEX IF NOT EXISTS alert_deliveries_rule_idx ON alert_deliveries(rule_id);
