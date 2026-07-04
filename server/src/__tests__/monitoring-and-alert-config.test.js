'use strict';

const { test, describe, before, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'julesops-monitoring-'));
process.env.JULESOPS_DATA_DIR = tempDir;
delete process.env.DATABASE_URL;

const db = require('../db');
const store = require('../store');
const { createSession } = require('../session');

const originals = {
  getPool: db.getPool,
  isHealthy: db.isHealthy,
  query: db.query,
  queryOne: db.queryOne,
  getStats: store.getStats,
  listAlertRules: store.listAlertRules,
  listNotificationDestinations: store.listNotificationDestinations,
  listAlertDeliveries: store.listAlertDeliveries,
  upsertAlertRule: store.upsertAlertRule,
  upsertNotificationDestination: store.upsertNotificationDestination,
  deleteAlertRule: store.deleteAlertRule,
  deleteNotificationDestination: store.deleteNotificationDestination,
};

function makeReq(pathname, method = 'GET', headers = {}, body = null) {
  return {
    method,
    url: pathname,
    headers: { host: '127.0.0.1:3000', ...headers },
    session: headers.cookie ? { githubId: 1, githubLogin: 'admin-user' } : undefined,
  };
}

function makeRes() {
  let code = null;
  let headers = null;
  let body = '';
  return {
    writeHead(statusCode, responseHeaders) {
      code = statusCode;
      headers = responseHeaders;
    },
    end(payload) {
      body = payload ? payload.toString('utf8') : '';
    },
    statusCode() {
      return code;
    },
    headers() {
      return headers;
    },
    body() {
      return body;
    },
  };
}

async function startServer() {
  const { createServer } = require('../server');
  const server = createServer();
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  return server;
}

function hit(baseUrl, pathname, options = {}) {
  return fetch(`${baseUrl}${pathname}`, {
    method: options.method || 'GET',
    headers: options.headers || {},
    body: options.body,
    redirect: 'manual',
  });
}

describe('monitoring endpoints', () => {
  after(() => {
    fs.rmSync(tempDir, { recursive: true, force: true });
    db.getPool = originals.getPool;
    db.isHealthy = originals.isHealthy;
    db.query = originals.query;
    db.queryOne = originals.queryOne;
    store.getStats = originals.getStats;
    store.listAlertRules = originals.listAlertRules;
    store.listNotificationDestinations = originals.listNotificationDestinations;
    store.listAlertDeliveries = originals.listAlertDeliveries;
    store.upsertAlertRule = originals.upsertAlertRule;
    store.upsertNotificationDestination = originals.upsertNotificationDestination;
    store.deleteAlertRule = originals.deleteAlertRule;
    store.deleteNotificationDestination = originals.deleteNotificationDestination;
  });

  test('exposes readiness, health summary, and monitoring metrics', async () => {
    db.getPool = () => ({ mocked: true });
    db.isHealthy = async () => true;
    db.query = async () => [];
    db.queryOne = async () => null;
    store.getStats = async () => ({ total: 2, review: 1, blocked: 1, failed: 1 });
    store.listAlertRules = async () => [{ id: 'rule-1' }];
    store.listNotificationDestinations = async () => [{ id: 'dest-1' }];
    store.listAlertDeliveries = async () => [{ id: 'delivery-1' }];

    const server = await startServer();
    const baseUrl = `http://127.0.0.1:${server.address().port}`;

    const ready = await hit(baseUrl, '/ready');
    assert.equal(ready.status, 200);
    const readyBody = await ready.json();
    assert.equal(readyBody.ready, true);

    const alerts = await hit(baseUrl, '/health/alerts');
    assert.equal(alerts.status, 200);
    const alertsBody = await alerts.json();
    assert.equal(alertsBody.alert_rules, 1);
    assert.equal(alertsBody.notification_destinations, 1);

    const metrics = await hit(baseUrl, '/metrics');
    assert.equal(metrics.status, 200);
    const metricsBody = await metrics.text();
    assert.match(metricsBody, /julesops_alert_rules_total 1/);
    assert.match(metricsBody, /julesops_notification_destinations_total 1/);
    assert.match(metricsBody, /webhook_processing_duration_seconds_bucket/);

    await new Promise((resolve) => server.close(resolve));
  });
});

describe('alert config api', () => {
  let server;
  let baseUrl;
  const adminCookie = `julesops_sid=${createSession({ githubId: 77, githubLogin: 'admin-user' })}`;

  before(async () => {
    db.getPool = () => null;
    db.isHealthy = async () => false;
    db.query = originals.query;
    db.queryOne = originals.queryOne;
    server = await startServer();
    baseUrl = `http://127.0.0.1:${server.address().port}`;
  });

  after(async () => {
    await new Promise((resolve) => server.close(resolve));
    db.getPool = originals.getPool;
    db.isHealthy = originals.isHealthy;
    db.query = originals.query;
    db.queryOne = originals.queryOne;
  });

  test('creates, lists, and deletes rules and destinations', async () => {
    const createRule = await hit(baseUrl, '/admin/alert-config/rules', {
      method: 'POST',
      headers: { cookie: adminCookie, 'content-type': 'application/json' },
      body: JSON.stringify({ installation_id: 2001, rule_type: 'webhook_failure', threshold_hours: 2, enabled: true }),
    });
    assert.equal(createRule.status, 200);
    const ruleBody = await createRule.json();
    assert.equal(ruleBody.rule.rule_type, 'webhook_failure');

    const createDest = await hit(baseUrl, '/admin/alert-config/destinations', {
      method: 'POST',
      headers: { cookie: adminCookie, 'content-type': 'application/json' },
      body: JSON.stringify({ installation_id: 2001, name: 'Slack ops', type: 'slack', url: 'https://hooks.slack.com/services/test' }),
    });
    assert.equal(createDest.status, 200);
    const destBody = await createDest.json();
    assert.equal(destBody.destination.type, 'slack');

    const summary = await hit(baseUrl, '/admin/alert-config?installation_id=2001', {
      headers: { cookie: adminCookie },
    });
    assert.equal(summary.status, 200);
    const summaryBody = await summary.json();
    assert.equal(summaryBody.alert_rules.length, 1);
    assert.equal(summaryBody.notification_destinations.length, 1);

    const deleteRule = await hit(baseUrl, `/admin/alert-config/rules/${ruleBody.rule.id}`, {
      method: 'DELETE',
      headers: { cookie: adminCookie },
    });
    assert.equal(deleteRule.status, 200);

    const deleteDest = await hit(baseUrl, `/admin/alert-config/destinations/${destBody.destination.id}`, {
      method: 'DELETE',
      headers: { cookie: adminCookie },
    });
    assert.equal(deleteDest.status, 200);
  });
});
