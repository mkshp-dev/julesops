const crypto = require('crypto');
const fs = require('fs');
const http = require('http');
const path = require('path');
const { URL } = require('url');

const PORT = Number(process.env.PORT || 3000);
const HOST = process.env.HOST || '127.0.0.1';
const DATA_DIR = process.env.JULESOPS_DATA_DIR || path.join(__dirname, '..', 'data');
const STORE_PATH = path.join(DATA_DIR, 'store.json');
const WEBHOOK_SECRET = process.env.GITHUB_WEBHOOK_SECRET || '';

const startedAt = new Date();
let webhookReceivedTotal = 0;
let webhookFailedTotal = 0;

function ensureStore() {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  if (!fs.existsSync(STORE_PATH)) {
    fs.writeFileSync(STORE_PATH, JSON.stringify({ organizations: [], repositories: [], jobs: [], events: [] }, null, 2));
  }
}

function readStore() {
  ensureStore();
  return JSON.parse(fs.readFileSync(STORE_PATH, 'utf8'));
}

function writeStore(store) {
  ensureStore();
  fs.writeFileSync(STORE_PATH, JSON.stringify(store, null, 2));
}

function sendJson(res, statusCode, payload) {
  const body = JSON.stringify(payload, null, 2);
  res.writeHead(statusCode, {
    'content-type': 'application/json; charset=utf-8',
    'cache-control': 'no-store',
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

function timingSafeEqualHex(left, right) {
  const leftBuffer = Buffer.from(left, 'hex');
  const rightBuffer = Buffer.from(right, 'hex');
  if (leftBuffer.length !== rightBuffer.length) {
    return false;
  }
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

function normalizeJobFromWebhook(eventName, payload) {
  const repo = payload.repository && payload.repository.full_name;
  if (!repo) {
    return null;
  }

  if (eventName === 'issues' && payload.issue) {
    return {
      repository: repo,
      issue_number: payload.issue.number,
      issue_title: payload.issue.title || '',
      current_status: inferStatusFromLabels(payload.issue.labels || []),
      updated_at: new Date().toISOString(),
    };
  }

  if (eventName === 'pull_request' && payload.pull_request) {
    const issueNumber = extractLinkedIssueNumber(payload.pull_request.body || '');
    if (!issueNumber) {
      return null;
    }
    return {
      repository: repo,
      issue_number: issueNumber,
      issue_title: `Linked PR #${payload.pull_request.number}`,
      current_status: payload.action === 'closed' && payload.pull_request.merged ? 'done' : 'review',
      pr_number: payload.pull_request.number,
      branch_name: payload.pull_request.head && payload.pull_request.head.ref,
      updated_at: new Date().toISOString(),
    };
  }

  return null;
}

function inferStatusFromLabels(labels) {
  const names = labels.map((label) => typeof label === 'string' ? label : label.name).filter(Boolean);
  const status = names.find((name) => name.startsWith('status:'));
  if (!status) {
    return 'todo';
  }
  return status.replace('status:', '');
}

function extractLinkedIssueNumber(text) {
  const match = text.match(/\b(?:close[sd]?|fix(?:e[sd])?|resolve[sd]?)\s+#(\d+)/i);
  return match ? Number(match[1]) : null;
}

function upsertJob(store, partialJob) {
  if (!partialJob || !partialJob.repository || !partialJob.issue_number) {
    return;
  }

  const existing = store.jobs.find((job) => job.repository === partialJob.repository && job.issue_number === partialJob.issue_number);
  if (existing) {
    Object.assign(existing, partialJob);
    return;
  }

  store.jobs.push({
    id: crypto.randomUUID(),
    attempt_number: 1,
    pr_number: null,
    branch_name: null,
    ...partialJob,
  });
}

function filterJobs(jobs, query) {
  return jobs.filter((job) => {
    if (query.status && job.current_status !== query.status) {
      return false;
    }
    if (query.repository && job.repository !== query.repository) {
      return false;
    }
    if (query.organization && !job.repository.startsWith(`${query.organization}/`)) {
      return false;
    }
    return true;
  });
}

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
  } catch (error) {
    webhookFailedTotal += 1;
    sendJson(res, 400, { ok: false, error: 'invalid json payload' });
    return;
  }

  const eventName = req.headers['x-github-event'] || 'unknown';
  const deliveryId = req.headers['x-github-delivery'] || crypto.randomUUID();
  const store = readStore();
  const eventRecord = {
    id: deliveryId,
    event_type: eventName,
    action: payload.action || null,
    repository: payload.repository ? payload.repository.full_name : null,
    received_at: new Date().toISOString(),
    signature: verification.mode,
  };

  store.events.unshift(eventRecord);
  store.events = store.events.slice(0, 500);

  upsertJob(store, normalizeJobFromWebhook(eventName, payload));
  writeStore(store);
  webhookReceivedTotal += 1;

  sendJson(res, 202, { ok: true, event: eventRecord });
}

function metricsText() {
  const store = readStore();
  const activeJobs = store.jobs.filter((job) => ['todo', 'in-progress', 'review', 'blocked'].includes(job.current_status)).length;
  return [
    '# HELP julesops_webhook_received_total Total webhooks accepted by the JulesOps server.',
    '# TYPE julesops_webhook_received_total counter',
    `julesops_webhook_received_total ${webhookReceivedTotal}`,
    '# HELP julesops_webhook_failed_total Total webhook requests rejected or failed by the JulesOps server.',
    '# TYPE julesops_webhook_failed_total counter',
    `julesops_webhook_failed_total ${webhookFailedTotal}`,
    '# HELP julesops_jobs_active_total Current active jobs in the local store.',
    '# TYPE julesops_jobs_active_total gauge',
    `julesops_jobs_active_total ${activeJobs}`,
    '',
  ].join('\n');
}

async function handleRequest(req, res) {
  const url = new URL(req.url, `http://${req.headers.host || `${HOST}:${PORT}`}`);

  try {
    if (req.method === 'GET' && url.pathname === '/health') {
      sendJson(res, 200, { ok: true, service: 'julesops-server', uptime_seconds: Math.floor((Date.now() - startedAt.getTime()) / 1000) });
      return;
    }

    if (req.method === 'GET' && url.pathname === '/health/db') {
      readStore();
      sendJson(res, 200, { ok: true, storage: 'json-file', path: STORE_PATH });
      return;
    }

    if (req.method === 'GET' && url.pathname === '/health/github') {
      sendJson(res, 200, { ok: true, mode: 'not-configured', note: 'GitHub API client is not implemented in this skeleton yet.' });
      return;
    }

    if (req.method === 'GET' && url.pathname === '/health/stripe') {
      sendJson(res, 200, { ok: true, mode: 'not-configured', note: 'Stripe billing is not implemented in this skeleton yet.' });
      return;
    }

    if (req.method === 'GET' && url.pathname === '/metrics') {
      sendText(res, 200, metricsText());
      return;
    }

    if (req.method === 'GET' && url.pathname === '/api/jobs') {
      const store = readStore();
      sendJson(res, 200, { jobs: filterJobs(store.jobs, Object.fromEntries(url.searchParams)) });
      return;
    }

    if (req.method === 'GET' && url.pathname === '/api/repositories') {
      sendJson(res, 200, { repositories: readStore().repositories });
      return;
    }

    if (req.method === 'GET' && url.pathname === '/api/organizations') {
      sendJson(res, 200, { organizations: readStore().organizations });
      return;
    }

    if (req.method === 'POST' && url.pathname === '/api/webhooks') {
      await handleWebhook(req, res);
      return;
    }

    sendJson(res, 404, { ok: false, error: 'not found' });
  } catch (error) {
    sendJson(res, 500, { ok: false, error: error.message });
  }
}

function createServer() {
  ensureStore();
  return http.createServer((req, res) => {
    handleRequest(req, res);
  });
}

if (require.main === module) {
  createServer().listen(PORT, HOST, () => {
    console.log(`JulesOps server listening at http://${HOST}:${PORT}`);
  });
}

module.exports = { createServer, verifyGitHubSignature, extractLinkedIssueNumber };