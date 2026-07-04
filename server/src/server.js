'use strict';

const crypto = require('crypto');
const fs = require('fs');
const http = require('http');
const path = require('path');
const { URL } = require('url');

const db = require('./db');
const store = require('./store');
const { processWebhookPayload } = require('./webhook-processor');
const { handleAdminRequest } = require('./admin');
const { requireRole, getAccessibleInstallationIds } = require('./rbac');
const { sessionMiddleware } = require('./session');
const { handleOAuthStart, handleOAuthCallback, handleLogout } = require('./oauth');
const { handleCheckout, handleStripeWebhook, handleBillingPortal } = require('./billing');
const { startAlertWorker } = require('./alerts');
const { recordWebhookProcessing, renderMetricsText } = require('./metrics');

const PORT = Number(process.env.PORT || 3000);
const HOST = process.env.HOST || '127.0.0.1';
const WEBHOOK_SECRET = process.env.GITHUB_WEBHOOK_SECRET || '';

const startedAt = new Date();
let webhookReceivedTotal = 0;
let webhookFailedTotal = 0;

const DASHBOARD_DIR = path.join(__dirname, '..', '..', 'dashboard');
const DASHBOARD_HTML_PATH = path.join(DASHBOARD_DIR, 'index.html');
const DASHBOARD_CSS_PATH = path.join(DASHBOARD_DIR, 'style.css');
const AUTH_REQUIRED = process.env.NODE_ENV === 'production';

function readAsset(assetPath) {
  return fs.readFileSync(assetPath, 'utf8');
}

function serveDashboard(res) {
  sendText(res, 200, readAsset(DASHBOARD_HTML_PATH), 'text/html; charset=utf-8');
}

function serveDashboardCss(res) {
  sendText(res, 200, readAsset(DASHBOARD_CSS_PATH), 'text/css; charset=utf-8');
}

function requireHostedSession(req, res) {
  if (!AUTH_REQUIRED) return true;
  if (req.session) return true;
  sendJson(res, 401, { ok: false, error: 'authentication required' });
  return false;
}

async function getAccessibleInstallationsForRequest(req) {
  if (!AUTH_REQUIRED) return null;
  if (!req.session) return [];
  return getAccessibleInstallationIds(String(req.session.githubId), 'viewer') || [];
}

async function requireBillingAdmin(req, res, installationId) {
  if (!AUTH_REQUIRED) return true;
  if (!req.session) {
    sendJson(res, 401, { ok: false, error: 'authentication required' });
    return false;
  }
  if (!installationId) {
    const installations = await getAccessibleInstallationIds(String(req.session.githubId), 'admin');
    if (!installations || installations.length === 0) {
      sendJson(res, 403, { ok: false, error: 'insufficient permissions (required: admin)' });
      return false;
    }
    return true;
  }
  req.installationId = installationId;
  return requireRole('admin')(req, res);
}

// ─── HTTP helpers ─────────────────────────────────────────────────────────────

function sendJson(res, statusCode, payload) {
  const body = JSON.stringify(payload, null, 2);
  res.writeHead(statusCode, {
    'content-type': 'application/json; charset=utf-8',
    'cache-control': 'no-store',
    'access-control-allow-origin': process.env.CORS_ORIGIN || '*',
  });
  res.end(body);
}

function sendText(res, statusCode, body, contentType = 'text/plain; charset=utf-8') {
  res.writeHead(statusCode, { 'content-type': contentType, 'cache-control': 'no-store' });
  res.end(body);
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on('data', (chunk) => chunks.push(chunk));
    req.on('end', () => resolve(Buffer.concat(chunks)));
    req.on('error', reject);
  });
}

// ─── Webhook signature verification ──────────────────────────────────────────

function timingSafeEqualHex(left, right) {
  const leftBuffer = Buffer.from(left, 'hex');
  const rightBuffer = Buffer.from(right, 'hex');
  if (leftBuffer.length !== rightBuffer.length) return false;
  return crypto.timingSafeEqual(leftBuffer, rightBuffer);
}

