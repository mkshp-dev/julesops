'use strict';

/**
 * installation-handlers.js — GitHub App installation webhook handlers.
 *
 * Handles:
 *   installation.created / installation.deleted
 *   installation.suspend / installation.unsuspend
 *   installation_repositories.added / installation_repositories.removed
 *
 * Each handler receives the parsed webhook payload and returns a result summary.
 * Database writes go through the store module; JSON-file mode is transparently
 * supported via the same abstraction.
 */

const db = require('./db');

// ─── Postgres-specific upserts (fall through to JSON-file no-ops if no pool) ─

/**
 * Upsert an installation record in Postgres.
 *
 * @param {object} installation  GitHub installation object from webhook payload
 * @param {boolean} suspended
 */
async function upsertInstallation(installation, suspended = false) {
  const pool = db.getPool();
  if (!pool) {
    // JSON-file mode: no installations table — log and continue
    console.log(
      `[installation] JSON-file mode: skipping DB upsert for installation ${installation.id}`,
    );
    return;
  }

  await db.query(
    `INSERT INTO installations
       (id, app_id, account_login, account_type, target_type,
        access_tokens_url, html_url, suspended, created_at, updated_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, NOW(), NOW())
     ON CONFLICT (id) DO UPDATE
       SET account_login     = EXCLUDED.account_login,
           account_type      = EXCLUDED.account_type,
           access_tokens_url = EXCLUDED.access_tokens_url,
           html_url          = EXCLUDED.html_url,
           suspended         = EXCLUDED.suspended,
           updated_at        = NOW()`,
    [
      installation.id,
      installation.app_id,
      installation.account ? installation.account.login : null,
      installation.account ? installation.account.type : null,
      installation.target_type || (installation.account ? installation.account.type : null),
      installation.access_tokens_url || null,
      installation.html_url || null,
      suspended,
    ],
  );
}

/**
 * Mark an installation as deleted/suspended in Postgres.
 *
 * @param {number} installationId
 * @param {boolean} suspend  true → suspended, false → deleted (full remove)
 */
async function removeOrSuspendInstallation(installationId, suspend = false) {
  const pool = db.getPool();
  if (!pool) return;

  if (suspend) {
    await db.query(
      `UPDATE installations SET suspended = TRUE, updated_at = NOW() WHERE id = $1`,
      [installationId],
    );
  } else {
    // Cascade deletes repositories/memberships/subscriptions via FK constraints
    await db.query(`DELETE FROM installations WHERE id = $1`, [installationId]);
  }
}

/**
 * Upsert a repository record linked to an installation.
 *
 * @param {object} repo            GitHub repository object
 * @param {number} installationId
 */
async function upsertRepository(repo, installationId) {
  const pool = db.getPool();
  if (!pool) {
    console.log(`[installation] JSON-file mode: skipping DB upsert for repo ${repo.full_name}`);
    return;
  }

  const [ownerLogin, repoName] = (repo.full_name || '').split('/');

  await db.query(
    `INSERT INTO repositories
       (id, installation_id, full_name, owner_login, repo_name, private, is_active, created_at, updated_at)
     VALUES ($1, $2, $3, $4, $5, $6, TRUE, NOW(), NOW())
     ON CONFLICT (id) DO UPDATE
       SET installation_id = EXCLUDED.installation_id,
           full_name       = EXCLUDED.full_name,
           owner_login     = EXCLUDED.owner_login,
           repo_name       = EXCLUDED.repo_name,
           private         = EXCLUDED.private,
           is_active       = TRUE,
           updated_at      = NOW()`,
    [repo.id, installationId, repo.full_name, ownerLogin, repoName, repo.private || false],
  );
}

/**
 * Mark a repository as inactive when removed from an installation.
 *
 * @param {number} repoId
 */
async function deactivateRepository(repoId) {
  const pool = db.getPool();
  if (!pool) return;
  await db.query(
    `UPDATE repositories SET is_active = FALSE, updated_at = NOW() WHERE id = $1`,
    [repoId],
  );
}

// ─── Event handlers ───────────────────────────────────────────────────────────

/**
 * Handle `installation` webhook events.
 *
 * @param {object} payload  Parsed GitHub webhook payload
 * @returns {Promise<{ handled: boolean, action: string, installationId: number, summary: string }>}
 */
async function handleInstallationEvent(payload) {
  const { action, installation } = payload;
  const installationId = installation && installation.id;

  if (!installationId) {
    return { handled: false, action, installationId: null, summary: 'no installation id in payload' };
  }

  switch (action) {
    case 'created': {
      await upsertInstallation(installation, false);

      // Persist any repositories bundled with the installation.created event
      const repos = payload.repositories || [];
      for (const repo of repos) {
        await upsertRepository(repo, installationId);
      }

      console.log(
        `[installation] created: installation ${installationId} ` +
        `(${installation.account ? installation.account.login : 'unknown'}) ` +
        `with ${repos.length} repo(s)`,
      );

      return {
        handled: true,
        action,
        installationId,
        summary: `installation created; ${repos.length} repo(s) synced`,
      };
    }

    case 'deleted': {
      await removeOrSuspendInstallation(installationId, false);
      console.log(`[installation] deleted: installation ${installationId}`);
      return { handled: true, action, installationId, summary: 'installation deleted' };
    }

    case 'suspend': {
      await removeOrSuspendInstallation(installationId, true);
      console.log(`[installation] suspended: installation ${installationId}`);
      return { handled: true, action, installationId, summary: 'installation suspended' };
    }

    case 'unsuspend': {
      await upsertInstallation(installation, false);
      console.log(`[installation] unsuspended: installation ${installationId}`);
      return { handled: true, action, installationId, summary: 'installation unsuspended' };
    }

    default:
      return { handled: false, action, installationId, summary: `unhandled installation action: ${action}` };
  }
}

/**
 * Handle `installation_repositories` webhook events.
 *
 * @param {object} payload  Parsed GitHub webhook payload
 * @returns {Promise<{ handled: boolean, action: string, added: number, removed: number }>}
 */
async function handleInstallationRepositoriesEvent(payload) {
  const { action, installation, repositories_added = [], repositories_removed = [] } = payload;
  const installationId = installation && installation.id;

  if (!installationId) {
    return { handled: false, action, installationId: null, added: 0, removed: 0 };
  }

  for (const repo of repositories_added) {
    await upsertRepository(repo, installationId);
  }

  for (const repo of repositories_removed) {
    await deactivateRepository(repo.id);
  }

  console.log(
    `[installation] repositories event (${action}): ` +
    `+${repositories_added.length} added, -${repositories_removed.length} removed ` +
    `for installation ${installationId}`,
  );

  return {
    handled: true,
    action,
    installationId,
    added: repositories_added.length,
    removed: repositories_removed.length,
  };
}

module.exports = {
  handleInstallationEvent,
  handleInstallationRepositoriesEvent,
};
