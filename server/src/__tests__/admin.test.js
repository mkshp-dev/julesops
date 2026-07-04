'use strict';

const { test, describe, before, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'julesops-admin-'));
process.env.JULESOPS_DATA_DIR = tempDir;
delete process.env.DATABASE_URL;

const store = require('../store');
const { processWebhookPayload } = require('../webhook-processor');
const { handleAdminRequest } = require('../admin');

function makeInstallation(id = 2001) {
  return {
    id,
    app_id: 42,
    account: { login: 'test-org', type: 'Organization' },
    target_type: 'Organization',
    access_tokens_url: `https://api.github.com/app/installations/${id}/access_tokens`,
    html_url: `https://github.com/apps/julesops/installations/${id}`,
  };
}

function makeIssuePayload(installationId, issueNumber = 17) {
  return {
    action: 'opened',
    installation: { id: installationId },
    repository: { full_name: 'test-org/alpha' },
    issue: {
      number: issueNumber,
      title: 'Fix the broken thing',
      labels: [{ name: 'status:in-progress' }],
    },
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

function makeReq(url, method = 'GET') {
  return {
    method,
    url,
    headers: { host: '127.0.0.1:3000' },
    session: { githubId: 99, githubLogin: 'admin-user' },
  };
}

function parseBody(res) {
  return res.body() ? JSON.parse(res.body()) : null;
}

describe('admin APIs', () => {
  before(async () => {
    await processWebhookPayload({
      eventName: 'installation',
      payload: {
        action: 'created',
        installation: makeInstallation(2001),
        repositories: [{ id: 3001, full_name: 'test-org/alpha', private: false }],
      },
      deliveryId: 'delivery-installation',
      signatureMode: 'verified',
    });

    await processWebhookPayload({
      eventName: 'issues',
      payload: makeIssuePayload(2001, 17),
      deliveryId: 'delivery-issue',
      signatureMode: 'verified',
    });

    await store.updateEventStatus('delivery-issue', 'failed', 'simulated webhook failure');
  });

  after(() => {
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  test('returns an installation overview with repositories, jobs, and failed events', async () => {
    const req = makeReq('/admin/installations/2001');
    const res = makeRes();
    const handled = await handleAdminRequest(req, res, new URL(`http://${req.headers.host}${req.url}`));

    assert.equal(handled, true);
    assert.equal(res.statusCode(), 200);

    const body = parseBody(res);
    assert.equal(body.ok, true);
    assert.equal(body.installation.id, 2001);
    assert.equal(body.repositories.length, 1);
    assert.equal(body.jobs.length, 1);
    assert.equal(body.failed_events.length, 1);
    assert.equal(body.counts.repositories, 1);
  });

  test('lists failed events for an installation', async () => {
    const req = makeReq('/admin/events?installation_id=2001&status=failed&since=24h');
    const res = makeRes();
    const handled = await handleAdminRequest(req, res, new URL(`http://${req.headers.host}${req.url}`));

    assert.equal(handled, true);
    assert.equal(res.statusCode(), 200);

    const body = parseBody(res);
    assert.equal(body.ok, true);
    assert.equal(body.events.length, 1);
    assert.equal(body.events[0].processing_status, 'failed');
  });

  test('replays a failed event and records an audit action', async () => {
    const failedEvent = await store.getEvent('delivery-issue');
    const req = makeReq(`/admin/events/${failedEvent.id}/replay`, 'POST');
    const res = makeRes();
    const handled = await handleAdminRequest(req, res, new URL(`http://${req.headers.host}${req.url}`));

    assert.equal(handled, true);
    assert.equal(res.statusCode(), 200);

    const body = parseBody(res);
    assert.equal(body.ok, true);
    assert.ok(body.replay.delivery_id.startsWith('replay-delivery-issue'));

    const storeState = JSON.parse(fs.readFileSync(path.join(tempDir, 'store.json'), 'utf8'));
    assert.equal(storeState.events.length, 2);
    assert.equal(storeState.admin_actions.length, 1);
    assert.equal(storeState.admin_actions[0].action, 'replay_event');
  });
});
