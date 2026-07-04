-- Migration: 005_admin
-- Adds admin action auditing for the hosted control plane admin APIs.

CREATE TABLE IF NOT EXISTS admin_actions (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_github_id  BIGINT,
  actor_login      TEXT,
  installation_id  BIGINT REFERENCES installations(id) ON DELETE SET NULL,
  action           TEXT NOT NULL,
  target_type      TEXT NOT NULL,
  target_id        TEXT NOT NULL,
  status           TEXT NOT NULL DEFAULT 'ok',
  metadata         JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS admin_actions_install_idx
  ON admin_actions(installation_id);

CREATE INDEX IF NOT EXISTS admin_actions_action_idx
  ON admin_actions(action);

CREATE INDEX IF NOT EXISTS admin_actions_created_idx
  ON admin_actions(created_at DESC);
