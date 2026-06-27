-- JulesOps initial schema
-- Migration: 001_initial_schema
-- Creates all core tables needed for the hosted control plane.

-- Internal migration tracking table (must be first)
CREATE TABLE IF NOT EXISTS _migrations (
  id          SERIAL PRIMARY KEY,
  name        TEXT NOT NULL UNIQUE,
  applied_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- GitHub App installations
CREATE TABLE IF NOT EXISTS installations (
  id                 BIGINT PRIMARY KEY,          -- GitHub installation ID
  app_id             INTEGER NOT NULL,
  account_login      TEXT NOT NULL,               -- org or user login
  account_type       TEXT NOT NULL,               -- "Organization" | "User"
  target_type        TEXT NOT NULL,               -- "Organization" | "User"
  access_tokens_url  TEXT,
  html_url           TEXT,
  suspended          BOOLEAN NOT NULL DEFAULT FALSE,
  created_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at         TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Repositories covered by an installation
CREATE TABLE IF NOT EXISTS repositories (
  id               BIGINT PRIMARY KEY,            -- GitHub repo ID
  installation_id  BIGINT NOT NULL REFERENCES installations(id) ON DELETE CASCADE,
  full_name        TEXT NOT NULL,                 -- "owner/repo"
  owner_login      TEXT NOT NULL,
  repo_name        TEXT NOT NULL,
  base_branch      TEXT NOT NULL DEFAULT 'main',
  private          BOOLEAN NOT NULL DEFAULT FALSE,
  is_active        BOOLEAN NOT NULL DEFAULT TRUE,
  config_snapshot  JSONB,                         -- last fetched .github/julesops.yml
  config_version   TEXT,                          -- SHA of the config file at fetch time
  configured       BOOLEAN NOT NULL DEFAULT FALSE,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS repositories_full_name_idx ON repositories(full_name);

-- JulesOps jobs (one per issue per repo)
CREATE TABLE IF NOT EXISTS jobs (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  repository_id    BIGINT REFERENCES repositories(id) ON DELETE SET NULL,
  repository       TEXT NOT NULL,                 -- "owner/repo" denormalized for fast access
  issue_number     INTEGER NOT NULL,
  issue_title      TEXT NOT NULL DEFAULT '',
  current_status   TEXT NOT NULL DEFAULT 'todo',  -- todo | in-progress | review | blocked | failed | done
  attempt_number   INTEGER NOT NULL DEFAULT 1,
  pr_number        INTEGER,
  branch_name      TEXT,
  blocked_reason   TEXT,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(repository, issue_number)
);

CREATE INDEX IF NOT EXISTS jobs_repository_idx ON jobs(repository);
CREATE INDEX IF NOT EXISTS jobs_status_idx ON jobs(current_status);

-- Attempt history per job
CREATE TABLE IF NOT EXISTS attempts (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id           UUID NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,
  attempt_number   INTEGER NOT NULL,
  status           TEXT NOT NULL DEFAULT 'dispatched', -- dispatched | running | succeeded | failed
  dispatch_event   TEXT,                           -- workflow_run event name or similar
  workflow_run_id  BIGINT,
  conclusion       TEXT,                           -- success | failure | cancelled | skipped | null
  started_at       TIMESTAMPTZ,
  finished_at      TIMESTAMPTZ,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS attempts_job_id_idx ON attempts(job_id);

-- Raw webhook event log
CREATE TABLE IF NOT EXISTS events (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  delivery_id       TEXT NOT NULL UNIQUE,          -- x-github-delivery header (idempotency key)
  event_type        TEXT NOT NULL,                 -- x-github-event header
  action            TEXT,                          -- payload.action
  installation_id   BIGINT,
  repository        TEXT,
  raw_payload       JSONB,                         -- sanitized payload stored for replay
  processing_status TEXT NOT NULL DEFAULT 'received', -- received | processed | failed
  error_message     TEXT,
  received_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  processed_at      TIMESTAMPTZ,
  signature_mode    TEXT NOT NULL DEFAULT 'unknown'
);

CREATE INDEX IF NOT EXISTS events_delivery_id_idx ON events(delivery_id);
CREATE INDEX IF NOT EXISTS events_event_type_idx ON events(event_type);
CREATE INDEX IF NOT EXISTS events_processing_status_idx ON events(processing_status);

-- Users who have authenticated via GitHub OAuth
CREATE TABLE IF NOT EXISTS users (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  github_id       BIGINT NOT NULL UNIQUE,
  login           TEXT NOT NULL,
  name            TEXT,
  email           TEXT,
  avatar_url      TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- User membership in an installation (maps GitHub org permissions to JulesOps roles)
CREATE TABLE IF NOT EXISTS memberships (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id          UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  installation_id  BIGINT NOT NULL REFERENCES installations(id) ON DELETE CASCADE,
  role             TEXT NOT NULL DEFAULT 'viewer', -- owner | admin | member | viewer
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(user_id, installation_id)
);

-- Billing subscriptions (Stripe-backed)
CREATE TABLE IF NOT EXISTS subscriptions (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  installation_id       BIGINT NOT NULL REFERENCES installations(id) ON DELETE CASCADE,
  stripe_customer_id    TEXT,
  stripe_subscription_id TEXT,
  plan                  TEXT NOT NULL DEFAULT 'free', -- free | pro | team
  status                TEXT NOT NULL DEFAULT 'active', -- active | past_due | cancelled | trialing
  current_period_end    TIMESTAMPTZ,
  cancel_at_period_end  BOOLEAN NOT NULL DEFAULT FALSE,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(installation_id)
);
