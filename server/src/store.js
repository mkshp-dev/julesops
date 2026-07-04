'use strict';

/**
 * store.js — Data-access layer for JulesOps server.
 *
 * Transparently switches between Postgres (when DATABASE_URL is set) and a
 * local JSON file (demo / local-dev mode). All callers import from this
 * module only — never directly from db.js or the JSON file helpers below.
 */

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const db = require('./db');

// ─── JSON-file backend (demo mode) ───────────────────────────────────────────

const DATA_DIR = process.env.JULESOPS_DATA_DIR || path.join(__dirname, '..', 'data');
const STORE_PATH = path.join(DATA_DIR, 'store.json');

const EMPTY_STORE = () => ({
  organizations: [],
  repositories: [],
  jobs: [],
  events: [],
  installations: [],
  alert_rules: [],
  notification_destinations: [],
  alert_deliveries: [],
  admin_actions: [],
});

function normalizeStoreShape(store = {}) {
  return {
    organizations: Array.isArray(store.organizations) ? store.organizations : [],
    repositories: Array.isArray(store.repositories) ? store.repositories : [],
    jobs: Array.isArray(store.jobs) ? store.jobs : [],
    events: Array.isArray(store.events) ? store.events : [],
    installations: Array.isArray(store.installations) ? store.installations : [],
    alert_rules: Array.isArray(store.alert_rules) ? store.alert_rules : [],
    notification_destinations: Array.isArray(store.notification_destinations) ? store.notification_destinations : [],
    alert_deliveries: Array.isArray(store.alert_deliveries) ? store.alert_deliveries : [],
    admin_actions: Array.isArray(store.admin_actions) ? store.admin_actions : [],
  };
}

function ensureJsonStore() {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  if (!fs.existsSync(STORE_PATH)) {
    fs.writeFileSync(STORE_PATH, JSON.stringify(EMPTY_STORE(), null, 2));
  }
}

function readJsonStore() {
  ensureJsonStore();
  return normalizeStoreShape(JSON.parse(fs.readFileSync(STORE_PATH, 'utf8')));
}

function writeJsonStore(store) {
  ensureJsonStore();
  fs.writeFileSync(STORE_PATH, JSON.stringify(normalizeStoreShape(store), null, 2));
}

