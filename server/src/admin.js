'use strict';

const crypto = require('crypto');

const store = require('./store');
const { processWebhookPayload } = require('./webhook-processor');
const { requireRole } = require('./rbac');

function sendJson(res, statusCode, payload) {
  const body = JSON.stringify(payload, null, 2);
  res.writeHead(statusCode, {
    'content-type': 'application/json; charset=utf-8',
    'cache-control': 'no-store',
  });
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

function parsePositiveInteger(value, fallback = null) {
  if (value == null || value === '') return fallback;
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) return fallback;
  return Math.floor(parsed);
}

function parseSinceFilter(value) {
  if (!value) return null;
  if (/^\d+$/.test(value)) {
    return Number(value) * 60 * 60 * 1000;
  }

  const match = /^([0-9]+)([smhd])$/i.exec(value.trim());
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

async function ensureInstallationAdmin(req, res, installationId) {
  req.installationId = installationId;
  return requireRole('admin')(req, res);
}

async function getInstallationOverview(installationId, options = {}) {
  const [installation, repositories, jobs, failedEvents] = await Promise.all([
    store.getInstallation(installationId),
    store.listInstallationRepositories(installationId),
    store.listInstallationJobs(installationId, options.jobFilters || {}),
    store.listInstallationEvents(installationId, {
      status: 'failed',
      limit: options.failedEventLimit || 20,
    }),
  ]);

  if (!installation) {
    return null;
  }

  return {
    installation,
    repositories,
    jobs,
    failed_events: failedEvents,
    counts: {
      repositories: repositories.length,
      jobs: jobs.length,
      failed_events: failedEvents.length,
    },
  };
}

async function readJsonRequest(req) {
  const raw = await readBody(req);
  if (!raw.length) return {};
  try {
    return JSON.parse(raw.toString('utf8'));
  } catch {
    return null;
  }
}

async function findAlertRule(id) {
  const rules = await store.listAlertRules({ limit: 500 });
  return rules.find((rule) => String(rule.id) === String(id)) || null;
}

async function findNotificationDestination(id) {
  const destinations = await store.listNotificationDestinations({ limit: 500 });
  return destinations.find((dest) => String(dest.id) === String(id)) || null;
}
async function replayEvent(req, res, eventId) {
  const event = await store.getEvent(eventId);
  if (!event) {
    sendJson(res, 404, { ok: false, error: 'event not found' });
    return;
  }

  const installationId = Number(event.installation_id || event.installationId || 0);
  if (!installationId) {
    sendJson(res, 400, { ok: false, error: 'event is not attached to an installation' });
    return;
  }

  if (!(await ensureInstallationAdmin(req, res, installationId))) {
    return;
  }

  let rawPayload = event.raw_payload;
  if (!rawPayload) {
    sendJson(res, 409, { ok: false, error: 'original webhook payload is not available for replay' });
    return;
  }

  if (typeof rawPayload === 'string') {
    try {
      rawPayload = JSON.parse(rawPayload);
    } catch {
      sendJson(res, 500, { ok: false, error: 'stored webhook payload is invalid JSON' });
      return;
    }
  }

  const replayDeliveryId = `replay-${event.delivery_id || event.id}-${Date.now()}-${crypto.randomUUID().slice(0, 8)}`;
  const result = await processWebhookPayload({
    eventName: event.event_type,
    payload: rawPayload,
    deliveryId: replayDeliveryId,
    signatureMode: 'admin-replay',
    recordEvent: false,
  });

  const auditEntry = await store.recordAdminAction({
    actorGithubId: req.session ? req.session.githubId : null,
    actorLogin: req.session ? req.session.githubLogin : null,
    installationId,
    action: 'replay_event',
    targetType: 'event',
    targetId: String(event.id || event.delivery_id || eventId),
    status: result.ok ? 'ok' : 'failed',
    metadata: {
      original_event_id: event.id || null,
      original_delivery_id: event.delivery_id || null,
      replay_delivery_id: replayDeliveryId,
      event_type: event.event_type,
      replay_result: {
        ok: result.ok,
        error: result.error || null,
        handler: result.handler || null,
      },
    },
  });

  sendJson(res, result.ok ? 200 : 502, {
    ok: result.ok,
    event,
    replay: {
      delivery_id: replayDeliveryId,
      result,
    },
    audit: auditEntry,
  });
}

async function handleAdminRequest(req, res, url) {
  const pathname = url.pathname;

  if (pathname === '/admin/alert-config' && req.method === 'GET') {
    const installationId = Number(url.searchParams.get('installation_id') || 0);
    if (!installationId) {
      sendJson(res, 400, { ok: false, error: 'installation_id query param required' });
      return true;
    }
    if (!(await ensureInstallationAdmin(req, res, installationId))) {
      return true;
    }

    const [rules, destinations, deliveries] = await Promise.all([
      store.listAlertRules({ installationId }),
      store.listNotificationDestinations({ installationId }),
      store.listAlertDeliveries({ installationId, limit: 100 }),
    ]);

    sendJson(res, 200, {
      ok: true,
      installation_id: installationId,
      worker_enabled: process.env.ALERT_WORKER_ENABLED !== 'false',
      alert_rules: rules,
      notification_destinations: destinations,
      alert_deliveries: deliveries,
    });
    return true;
  }

  if (pathname === '/admin/alert-config/rules' && req.method === 'POST') {
    const body = await readJsonRequest(req);
    if (!body) {
      sendJson(res, 400, { ok: false, error: 'invalid JSON body' });
      return true;
    }
    if (!body.installation_id || !body.rule_type) {
      sendJson(res, 400, { ok: false, error: 'installation_id and rule_type are required' });
      return true;
    }
    if (!(await ensureInstallationAdmin(req, res, body.installation_id))) {
      return true;
    }
    const rule = await store.upsertAlertRule(body);
    sendJson(res, 200, { ok: true, rule });
    return true;
  }

  const ruleDeleteMatch = pathname.match(/^\/admin\/alert-config\/rules\/([^/]+)$/);
  if (pathname === '/admin/alert-config/rules' && req.method === 'DELETE') {
    sendJson(res, 405, { ok: false, error: 'rule id must be provided in the path' });
    return true;
  }
  if (req.method === 'DELETE' && ruleDeleteMatch) {
    const rule = await findAlertRule(ruleDeleteMatch[1]);
    if (!rule) {
      sendJson(res, 404, { ok: false, error: 'alert rule not found' });
      return true;
    }
    if (!(await ensureInstallationAdmin(req, res, rule.installation_id))) {
      return true;
    }
    await store.deleteAlertRule(rule.id);
    sendJson(res, 200, { ok: true, deleted: true, id: rule.id });
    return true;
  }

  if (pathname === '/admin/alert-config/destinations' && req.method === 'POST') {
    const body = await readJsonRequest(req);
    if (!body) {
      sendJson(res, 400, { ok: false, error: 'invalid JSON body' });
      return true;
    }
    if (!body.installation_id || !body.name || !body.type) {
      sendJson(res, 400, { ok: false, error: 'installation_id, name, and type are required' });
      return true;
    }
    if (!(await ensureInstallationAdmin(req, res, body.installation_id))) {
      return true;
    }
    const destination = await store.upsertNotificationDestination(body);
    sendJson(res, 200, { ok: true, destination });
    return true;
  }

  const destinationDeleteMatch = pathname.match(/^\/admin\/alert-config\/destinations\/([^/]+)$/);
  if (req.method === 'DELETE' && destinationDeleteMatch) {
    const destination = await findNotificationDestination(destinationDeleteMatch[1]);
    if (!destination) {
      sendJson(res, 404, { ok: false, error: 'notification destination not found' });
      return true;
    }
    if (!(await ensureInstallationAdmin(req, res, destination.installation_id))) {
      return true;
    }
    await store.deleteNotificationDestination(destination.id);
    sendJson(res, 200, { ok: true, deleted: true, id: destination.id });
    return true;
  }

  const installationMatch = pathname.match(/^\/admin\/installations\/(\d+)(?:\/(repositories|jobs))?$/);
  if (req.method === 'GET' && installationMatch) {
    const installationId = Number(installationMatch[1]);
    if (!(await ensureInstallationAdmin(req, res, installationId))) {
      return true;
    }

    const section = installationMatch[2] || '';
    if (!section) {
      const overview = await getInstallationOverview(installationId, {
        jobFilters: {
          status: url.searchParams.get('status') || undefined,
          limit: parsePositiveInteger(url.searchParams.get('job_limit'), 100),
        },
        failedEventLimit: parsePositiveInteger(url.searchParams.get('failed_event_limit'), 20),
      });

      if (!overview) {
        sendJson(res, 404, { ok: false, error: 'installation not found' });
        return true;
      }

      sendJson(res, 200, { ok: true, ...overview });
      return true;
    }

    if (section === 'repositories') {
      const repositories = await store.listInstallationRepositories(installationId);
      sendJson(res, 200, { ok: true, installation_id: installationId, repositories });
      return true;
    }

    if (section === 'jobs') {
      const jobs = await store.listInstallationJobs(installationId, {
        status: url.searchParams.get('status') || undefined,
        limit: parsePositiveInteger(url.searchParams.get('limit'), 100),
        offset: parsePositiveInteger(url.searchParams.get('offset'), 0),
      });
      sendJson(res, 200, { ok: true, installation_id: installationId, jobs });
      return true;
    }
  }

  if (req.method === 'GET' && pathname === '/admin/actions') {
    const installationId = Number(url.searchParams.get('installation_id') || 0);
    if (!installationId) {
      sendJson(res, 400, { ok: false, error: 'installation_id query param required' });
      return true;
    }

    if (!(await ensureInstallationAdmin(req, res, installationId))) {
      return true;
    }

    const actions = await store.listAdminActions({
      installationId,
      limit: parsePositiveInteger(url.searchParams.get('limit'), 100),
    });

    sendJson(res, 200, {
      ok: true,
      installation_id: installationId,
      actions,
    });
    return true;
  }
  if (req.method === 'GET' && pathname === '/admin/events') {
    const installationId = Number(url.searchParams.get('installation_id') || 0);
    if (!installationId) {
      sendJson(res, 400, { ok: false, error: 'installation_id query param required' });
      return true;
    }

    if (!(await ensureInstallationAdmin(req, res, installationId))) {
      return true;
    }

    const events = await store.listInstallationEvents(installationId, {
      status: url.searchParams.get('status') || 'failed',
      since: url.searchParams.get('since') || undefined,
      limit: parsePositiveInteger(url.searchParams.get('limit'), 100),
    });

    sendJson(res, 200, {
      ok: true,
      installation_id: installationId,
      events,
    });
    return true;
  }

  const replayMatch = pathname.match(/^\/admin\/events\/([^/]+)\/replay$/);
  if (req.method === 'POST' && replayMatch) {
    await replayEvent(req, res, replayMatch[1]);
    return true;
  }

  return false;
}

module.exports = {
  handleAdminRequest,
  ensureInstallationAdmin,
  getInstallationOverview,
  replayEvent,
  parseSinceFilter,
};




