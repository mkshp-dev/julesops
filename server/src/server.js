'use strict';

const crypto = require('crypto');
const http = require('http');
const { URL } = require('url');

const db = require('./db');
const store = require('./store');

const PORT = Number(process.env.PORT || 3000);
const HOST = process.env.HOST || '127.0.0.1';
const WEBHOOK_SECRET = process.env.GITHUB_WEBHOOK_SECRET || '';

const startedAt = new Date();
let webhookReceivedTotal = 0;
let webhookFailedTotal = 0;

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

  // Idempotency: reject duplicate deliveries
  if (await store.isDuplicateDelivery(deliveryId)) {
    sendJson(res, 202, { ok: true, note: 'duplicate delivery ignored' });
    return;
  }

  const repository = payload.repository ? payload.repository.full_name : null;
  const installationId = payload.installation ? payload.installation.id : null;

  // Persist event record
  const eventRecord = await store.saveEvent({
    deliveryId,
    eventType: eventName,
    action: payload.action || null,
    installationId,
    repository,
    rawPayload: payload,
    signatureMode: verification.mode,
  });

  // Normalise and upsert job state
  const partialJob = store.normalizeJobFromWebhook(eventName, payload);
  let jobError = null;
  try {
    await store.upsertJob(partialJob);
  } catch (err) {
    jobError = err.message;
  }

  await store.updateEventStatus(deliveryId, jobError ? 'failed' : 'processed', jobError);

  webhookReceivedTotal += 1;
  sendJson(res, 202, { ok: true, event: eventRecord });
}

// ─── Prometheus metrics ───────────────────────────────────────────────────────

async function metricsText() {
  const stats = await store.getStats();
  const activeJobs = ['todo', 'in-progress', 'review', 'blocked'].reduce(
    (sum, s) => sum + (stats[s] || 0),
    0,
  );
  const failedJobs = stats['failed'] || 0;

  return [
    '# HELP julesops_webhook_received_total Total webhooks accepted by the JulesOps server.',
    '# TYPE julesops_webhook_received_total counter',
    `julesops_webhook_received_total ${webhookReceivedTotal}`,
    '# HELP julesops_webhook_failed_total Total webhook requests rejected or failed.',
    '# TYPE julesops_webhook_failed_total counter',
    `julesops_webhook_failed_total ${webhookFailedTotal}`,
    '# HELP julesops_jobs_active_total Current active jobs.',
    '# TYPE julesops_jobs_active_total gauge',
    `julesops_jobs_active_total ${activeJobs}`,
    '# HELP julesops_jobs_failed_total Current failed jobs.',
    '# TYPE julesops_jobs_failed_total gauge',
    `julesops_jobs_failed_total ${failedJobs}`,
    '',
  ].join('\n');
}

// ─── Request router ───────────────────────────────────────────────────────────

async function handleRequest(req, res) {
  const url = new URL(req.url, `http://${req.headers.host || `${HOST}:${PORT}`}`);
  const { pathname } = url;

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
      sendText(res, 200, await metricsText());
      return;
    }

    // ── API endpoints ──────────────────────────────────────────────────────

    if (req.method === 'GET' && pathname === '/api/jobs') {
      const filters = Object.fromEntries(url.searchParams);
      const jobs = await store.listJobs(filters);
      sendJson(res, 200, { jobs });
      return;
    }

    if (req.method === 'GET' && pathname.startsWith('/api/jobs/')) {
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
      const attempts = await store.listAttempts(id);
      sendJson(res, 200, { job, attempts });
      return;
    }

    if (req.method === 'GET' && pathname === '/api/attempts') {
      const jobId = url.searchParams.get('job_id');
      if (!jobId) {
        sendJson(res, 400, { ok: false, error: 'job_id query param required' });
        return;
      }
      const attempts = await store.listAttempts(jobId);
      sendJson(res, 200, { attempts });
      return;
    }

    if (req.method === 'GET' && pathname === '/api/repositories') {
      const repos = await store.listRepositories();
      sendJson(res, 200, { repositories: repos });
      return;
    }

    if (req.method === 'GET' && pathname === '/api/organizations') {
      const orgs = await store.listOrganizations();
      sendJson(res, 200, { organizations: orgs });
      return;
    }

    if (req.method === 'GET' && pathname === '/api/events') {
      const limit = url.searchParams.get('limit');
      const events = await store.listEvents({ limit });
      sendJson(res, 200, { events });
      return;
    }

    if (req.method === 'GET' && pathname === '/api/stats') {
      const stats = await store.getStats();
      sendJson(res, 200, { stats });
      return;
    }

    // ── Webhook ingestion ──────────────────────────────────────────────────

    if (req.method === 'POST' && pathname === '/api/webhooks') {
      await handleWebhook(req, res);
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
  createServer().listen(PORT, HOST, () => {
    const storage = db.getPool() ? 'postgres' : 'json-file (demo mode)';
    console.log(`JulesOps server listening at http://${HOST}:${PORT} [storage: ${storage}]`);
  });
}

module.exports = { createServer, verifyGitHubSignature };