function parseDurationMs(value) {
  if (value == null || value === '') return null;
  if (typeof value === 'number' && Number.isFinite(value) && value > 0) {
    return Math.floor(value);
  }

  const text = String(value).trim();
  if (/^\d+$/.test(text)) {
    return Number(text) * 60 * 60 * 1000;
  }

  const match = /^([0-9]+)([smhd])$/i.exec(text);
  if (!match) return null;

  const amount = Number(match[1]);
  const unit = match[2].toLowerCase();
  const multipliers = {
    s: 1000,
    m: 60 * 1000,
    h: 60 * 60 * 1000,
    d: 24 * 60 * 60 * 1000,
  };

  return amount * multipliers[unit];
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

function upsertInstallationRecord(installation, suspended = false) {
  const store = readJsonStore();
  const record = {
    id: installation.id,
    app_id: installation.app_id,
    account_login: installation.account ? installation.account.login : null,
    account_type: installation.account ? installation.account.type : null,
    target_type: installation.target_type || (installation.account ? installation.account.type : null),
    access_tokens_url: installation.access_tokens_url || null,
    html_url: installation.html_url || null,
    suspended,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };

  const existing = store.installations.findIndex((item) => Number(item.id) === Number(installation.id));
  if (existing >= 0) {
    store.installations[existing] = {
      ...store.installations[existing],
      ...record,
      created_at: store.installations[existing].created_at || record.created_at,
      updated_at: new Date().toISOString(),
    };
  } else {
    store.installations.push(record);
  }

  writeJsonStore(store);
  return record;
}

function removeOrSuspendInstallationRecord(installationId, suspend = false) {
  const store = readJsonStore();
  const id = Number(installationId);

  if (suspend) {
    const existing = store.installations.find((item) => Number(item.id) === id);
    if (existing) {
      existing.suspended = true;
      existing.updated_at = new Date().toISOString();
    }
  } else {
    store.installations = store.installations.filter((item) => Number(item.id) !== id);
    store.repositories = store.repositories.filter((repo) => Number(repo.installation_id) !== id);
  }

  writeJsonStore(store);
}

function upsertRepositoryRecord(repo, installationId) {
  const store = readJsonStore();
  const [ownerLogin, repoName] = (repo.full_name || '').split('/');
  const record = {
    id: repo.id,
    installation_id: installationId,
    full_name: repo.full_name,
    owner_login: ownerLogin || '',
    repo_name: repoName || '',
    base_branch: repo.base_branch || 'main',
    private: repo.private || false,
    is_active: true,
    config_snapshot: repo.config_snapshot || null,
    config_version: repo.config_version || null,
    configured: repo.configured || false,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };

  const existing = store.repositories.findIndex((item) => Number(item.id) === Number(repo.id));
  if (existing >= 0) {
    store.repositories[existing] = {
      ...store.repositories[existing],
      ...record,
      created_at: store.repositories[existing].created_at || record.created_at,
      updated_at: new Date().toISOString(),
    };
  } else {
    store.repositories.push(record);
  }

  writeJsonStore(store);
  return record;
}

function deactivateRepositoryRecord(repoId) {
  const store = readJsonStore();
  const existing = store.repositories.find((item) => Number(item.id) === Number(repoId));
  if (existing) {
    existing.is_active = false;
    existing.updated_at = new Date().toISOString();
    writeJsonStore(store);
  }
}

function getRepositoriesForInstallationJson(store, installationId) {
  const id = Number(installationId);
  return store.repositories.filter((repo) => Number(repo.installation_id) === id && repo.is_active !== false);
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

  const store = readJsonStore();
  return store.events.some((event) => event.delivery_id === deliveryId || event.id === deliveryId);
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

  const store = readJsonStore();
  const now = new Date().toISOString();
  const record = {
    id: crypto.randomUUID(),
    delivery_id: deliveryId,
    event_type: eventType,
    action: action || null,
    installation_id: installationId || null,
    repository: repository || null,
    raw_payload: rawPayload,
    processing_status: 'received',
    error_message: null,
    received_at: now,
    processed_at: null,
    signature_mode: signatureMode,
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
    return;
  }

  const store = readJsonStore();
  const existing = store.events.find(
    (event) => event.delivery_id === deliveryId || event.id === deliveryId,
  );
  if (existing) {
    existing.processing_status = status;
    existing.error_message = errorMessage || null;
    existing.processed_at = new Date().toISOString();
    writeJsonStore(store);
  }
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

  const store = readJsonStore();
  const existing = store.jobs.find(
    (job) => job.repository === partialJob.repository && job.issue_number === partialJob.issue_number,
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
 * @param {{ status?: string, repository?: string, organization?: string, installationId?: number, limit?: number, offset?: number }} filters
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
    if (filters.installationId) {
      params.push(filters.installationId);
      conditions.push(`EXISTS (
        SELECT 1 FROM repositories r
        WHERE r.full_name = jobs.repository AND r.installation_id = $${params.length}
      )`);
    }

    const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
    const limit = Math.min(Number(filters.limit) || 100, 500);
    const offset = Number(filters.offset) || 0;

    params.push(limit);
    params.push(offset);

    return db.query(
      `SELECT * FROM jobs ${where} ORDER BY updated_at DESC LIMIT $${params.length - 1} OFFSET $${params.length}`,
      params,
    );
  }

  let jobs = readJsonStore().jobs;
  if (filters.status) jobs = jobs.filter((job) => job.current_status === filters.status);
  if (filters.repository) jobs = jobs.filter((job) => job.repository === filters.repository);
  if (filters.organization) {
    jobs = jobs.filter((job) => job.repository.startsWith(`${filters.organization}/`));
  }
  if (filters.installationId) {
    const store = readJsonStore();
    const repoNames = new Set(
      getRepositoriesForInstallationJson(store, filters.installationId).map((repo) => repo.full_name),
    );
    jobs = jobs.filter((job) => repoNames.has(job.repository));
  }

  const offset = Number(filters.offset) || 0;
  const limit = Math.min(Number(filters.limit) || 100, 500);
  return jobs.slice(offset, offset + limit);
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
  return store.jobs.find((job) => job.id === id) || null;
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
  return [];
}

/**
 * List recent events, optionally filtered.
 *
 * @param {{ installationId?: number, status?: string, since?: string|number, limit?: number }} opts
 * @returns {Promise<object[]>}
 */
async function listEvents(opts = {}) {
  const limit = Math.min(Number(opts.limit) || 100, 500);
  const pool = db.getPool();
  if (pool) {
    const conditions = [];
    const params = [];

    if (opts.installationId) {
      params.push(opts.installationId);
      conditions.push(`installation_id = $${params.length}`);
    }
    if (opts.status) {
      params.push(opts.status);
      conditions.push(`processing_status = $${params.length}`);
    }
    const sinceMs = parseDurationMs(opts.since);
    if (sinceMs != null) {
      params.push(sinceMs);
      conditions.push(`received_at >= NOW() - $${params.length} * INTERVAL '1 millisecond'`);
    }

    const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
    params.push(limit);
    return db.query(
      `SELECT * FROM events ${where} ORDER BY received_at DESC LIMIT $${params.length}`,
      params,
    );
  }

  let events = readJsonStore().events;
  if (opts.installationId) {
    events = events.filter((event) => Number(event.installation_id || 0) === Number(opts.installationId));
  }
  if (opts.status) {
    events = events.filter((event) => (event.processing_status || 'received') === opts.status);
  }
  const sinceMs = parseDurationMs(opts.since);
  if (sinceMs != null) {
    const cutoff = Date.now() - sinceMs;
    events = events.filter((event) => new Date(event.received_at || 0).getTime() >= cutoff);
  }
  return events.slice(0, limit);
}

/**
 * Get a single event by internal UUID or delivery ID.
 *
 * @param {string} id
 * @returns {Promise<object|null>}
 */
async function getEvent(id) {
  const pool = db.getPool();
  if (pool) {
    return db.queryOne('SELECT * FROM events WHERE id = $1 OR delivery_id = $1', [id]);
  }
  const store = readJsonStore();
  return store.events.find((event) => event.id === id || event.delivery_id === id) || null;
}

/**
 * Get an installation record by ID.
 *
 * @param {number|string} installationId
 * @returns {Promise<object|null>}
 */
async function getInstallation(installationId) {
  const pool = db.getPool();
  if (pool) {
    return db.queryOne('SELECT * FROM installations WHERE id = $1', [installationId]);
  }
  const store = readJsonStore();
  return store.installations.find((installation) => Number(installation.id) === Number(installationId)) || null;
}

/**
 * List repositories for an installation.
 *
 * @param {number|string} installationId
 * @returns {Promise<object[]>}
 */
async function listRepositories({ installationId } = {}) {
  const pool = db.getPool();
  if (pool) {
    if (installationId) {
      return db.query('SELECT * FROM repositories WHERE installation_id = $1 ORDER BY full_name', [installationId]);
    }
    return db.query('SELECT * FROM repositories ORDER BY full_name');
  }

  let repos = readJsonStore().repositories;
  if (installationId) {
    repos = repos.filter((repo) => Number(repo.installation_id) === Number(installationId));
  }
  return repos;
}

/**
 * List installation repositories.
 *
 * @param {number|string} installationId
 * @returns {Promise<object[]>}
 */
async function listInstallationRepositories(installationId) {
  return listRepositories({ installationId });
}

/**
 * List installation jobs.
 *
 * @param {number|string} installationId
 * @param {{ status?: string, limit?: number, offset?: number }} filters
 * @returns {Promise<object[]>}
 */
async function listInstallationJobs(installationId, filters = {}) {
  return listJobs({ installationId, ...filters });
}

/**
 * List installation events.
 *
 * @param {number|string} installationId
 * @param {{ status?: string, since?: string|number, limit?: number }} filters
 * @returns {Promise<object[]>}
 */
async function listInstallationEvents(installationId, filters = {}) {
  return listEvents({ installationId, ...filters });
}

/**
 * Record an admin action for audit purposes.
 *
 * @param {{ actorGithubId?: number|null, actorLogin?: string|null, installationId?: number|string|null, action: string, targetType: string, targetId: string, status: string, metadata?: object }} entry
 * @returns {Promise<object>}
 */
async function recordAdminAction(entry) {
  const payload = {
    actorGithubId: entry.actorGithubId || null,
    actorLogin: entry.actorLogin || null,
    installationId: entry.installationId || null,
    action: entry.action,
    targetType: entry.targetType,
    targetId: entry.targetId,
    status: entry.status || 'ok',
    metadata: entry.metadata || {},
  };

  const pool = db.getPool();
  if (pool) {
    const row = await db.queryOne(
      `INSERT INTO admin_actions
         (actor_github_id, actor_login, installation_id, action, target_type, target_id, status, metadata)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       RETURNING *`,
      [
        payload.actorGithubId,
        payload.actorLogin,
        payload.installationId,
        payload.action,
        payload.targetType,
        payload.targetId,
        payload.status,
        JSON.stringify(payload.metadata),
      ],
    );
    return row;
  }

  const store = readJsonStore();
  const record = {
    id: crypto.randomUUID(),
    actor_github_id: payload.actorGithubId,
    actor_login: payload.actorLogin,
    installation_id: payload.installationId,
    action: payload.action,
    target_type: payload.targetType,
    target_id: payload.targetId,
    status: payload.status,
    metadata: payload.metadata,
    created_at: new Date().toISOString(),
  };
  store.admin_actions.unshift(record);
  store.admin_actions = store.admin_actions.slice(0, 1000);
  writeJsonStore(store);
  return record;
}

/**
 * List admin actions, optionally filtered by installation.
 *
 * @param {{ installationId?: number|string, limit?: number }} opts
 * @returns {Promise<object[]>}
 */
async function listAdminActions(opts = {}) {
  const limit = Math.min(Number(opts.limit) || 100, 500);
  const pool = db.getPool();
  if (pool) {
    const conditions = [];
    const params = [];

    if (opts.installationId) {
      params.push(opts.installationId);
      conditions.push(`installation_id = $${params.length}`);
    }

    const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
    params.push(limit);
    return db.query(
      `SELECT * FROM admin_actions ${where} ORDER BY created_at DESC LIMIT $${params.length}`,
      params,
    );
  }

  let actions = readJsonStore().admin_actions;
  if (opts.installationId) {
    actions = actions.filter((action) => Number(action.installation_id || 0) === Number(opts.installationId));
  }
  return actions.slice(0, limit);
}
/**
 * List alert rules, optionally filtered by installation.
 *
 * @param {{ installationId?: number|string, limit?: number }} opts
 * @returns {Promise<object[]>}
 */
async function listAlertRules(opts = {}) {
  const limit = Math.min(Number(opts.limit) || 100, 500);
  const pool = db.getPool();
  if (pool) {
    const conditions = [];
    const params = [];

    if (opts.installationId) {
      params.push(opts.installationId);
      conditions.push(`installation_id = $${params.length}`);
    }

    const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
    params.push(limit);
    return db.query(
      `SELECT * FROM alert_rules ${where} ORDER BY created_at DESC LIMIT $${params.length}`,
      params,
    );
  }

  let rules = readJsonStore().alert_rules;
  if (opts.installationId) {
    rules = rules.filter((rule) => Number(rule.installation_id || 0) === Number(opts.installationId));
  }
  return rules.slice(0, limit);
}

/**
 * Upsert an alert rule.
 *
 * @param {{ id?: string, installation_id: number|string, rule_type: string, threshold_hours?: number, enabled?: boolean }} rule
 * @returns {Promise<object>}
 */
async function upsertAlertRule(rule) {
  const payload = {
    id: rule.id || crypto.randomUUID(),
    installation_id: Number(rule.installation_id),
    rule_type: rule.rule_type,
    threshold_hours: Number(rule.threshold_hours || 24),
    enabled: rule.enabled !== false,
  };

  const pool = db.getPool();
  if (pool) {
    return db.queryOne(
      `INSERT INTO alert_rules (id, installation_id, rule_type, threshold_hours, enabled, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, NOW(), NOW())
       ON CONFLICT (id) DO UPDATE
         SET installation_id = EXCLUDED.installation_id,
             rule_type = EXCLUDED.rule_type,
             threshold_hours = EXCLUDED.threshold_hours,
             enabled = EXCLUDED.enabled,
             updated_at = NOW()
       RETURNING *`,
      [payload.id, payload.installation_id, payload.rule_type, payload.threshold_hours, payload.enabled],
    );
  }

  const store = readJsonStore();
  const existing = store.alert_rules.findIndex((item) => item.id === payload.id);
  const record = {
    ...payload,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };
  if (existing >= 0) {
    record.created_at = store.alert_rules[existing].created_at || record.created_at;
    store.alert_rules[existing] = { ...store.alert_rules[existing], ...record, updated_at: new Date().toISOString() };
    writeJsonStore(store);
    return store.alert_rules[existing];
  }
  store.alert_rules.push(record);
  writeJsonStore(store);
  return record;
}

/**
 * Delete an alert rule.
 *
 * @param {string} id
 * @returns {Promise<boolean>}
 */
async function deleteAlertRule(id) {
  const pool = db.getPool();
  if (pool) {
    const result = await db.query('DELETE FROM alert_rules WHERE id = $1', [id]);
    return Array.isArray(result) ? result.length > 0 : true;
  }

  const store = readJsonStore();
  const before = store.alert_rules.length;
  store.alert_rules = store.alert_rules.filter((item) => item.id !== id);
  writeJsonStore(store);
  return store.alert_rules.length < before;
}

/**
 * List notification destinations, optionally filtered by installation.
 *
 * @param {{ installationId?: number|string, limit?: number }} opts
 * @returns {Promise<object[]>}
 */
async function listNotificationDestinations(opts = {}) {
  const limit = Math.min(Number(opts.limit) || 100, 500);
  const pool = db.getPool();
  if (pool) {
    const conditions = [];
    const params = [];

    if (opts.installationId) {
      params.push(opts.installationId);
      conditions.push(`installation_id = $${params.length}`);
    }

    const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
    params.push(limit);
    return db.query(
      `SELECT * FROM notification_destinations ${where} ORDER BY created_at DESC LIMIT $${params.length}`,
      params,
    );
  }

  let destinations = readJsonStore().notification_destinations;
  if (opts.installationId) {
    destinations = destinations.filter((dest) => Number(dest.installation_id || 0) === Number(opts.installationId));
  }
  return destinations.slice(0, limit);
}

/**
 * Upsert a notification destination.
 *
 * @param {{ id?: string, installation_id: number|string, name: string, type: 'webhook'|'email'|'slack', url?: string, email?: string, enabled?: boolean }} destination
 * @returns {Promise<object>}
 */
async function upsertNotificationDestination(destination) {
  const payload = {
    id: destination.id || crypto.randomUUID(),
    installation_id: Number(destination.installation_id),
    name: destination.name,
    type: destination.type,
    url: destination.url || null,
    email: destination.email || null,
    enabled: destination.enabled !== false,
  };

  const pool = db.getPool();
  if (pool) {
    return db.queryOne(
      `INSERT INTO notification_destinations (id, installation_id, name, type, url, email, enabled, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, NOW(), NOW())
       ON CONFLICT (id) DO UPDATE
         SET installation_id = EXCLUDED.installation_id,
             name = EXCLUDED.name,
             type = EXCLUDED.type,
             url = EXCLUDED.url,
             email = EXCLUDED.email,
             enabled = EXCLUDED.enabled,
             updated_at = NOW()
       RETURNING *`,
      [payload.id, payload.installation_id, payload.name, payload.type, payload.url, payload.email, payload.enabled],
    );
  }

  const store = readJsonStore();
  const existing = store.notification_destinations.findIndex((item) => item.id === payload.id);
  const record = {
    ...payload,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };
  if (existing >= 0) {
    record.created_at = store.notification_destinations[existing].created_at || record.created_at;
    store.notification_destinations[existing] = { ...store.notification_destinations[existing], ...record, updated_at: new Date().toISOString() };
    writeJsonStore(store);
    return store.notification_destinations[existing];
  }
  store.notification_destinations.push(record);
  writeJsonStore(store);
  return record;
}

/**
 * Delete a notification destination.
 *
 * @param {string} id
 * @returns {Promise<boolean>}
 */
async function deleteNotificationDestination(id) {
  const pool = db.getPool();
  if (pool) {
    await db.query('DELETE FROM notification_destinations WHERE id = $1', [id]);
    return true;
  }

  const store = readJsonStore();
  const before = store.notification_destinations.length;
  store.notification_destinations = store.notification_destinations.filter((item) => item.id !== id);
  writeJsonStore(store);
  return store.notification_destinations.length < before;
}

/**
 * Record an alert delivery.
 *
 * @param {{ ruleId: string, destinationId: string, jobId?: string|null, status: string, errorMessage?: string|null }} entry
 * @returns {Promise<object|null>}
 */
async function recordAlertDelivery(entry) {
  const pool = db.getPool();
  if (pool) {
    return db.queryOne(
      `INSERT INTO alert_deliveries (rule_id, destination_id, job_id, status, error_message)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING *`,
      [entry.ruleId, entry.destinationId, entry.jobId || null, entry.status, entry.errorMessage || null],
    );
  }

  const store = readJsonStore();
  const record = {
    id: crypto.randomUUID(),
    rule_id: entry.ruleId,
    destination_id: entry.destinationId,
    job_id: entry.jobId || null,
    sent_at: new Date().toISOString(),
    status: entry.status,
    error_message: entry.errorMessage || null,
  };
  store.alert_deliveries.unshift(record);
  store.alert_deliveries = store.alert_deliveries.slice(0, 1000);
  writeJsonStore(store);
  return record;
}

/**
 * List alert deliveries, optionally filtered by installation.
 *
 * @param {{ installationId?: number|string, limit?: number }} opts
 * @returns {Promise<object[]>}
 */
async function listAlertDeliveries(opts = {}) {
  const limit = Math.min(Number(opts.limit) || 100, 500);
  const pool = db.getPool();
  if (pool) {
    const conditions = [];
    const params = [];

    if (opts.installationId) {
      params.push(opts.installationId);
      conditions.push(`EXISTS (
        SELECT 1 FROM alert_rules r WHERE r.id = alert_deliveries.rule_id AND r.installation_id = $${params.length}
      )`);
    }

    const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
    params.push(limit);
    return db.query(
      `SELECT * FROM alert_deliveries ${where} ORDER BY sent_at DESC LIMIT $${params.length}`,
      params,
    );
  }

  let deliveries = readJsonStore().alert_deliveries;
  if (opts.installationId) {
    const installationId = Number(opts.installationId);
    const rules = new Set(
      readJsonStore().alert_rules.filter((rule) => Number(rule.installation_id || 0) === installationId).map((rule) => rule.id),
    );
    deliveries = deliveries.filter((delivery) => rules.has(delivery.rule_id));
  }
  return deliveries.slice(0, limit);
}/**
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

  const { jobs, events } = readJsonStore();
  const stats = { total: jobs.length, events_total: events.length };
  for (const job of jobs) {
    stats[job.current_status] = (stats[job.current_status] || 0) + 1;
  }
  return stats;
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

  const store = readJsonStore();
  if (store.organizations.length > 0) {
    return store.organizations;
  }

  const orgs = new Map();
  for (const installation of store.installations) {
    if (installation.account_login) {
      orgs.set(installation.account_login, {
        login: installation.account_login,
        type: installation.account_type || 'Organization',
      });
    }
  }
  return Array.from(orgs.values());
}

module.exports = {
  // Events
  isDuplicateDelivery,
  saveEvent,
  updateEventStatus,
  listEvents,
  getEvent,
  // Jobs
  upsertJob,
  normalizeJobFromWebhook,
  listJobs,
  getJob,
  listAttempts,
  listAdminActions,
  listAlertRules,
  upsertAlertRule,
  deleteAlertRule,
  listNotificationDestinations,
  upsertNotificationDestination,
  deleteNotificationDestination,
  recordAlertDelivery,
  listAlertDeliveries,
  getStats,
  // Installations / repositories / organizations
  getInstallation,
  listRepositories,
  listInstallationRepositories,
  listInstallationJobs,
  listInstallationEvents,
  listOrganizations,
  // Admin audit
  recordAdminAction,
  // JSON helpers for installation handlers
  upsertInstallationRecord,
  removeOrSuspendInstallationRecord,
  upsertRepositoryRecord,
  deactivateRepositoryRecord,
  // Helpers (exported for testing)
  inferStatusFromLabels,
  extractLinkedIssueNumber,
};






