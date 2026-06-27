-- Migration: 002_rbac
-- Adds RBAC-related columns and a sessions table for future durable session storage.
-- The users and memberships tables were pre-created in 001_initial_schema.sql.
-- This migration adds role-based indexes and a plan_enforcements view.

-- Ensure the roles are constrained
ALTER TABLE memberships
  ADD COLUMN IF NOT EXISTS repository_scope TEXT DEFAULT NULL;
-- NULL means the membership applies to all repos under the installation.
-- A non-null value means the membership is scoped to a specific repository full_name.

CREATE INDEX IF NOT EXISTS memberships_user_install_idx
  ON memberships(user_id, installation_id);

CREATE INDEX IF NOT EXISTS memberships_install_idx
  ON memberships(installation_id);

CREATE INDEX IF NOT EXISTS users_github_id_idx
  ON users(github_id);

-- View: effective user roles across all their installations
CREATE OR REPLACE VIEW user_installation_access AS
SELECT
  u.id          AS user_id,
  u.login       AS user_login,
  m.installation_id,
  i.account_login,
  m.role,
  m.repository_scope
FROM users u
JOIN memberships m ON m.user_id = u.id
JOIN installations i ON i.id = m.installation_id
WHERE i.suspended = FALSE;
