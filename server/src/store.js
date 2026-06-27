'use strict';

/**
 * store.js — Data-access layer for JulesOps server.
 *
 * Transparently switches between Postgres (when DATABASE_URL is set) and a
 * local JSON file (demo / local-dev mode).  All callers import from this
 * module only — never directly from db.js or the JSON file helpers below.
 */

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const db = require('./db');

// ─── JSON-file backend (demo mode) ───────────────────────────────────────────

const DATA_DIR = process.env.JULESOPS_DATA_DIR || path.join(__dirname, '..', 'data');
const STORE_PATH = path.join(DATA_DIR, 'store.json');

const EMPTY_STORE = () => ({ organizations: [], repositories: [], jobs: [], events: [] });

function ensureJsonStore() {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  if (!fs.existsSync(STORE_PATH)) {
    fs.writeFileSync(STORE_PATH, JSON.stringify(EMPTY_STORE(), null, 2));
  }
}

function readJsonStore() {
  ensureJsonStore();
  return JSON.parse(fs.readFileSync(STORE_PATH, 'utf8'));
}

function writeJsonStore(store) {
  ensureJsonStore();
  fs.writeFileSync(STORE_PATH, JSON.stringify(store, null, 2));
}

// ─── Helpers shared by both backends ─────────────────────────────────────────

function inferStatusFromLabels(labels) {
  const names = labels
    .map((label) => (typeof label === 'string' ? label : label.name))
    .filter(Boolean);
  const status = names.find((n) => n.startsWith('status:'));
  return status ? status.replace('status:', '') : 'todo';
}

