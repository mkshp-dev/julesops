'use strict';

/**
 * rbac.js — Role-based access control middleware and helpers.
 *
 * Roles (in order of least to most privileged):
 *   viewer  — read-only access to dashboard data
 *   member  — viewer + can trigger retries/requeues
 *   admin   — member + can manage RBAC memberships and settings
 *   owner   — full control, including installation deletion
 *
 * In Postgres mode, roles are checked against the memberships table.
 * In JSON-file demo mode, all authenticated users are treated as owners
 * (single-tenant demo — no multi-org access control).
 *
 * Middleware functions attach to the raw Node.js http.IncomingMessage / ServerResponse
 * objects. They return true if the request should continue, or false if a 401/403
 * response has been sent and the handler should stop.
 */

const db = require('./db');

// ─── Role ordering ─────────────────────────────────────────────────────────────

const ROLE_ORDER = ['viewer', 'member', 'admin', 'owner'];

/**
 * Return true if `actual` role is at least as powerful as `required`.
 *
 * @param {string} actual
 * @param {string} required
 * @returns {boolean}
 */
function roleAtLeast(actual, required) {
  return ROLE_ORDER.indexOf(actual) >= ROLE_ORDER.indexOf(required);
}

// ─── Postgres membership lookup ───────────────────────────────────────────────

/**
 * Look up the user's role for a specific installation.
 * Returns null if the user has no membership.
 *
 * @param {string} userId         UUID from users table
 * @param {number} installationId
 * @returns {Promise<string|null>} role string or null
 */
async function getUserRole(userId, installationId) {
  const pool = db.getPool();
  if (!pool) {
    // JSON-file mode: grant owner to all authenticated users
    return 'owner';
  }

  const row = await db.queryOne(
    `SELECT role FROM memberships
      WHERE user_id = $1 AND installation_id = $2
      ORDER BY ARRAY_POSITION(ARRAY['owner','admin','member','viewer'], role)
      LIMIT 1`,
    [userId, installationId],
  );

  return row ? row.role : null;
}

/**
 * Get all installation IDs the user has access to.
 *
 * @param {string} userId
 * @returns {Promise<number[]>}
 */
async function getUserInstallations(userId) {
  const pool = db.getPool();
  if (!pool) return []; // JSON-file mode — caller handles

  const rows = await db.query(
    `SELECT DISTINCT installation_id FROM memberships WHERE user_id = $1`,
    [userId],
  );
  return rows.map(r => r.installation_id);
}

/**
 * Get installation IDs the user can access at or above the required role.
 * Returns null when running without Postgres so callers can treat demo mode
 * as unrestricted.
 *
 * @param {string} userId
 * @param {string} requiredRole
 * @returns {Promise<number[]|null>}
 */
async function getAccessibleInstallationIds(userId, requiredRole = 'viewer') {
  const pool = db.getPool();
  if (!pool) return null;

  const rows = await db.query(
    `SELECT m.installation_id, m.role
       FROM memberships m
       JOIN installations i ON i.id = m.installation_id
      WHERE m.user_id = $1
        AND i.suspended = FALSE`,
    [userId],
  );

  return rows
    .filter((row) => roleAtLeast(row.role, requiredRole))
    .map((row) => row.installation_id);
}

// ─── HTTP middleware helpers ───────────────────────────────────────────────────

/**
 * Utility: send a JSON response.
 */
function sendJson(res, statusCode, payload) {
  const body = JSON.stringify(payload, null, 2);
  res.writeHead(statusCode, {
    'content-type': 'application/json; charset=utf-8',
    'cache-control': 'no-store',
  });
  res.end(body);
}

/**
 * requireAuth middleware — returns false and sends 401 if the request has no session.
 *
 * @param {import('http').IncomingMessage} req
 * @param {import('http').ServerResponse}  res
 * @returns {boolean} true if authenticated
 */
function requireAuth(req, res) {
  if (!req.session) {
    sendJson(res, 401, { ok: false, error: 'authentication required' });
    return false;
  }
  return true;
}

/**
 * requireRole middleware — checks that the authenticated user has at least the
 * specified role for the installation referenced in the request.
 *
 * The installation ID can come from:
 *   - req.installationId (set by caller before invoking this)
 *   - query param ?installation_id=...
 *
 * In JSON-file mode (no pool), all authenticated users are granted access
 * since there's no multi-tenant isolation to enforce.
 *
 * @param {string} role  Minimum required role
 * @returns {(req, res) => Promise<boolean>}
 */
function requireRole(role) {
  return async function (req, res) {
    if (!requireAuth(req, res)) return false;

    const pool = db.getPool();
    if (!pool) {
      // Demo mode: authenticated = authorized
      return true;
    }

    const url = new URL(req.url, `http://${req.headers.host}`);
    const installationId = req.installationId || Number(url.searchParams.get('installation_id'));

    if (!installationId) {
      // No installation context — allow for global endpoints (stats, health, etc.)
      return true;
    }

    const userRole = await getUserRole(req.session.githubId, installationId);

    if (!userRole || !roleAtLeast(userRole, role)) {
      sendJson(res, 403, {
        ok: false,
        error: `insufficient permissions (required: ${role}, actual: ${userRole || 'none'})`,
      });
      return false;
    }

    return true;
  };
}

/**
 * Filter a list of jobs to only those the user is authorized to see.
 *
 * In Postgres mode, only jobs from authorized installations are returned.
 * In JSON-file mode, all jobs are returned.
 *
 * @param {object[]} jobs
 * @param {object}   session  req.session
 * @returns {Promise<object[]>}
 */
async function filterJobsByAuthorization(jobs, session) {
  const pool = db.getPool();
  if (!pool || !session) return jobs;

  const installationIds = await getUserInstallations(session.githubId);
  if (installationIds.length === 0) return [];

  // Get authorized repo full names
  const rows = await db.query(
    `SELECT full_name FROM repositories WHERE installation_id = ANY($1)`,
    [installationIds],
  );
  const authorizedRepos = new Set(rows.map(r => r.full_name));
  return jobs.filter(j => authorizedRepos.has(j.repository || j.repo));
}

module.exports = {
  requireAuth,
  requireRole,
  getUserRole,
  getUserInstallations,
  getAccessibleInstallationIds,
  filterJobsByAuthorization,
  roleAtLeast,
};