function verifyGitHubSignature(rawBody, signatureHeader) {
  if (!WEBHOOK_SECRET) {
    return { ok: true, mode: 'disabled' };
  }
  if (!signatureHeader || !signatureHeader.startsWith('sha256=')) {
    return { ok: false, reason: 'missing sha256 signature' };
  }
  const expected = crypto.createHmac('sha256', WEBHOOK_SECRET).update(rawBody).digest('hex');
  const actual = signatureHeader.slice('sha256='.length);
  if (!timingSafeEqualHex(expected, actual)) {
    return { ok: false, reason: 'invalid signature' };
  }
  return { ok: true, mode: 'verified' };
}

// ─── Webhook handler ──────────────────────────────────────────────────────────

async function handleWebhook(req, res) {
  const startedAtMs = Date.now();
  let ok = false;

  try {
    const rawBody = await readBody(req);
    const verification = verifyGitHubSignature(rawBody, req.headers['x-hub-signature-256']);

    if (!verification.ok) {
      webhookFailedTotal += 1;
      sendJson(res, 401, { ok: false, error: verification.reason });
      return;
    }

    let payload;
    try {
      payload = rawBody.length ? JSON.parse(rawBody.toString('utf8')) : {};
    } catch {
      webhookFailedTotal += 1;
      sendJson(res, 400, { ok: false, error: 'invalid json payload' });
      return;
    }

    const eventName = req.headers['x-github-event'] || 'unknown';
    const deliveryId = req.headers['x-github-delivery'] || crypto.randomUUID();

    if (await store.isDuplicateDelivery(deliveryId)) {
      ok = true;
      sendJson(res, 202, { ok: true, note: 'duplicate delivery ignored' });
      return;
    }

    const result = await processWebhookPayload({
      eventName,
      payload,
      deliveryId,
      signatureMode: verification.mode,
      recordEvent: true,
    });

    webhookReceivedTotal += 1;
    if (!result.ok) {
      webhookFailedTotal += 1;
    }

    ok = true;
    sendJson(res, 202, { ok: true, event: result.event, handler: result.handler, error: result.error || null });
  } finally {
    recordWebhookProcessing(Date.now() - startedAtMs, ok);
  }
}

// ─── Prometheus metrics ───────────────────────────────────────────────────────

async function metricsText() {
  const [stats, rules, destinations, deliveries, dbHealthy] = await Promise.all([
    store.getStats(),
    store.listAlertRules({ limit: 500 }),
    store.listNotificationDestinations({ limit: 500 }),
    store.listAlertDeliveries({ limit: 500 }),
    db.getPool() ? db.isHealthy() : Promise.resolve(null),
  ]);

  const activeJobs = ['todo', 'in-progress', 'review', 'blocked'].reduce(
    (sum, s) => sum + (stats[s] || 0),
    0,
  );
  const failedJobs = stats['failed'] || 0;

  return renderMetricsText({
    activeJobs,
    failedJobs,
    dbHealthy,
    alertRules: rules.length,
    alertDestinations: destinations.length,
    alertDeliveries: deliveries.length,
    alertWorkerEnabled: process.env.ALERT_WORKER_ENABLED !== 'false',
    uptimeSeconds: (Date.now() - startedAt.getTime()) / 1000,
  });
}

// ─── Request router ───────────────────────────────────────────────────────────