function extractLinkedIssueNumber(text) {
  const match = text.match(/\b(?:close[sd]?|fix(?:e[sd])?|resolve[sd]?)\s+#(\d+)/i);
  return match ? Number(match[1]) : null;
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Check whether a delivery ID has already been processed (idempotency).
 *
 * @param {string} deliveryId
 * @returns {Promise<boolean>}
 */
async function isDuplicateDelivery(deliveryId) {
  const pool = db.getPool();
  if (pool) {
    const row = await db.queryOne('SELECT id FROM events WHERE delivery_id = $1', [deliveryId]);
    return !!row;
  }
  // JSON mode — check events array
  const store = readJsonStore();
  return store.events.some((e) => e.id === deliveryId);
}

/**
 * Persist a received webhook event record.
 *
 * @param {{
 *   deliveryId: string,
 *   eventType: string,
 *   action: string|null,
 *   installationId: number|null,
 *   repository: string|null,
 *   rawPayload: object,
 *   signatureMode: string,
 * }} opts
 * @returns {Promise<object>} The persisted event record
 */
async function saveEvent(opts) {
  const {
    deliveryId,
    eventType,
    action,
    installationId,
    repository,
    rawPayload,
    signatureMode,
  } = opts;

  const pool = db.getPool();
  if (pool) {
    const row = await db.queryOne(
      `INSERT INTO events
         (delivery_id, event_type, action, installation_id, repository, raw_payload, signature_mode)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       RETURNING *`,
      [deliveryId, eventType, action, installationId, repository, JSON.stringify(rawPayload), signatureMode],
    );
    return row;
  }

  // JSON mode
  const store = readJsonStore();
  const record = {
    id: deliveryId,
    event_type: eventType,
    action: action || null,
    repository: repository || null,
    received_at: new Date().toISOString(),
    signature: signatureMode,
  };
  store.events.unshift(record);
  store.events = store.events.slice(0, 500);
  writeJsonStore(store);
  return record;
}

/**
 * Mark an event as processed or failed.
 *
 * @param {string} deliveryId
 * @param {'processed'|'failed'} status
 * @param {string} [errorMessage]
 */
async function updateEventStatus(deliveryId, status, errorMessage) {
  const pool = db.getPool();
  if (pool) {
    await db.query(
      `UPDATE events
          SET processing_status = $1, error_message = $2, processed_at = NOW()
        WHERE delivery_id = $3`,
      [status, errorMessage || null, deliveryId],
    );
  }
  // JSON mode has no processing_status concept — silently ignore
}

/**
 * Upsert a job from a normalised webhook payload.
 *
 * @param {{
 *   repository: string,
 *   issue_number: number,
 *   issue_title: string,
 *   current_status: string,
 *   pr_number?: number|null,
 *   branch_name?: string|null,
 * }} partialJob
 * @returns {Promise<object|null>}
 */
async function upsertJob(partialJob) {
  if (!partialJob || !partialJob.repository || !partialJob.issue_number) {
    return null;
  }

  const pool = db.getPool();
  if (pool) {
    const row = await db.queryOne(
      `INSERT INTO jobs (repository, issue_number, issue_title, current_status, pr_number, branch_name, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, NOW())
       ON CONFLICT (repository, issue_number) DO UPDATE
         SET issue_title    = EXCLUDED.issue_title,
             current_status = EXCLUDED.current_status,
             pr_number      = COALESCE(EXCLUDED.pr_number, jobs.pr_number),
             branch_name    = COALESCE(EXCLUDED.branch_name, jobs.branch_name),
             updated_at     = NOW()
       RETURNING *`,
      [
        partialJob.repository,
        partialJob.issue_number,
        partialJob.issue_title || '',
        partialJob.current_status || 'todo',
        partialJob.pr_number || null,
        partialJob.branch_name || null,
      ],
    );
    return row;
  }

  // JSON mode
  const store = readJsonStore();
  const existing = store.jobs.find(
    (j) => j.repository === partialJob.repository && j.issue_number === partialJob.issue_number,
  );
  if (existing) {
    Object.assign(existing, partialJob, { updated_at: new Date().toISOString() });
    writeJsonStore(store);
    return existing;
  }
  const job = {
    id: crypto.randomUUID(),
    attempt_number: 1,
    pr_number: null,
    branch_name: null,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    ...partialJob,
  };
  store.jobs.push(job);
  writeJsonStore(store);
  return job;
}

/**
 * Normalise a webhook event into a partial job object, or return null.
 *
 * @param {string} eventName
 * @param {object} payload
 * @returns {object|null}
 */
function normalizeJobFromWebhook(eventName, payload) {
  const repo = payload.repository && payload.repository.full_name;
  if (!repo) return null;

  if (eventName === 'issues' && payload.issue) {
    return {
      repository: repo,
      issue_number: payload.issue.number,
      issue_title: payload.issue.title || '',
      current_status: inferStatusFromLabels(payload.issue.labels || []),
    };
  }

  if (eventName === 'pull_request' && payload.pull_request) {
    const issueNumber = extractLinkedIssueNumber(payload.pull_request.body || '');
    if (!issueNumber) return null;
    return {
      repository: repo,
      issue_number: issueNumber,
      issue_title: `Linked PR #${payload.pull_request.number}`,
      current_status:
        payload.action === 'closed' && payload.pull_request.merged ? 'done' : 'review',
      pr_number: payload.pull_request.number,
      branch_name: payload.pull_request.head && payload.pull_request.head.ref,
    };
  }

  if (eventName === 'issue_comment' && payload.issue && payload.comment) {
    const body = (payload.comment.body || '').toLowerCase();
    if (body.includes('/retry') || body.includes('/requeue')) {
      return {
        repository: repo,
        issue_number: payload.issue.number,
        issue_title: payload.issue.title || '',
        current_status: 'todo',
      };
    }
  }

  return null;
}

/**
 * Query jobs with optional filters.
 *
 * @param {{ status?: string, repository?: string, organization?: string, limit?: number, offset?: number }} filters
 * @returns {Promise<object[]>}
 */
async function listJobs(filters = {}) {
  const pool = db.getPool();
  if (pool) {
    const conditions = [];
    const params = [];

    if (filters.status) {
      params.push(filters.status);
      conditions.push(`current_status = $${params.length}`);
    }
    if (filters.repository) {
      params.push(filters.repository);
      conditions.push(`repository = $${params.length}`);
    }
    if (filters.organization) {
      params.push(`${filters.organization}/%`);
      conditions.push(`repository LIKE $${params.length}`);
    }

    const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
    const limit = Math.min(Number(filters.limit) || 100, 500);
    const offset = Number(filters.offset) || 0;

    return db.query(
      `SELECT * FROM jobs ${where} ORDER BY updated_at DESC LIMIT ${limit} OFFSET ${offset}`,
      params,
    );
  }

  // JSON mode
  let jobs = readJsonStore().jobs;
  if (filters.status) jobs = jobs.filter((j) => j.current_status === filters.status);
  if (filters.repository) jobs = jobs.filter((j) => j.repository === filters.repository);
  if (filters.organization)
    jobs = jobs.filter((j) => j.repository.startsWith(`${filters.organization}/`));
  return jobs;
}

/**
 * Get a single job by ID.
 *
 * @param {string} id
 * @returns {Promise<object|null>}
 */
async function getJob(id) {
  const pool = db.getPool();
  if (pool) {
    return db.queryOne('SELECT * FROM jobs WHERE id = $1', [id]);
  }
  const store = readJsonStore();
  return store.jobs.find((j) => j.id === id) || null;
}

/**
 * List attempts for a given job.
 *
 * @param {string} jobId
 * @returns {Promise<object[]>}
 */
async function listAttempts(jobId) {
  const pool = db.getPool();
  if (pool) {
    return db.query('SELECT * FROM attempts WHERE job_id = $1 ORDER BY attempt_number', [jobId]);
  }
  return []; // JSON mode has no attempts table
}

/**
 * List recent events, optionally filtered.
 *
 * @param {{ limit?: number }} opts
 * @returns {Promise<object[]>}
 */
async function listEvents(opts = {}) {
  const limit = Math.min(Number(opts.limit) || 100, 500);
  const pool = db.getPool();
  if (pool) {
    return db.query('SELECT * FROM events ORDER BY received_at DESC LIMIT $1', [limit]);
  }
  return readJsonStore().events.slice(0, limit);
}

/**
 * Return aggregate stats.
 *
 * @returns {Promise<object>}
 */
async function getStats() {
  const pool = db.getPool();
  if (pool) {
    const rows = await db.query(
      `SELECT current_status, COUNT(*)::int AS count FROM jobs GROUP BY current_status`,
    );
    const stats = { total: 0 };
    for (const row of rows) {
      stats[row.current_status] = row.count;
      stats.total += row.count;
    }
    const [evRows] = await db.query('SELECT COUNT(*)::int AS count FROM events');
    stats.events_total = evRows ? evRows.count : 0;
    return stats;
  }

  // JSON mode
  const { jobs, events } = readJsonStore();
  const stats = { total: jobs.length, events_total: events.length };
  for (const job of jobs) {
    stats[job.current_status] = (stats[job.current_status] || 0) + 1;
  }
  return stats;
}

/**
 * List repositories (Postgres) or return JSON-store array.
 *
 * @returns {Promise<object[]>}
 */
async function listRepositories() {
  const pool = db.getPool();
  if (pool) {
    return db.query('SELECT * FROM repositories ORDER BY full_name');
  }
  return readJsonStore().repositories;
}

/**
 * List organizations.
 *
 * @returns {Promise<object[]>}
 */
async function listOrganizations() {
  const pool = db.getPool();
  if (pool) {
    return db.query(
      'SELECT DISTINCT account_login AS login, account_type AS type FROM installations ORDER BY account_login',
    );
  }
  return readJsonStore().organizations;
}

module.exports = {
  // Events
  isDuplicateDelivery,
  saveEvent,
  updateEventStatus,
  listEvents,
  // Jobs
  upsertJob,
  normalizeJobFromWebhook,
  listJobs,
  getJob,
  listAttempts,
  getStats,
  // Repositories & Orgs
  listRepositories,
  listOrganizations,
  // Helpers (exported for testing)
  inferStatusFromLabels,
  extractLinkedIssueNumber,
};