async function handleRequest(req, res) {
  const url = new URL(req.url, `http://${req.headers.host || `${HOST}:${PORT}`}`);
  const { pathname } = url;

  // Run session middleware on every request
  sessionMiddleware(req, res);

  // CORS preflight
  if (req.method === 'OPTIONS') {
    res.writeHead(204, {
      'access-control-allow-origin': process.env.CORS_ORIGIN || '*',
      'access-control-allow-methods': 'GET, POST, OPTIONS',
      'access-control-allow-headers': 'content-type, x-hub-signature-256, x-github-event, x-github-delivery',
    });
    res.end();
    return;
  }

  try {
    // ── Auth routes ────────────────────────────────────────────────────────

    if (req.method === 'GET' && pathname === '/auth/github') {
      handleOAuthStart(req, res);
      return;
    }

    if (req.method === 'GET' && pathname === '/auth/github/callback') {
      await handleOAuthCallback(req, res);
      return;
    }

    if (req.method === 'GET' && pathname === '/auth/logout') {
      handleLogout(req, res);
      return;
    }

    if (req.method === 'GET' && (pathname === '/dashboard' || pathname === '/dashboard/')) {
      if (AUTH_REQUIRED && !req.session) {
        res.writeHead(302, { location: '/auth/github?redirect_to=/dashboard' });
        res.end();
        return;
      }
      serveDashboard(res);
      return;
    }

    if (req.method === 'GET' && pathname === '/dashboard/style.css') {
      serveDashboardCss(res);
      return;
    }

    if (req.method === 'GET' && pathname === '/api/me') {
      if (!req.session) {
        sendJson(res, 401, { ok: false, error: 'not authenticated' });
        return;
      }
      sendJson(res, 200, {
        ok: true,
        user: {
          githubId: req.session.githubId,
          login: req.session.githubLogin,
          name: req.session.githubName,
          avatarUrl: req.session.githubAvatarUrl,
        },
      });
      return;
    }

    // ── Health endpoints ───────────────────────────────────────────────────

    if (req.method === 'GET' && pathname === '/health') {
      sendJson(res, 200, {
        ok: true,
        service: 'julesops-server',
        uptime_seconds: Math.floor((Date.now() - startedAt.getTime()) / 1000),
        storage: db.getPool() ? 'postgres' : 'json-file',
      });
      return;
    }

    if (req.method === 'GET' && pathname === '/health/db') {
      const healthy = await db.isHealthy();
      if (db.getPool()) {
        sendJson(res, healthy ? 200 : 503, { ok: healthy, storage: 'postgres' });
      } else {
        sendJson(res, 200, { ok: true, storage: 'json-file' });
      }
      return;
    }

    if (req.method === 'GET' && pathname === '/health/github') {
      sendJson(res, 200, {
        ok: true,
        mode: process.env.GITHUB_APP_ID ? 'configured' : 'not-configured',
        note: process.env.GITHUB_APP_ID
          ? 'GitHub App credentials present.'
          : 'GitHub App module not yet active — set GITHUB_APP_ID.',
      });
      return;
    }

    if (req.method === 'GET' && pathname === '/ready') {
      const healthy = await db.isHealthy();
      sendJson(res, healthy ? 200 : 503, {
        ok: healthy,
        ready: healthy,
        storage: db.getPool() ? 'postgres' : 'json-file',
        alert_worker_enabled: process.env.ALERT_WORKER_ENABLED !== 'false',
      });
      return;
    }

    if (req.method === 'GET' && pathname === '/health/alerts') {
      const [rules, destinations, deliveries] = await Promise.all([
        store.listAlertRules({ limit: 500 }),
        store.listNotificationDestinations({ limit: 500 }),
        store.listAlertDeliveries({ limit: 500 }),
      ]);
      sendJson(res, 200, {
        ok: true,
        alert_worker_enabled: process.env.ALERT_WORKER_ENABLED !== 'false',
        alert_rules: rules.length,
        notification_destinations: destinations.length,
        alert_deliveries: deliveries.length,
      });
      return;
    }

    if (req.method === 'GET' && pathname === '/health/stripe') {
      sendJson(res, 200, {
        ok: true,
        mode: process.env.STRIPE_SECRET_KEY ? 'configured' : 'not-configured',
        note: process.env.STRIPE_SECRET_KEY
          ? 'Stripe credentials present.'
          : 'Stripe billing not yet active — set STRIPE_SECRET_KEY.',
      });
      return;
    }

    // ── Metrics ────────────────────────────────────────────────────────────

    if (req.method === 'GET' && pathname === '/metrics') {
      sendText(res, 200, await metricsText(), 'text/plain; version=0.0.4; charset=utf-8');
      return;
    }

    // ── Admin endpoints ───────────────────────────────────────────────────

    if (await handleAdminRequest(req, res, url)) {
      return;
    }

    // ── API endpoints ──────────────────────────────────────────────────────

    if (req.method === 'GET' && pathname === '/api/jobs') {
      if (!requireHostedSession(req, res)) return;
      const filters = Object.fromEntries(url.searchParams);
      const installationIds = await getAccessibleInstallationsForRequest(req);
      let jobs = [];
      if (installationIds === null) {
        jobs = await store.listJobs(filters);
      } else {
        for (const installationId of installationIds) {
          const rows = await store.listJobs({ ...filters, installationId });
          jobs.push(...rows);
        }
      }
      const deduped = Array.from(new Map(jobs.map((job) => [job.id, job])).values());
      sendJson(res, 200, { jobs: deduped });
      return;
    }

    if (req.method === 'GET' && pathname.startsWith('/api/jobs/')) {
      if (!requireHostedSession(req, res)) return;
      const id = pathname.slice('/api/jobs/'.length);
      if (!id) {
        sendJson(res, 400, { ok: false, error: 'missing job id' });
        return;
      }
      const job = await store.getJob(id);
      if (!job) {
        sendJson(res, 404, { ok: false, error: 'job not found' });
        return;
      }
      const installationIds = await getAccessibleInstallationsForRequest(req);
      if (installationIds !== null) {
        if (installationIds.length === 0) {
          sendJson(res, 403, { ok: false, error: 'forbidden' });
          return;
        }
        const allowed = new Set();
        for (const installationId of installationIds) {
          const repos = await store.listRepositories({ installationId });
          for (const r of repos) allowed.add(r.full_name);
        }
        if (!allowed.has(job.repository)) {
          sendJson(res, 403, { ok: false, error: 'forbidden' });
          return;
        }
      }
      const attempts = await store.listAttempts(id);
      sendJson(res, 200, { job, attempts });
      return;
    }

    if (req.method === 'GET' && pathname === '/api/attempts') {
      if (!requireHostedSession(req, res)) return;
      const jobId = url.searchParams.get('job_id');
      if (!jobId) {
        sendJson(res, 400, { ok: false, error: 'job_id query param required' });
        return;
      }
      const job = await store.getJob(jobId);
      if (!job) {
        sendJson(res, 404, { ok: false, error: 'job not found' });
        return;
      }
      const installationIds = await getAccessibleInstallationsForRequest(req);
      if (installationIds !== null) {
        if (installationIds.length === 0) {
          sendJson(res, 403, { ok: false, error: 'forbidden' });
          return;
        }
        const allowed = new Set();
        for (const installationId of installationIds) {
          const repos = await store.listRepositories({ installationId });
          for (const r of repos) allowed.add(r.full_name);
        }
        if (!allowed.has(job.repository)) {
          sendJson(res, 403, { ok: false, error: 'forbidden' });
          return;
        }
      }
      const attempts = await store.listAttempts(jobId);
      sendJson(res, 200, { attempts });
      return;
    }

    if (req.method === 'GET' && pathname === '/api/repositories') {
      if (!requireHostedSession(req, res)) return;
      const installationIds = await getAccessibleInstallationsForRequest(req);
      let repos = [];
      if (installationIds === null) {
        repos = await store.listRepositories();
      } else {
        for (const installationId of installationIds) {
          const rows = await store.listRepositories({ installationId });
          repos.push(...rows);
        }
      }
      const deduped = Array.from(new Map(repos.map((repo) => [repo.id, repo])).values());
      sendJson(res, 200, { repositories: deduped });
      return;
    }

    if (req.method === 'GET' && pathname === '/api/organizations') {
      if (!requireHostedSession(req, res)) return;
      const installationIds = await getAccessibleInstallationsForRequest(req);
      if (installationIds === null) {
        const orgs = await store.listOrganizations();
        sendJson(res, 200, { organizations: orgs });
        return;
      }
      const seen = new Map();
      for (const installationId of installationIds) {
        const installation = await store.getInstallation(installationId);
        if (installation && installation.account_login) {
          seen.set(installation.account_login, { login: installation.account_login, type: installation.account_type || 'Organization' });
        }
      }
      sendJson(res, 200, { organizations: Array.from(seen.values()) });
      return;
    }

    if (req.method === 'GET' && pathname === '/api/events') {
      if (!requireHostedSession(req, res)) return;
      const limit = url.searchParams.get('limit');
      const installationIds = await getAccessibleInstallationsForRequest(req);
      let events = [];
      if (installationIds === null) {
        events = await store.listEvents({ limit });
      } else {
        const byId = new Map();
        for (const installationId of installationIds) {
          const rows = await store.listInstallationEvents(installationId, { limit });
          for (const event of rows) {
            byId.set(event.id || event.delivery_id, event);
          }
        }
        events = Array.from(byId.values());
      }
      sendJson(res, 200, { events });
      return;
    }

    if (req.method === 'GET' && pathname === '/api/stats') {
      if (!requireHostedSession(req, res)) return;
      const installationIds = await getAccessibleInstallationsForRequest(req);
      if (installationIds === null) {
        const stats = await store.getStats();
        sendJson(res, 200, { stats });
        return;
      }
      const jobs = [];
      for (const installationId of installationIds) {
        const rows = await store.listJobs({ installationId });
        jobs.push(...rows);
      }
      const stats = { total: jobs.length };
      for (const job of jobs) {
        stats[job.current_status] = (stats[job.current_status] || 0) + 1;
      }
      sendJson(res, 200, { stats });
      return;
    }

    // ── Webhook ingestion ──────────────────────────────────────────────────

    if (req.method === 'POST' && pathname === '/api/webhooks') {
      await handleWebhook(req, res);
      return;
    }

    // ── Billing routes ────────────────────────────────────────────────

    if (req.method === 'POST' && pathname === '/billing/checkout') {
      if (!requireHostedSession(req, res)) return;
      const rawBody = await readBody(req);
      let parsedBody = {};
      try { parsedBody = rawBody.length ? JSON.parse(rawBody.toString('utf8')) : {}; } catch {}
      const installationId = Number(parsedBody.installation_id || 0);
      if (AUTH_REQUIRED && !(await requireBillingAdmin(req, res, installationId))) return;
      await handleCheckout(req, res, rawBody);
      return;
    }

    if (req.method === 'POST' && pathname === '/billing/webhook') {
      const rawBody = await readBody(req);
      await handleStripeWebhook(req, res, rawBody);
      return;
    }

    if (req.method === 'GET' && pathname === '/billing/portal') {
      if (!requireHostedSession(req, res)) return;
      if (AUTH_REQUIRED && !(await requireBillingAdmin(req, res, null))) return;
      await handleBillingPortal(req, res);
      return;
    }

    sendJson(res, 404, { ok: false, error: 'not found' });
  } catch (error) {
    console.error('[server] Unhandled error:', error);
    sendJson(res, 500, { ok: false, error: error.message });
  }
}

// ─── Server factory ───────────────────────────────────────────────────────────

function createServer() {
  return http.createServer((req, res) => {
    handleRequest(req, res);
  });
}

if (require.main === module) {
  if (process.env.ALERT_WORKER_ENABLED !== 'false') {
    startAlertWorker();
  }
  createServer().listen(PORT, HOST, () => {
    const storage = db.getPool() ? 'postgres' : 'json-file (demo mode)';
    console.log(`JulesOps server listening at http://${HOST}:${PORT} [storage: ${storage}]`);
  });
}

module.exports = { createServer, verifyGitHubSignature };