'use strict';

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');

const { sendEmail, buildSendGridPayload, dispatch } = require('../notify');

function withServer(responseHandler) {
  return new Promise((resolve, reject) => {
    const server = http.createServer(responseHandler);
    server.listen(0, '127.0.0.1', () => {
      const { port } = server.address();
      resolve({
        url: `http://127.0.0.1:${port}`,
        close: () => new Promise((done) => server.close(done)),
      });
    });
    server.on('error', reject);
  });
}

describe('sendEmail', () => {
  test('delivers via SendGrid when configured', async () => {
    const requests = [];
    const fake = await withServer((req, res) => {
      const chunks = [];
      req.on('data', (c) => chunks.push(c));
      req.on('end', () => {
        requests.push({
          method: req.method,
          url: req.url,
          auth: req.headers.authorization,
          body: Buffer.concat(chunks).toString('utf8'),
        });
        res.writeHead(202, { 'content-type': 'application/json' });
        res.end(JSON.stringify({ ok: true }));
      });
    });

    const saved = {
      key: process.env.SENDGRID_API_KEY,
      from: process.env.ALERT_EMAIL_FROM,
      base: process.env.SENDGRID_API_BASE_URL,
      fallback: process.env.ALERT_EMAIL_DEMO_FALLBACK,
      nodeEnv: process.env.NODE_ENV,
    };
    process.env.SENDGRID_API_KEY = 'sg.test.key';
    process.env.ALERT_EMAIL_FROM = 'alerts@example.com';
    process.env.SENDGRID_API_BASE_URL = fake.url;
    process.env.ALERT_EMAIL_DEMO_FALLBACK = 'false';
    process.env.NODE_ENV = 'production';

    const payload = buildSendGridPayload(
      { type: 'email', email: 'user@example.com' },
      { rule_type: 'dispatch_failure', message: 'Dispatch failed', repository: 'mkshp-dev/julesops', job_url: 'https://github.com/mkshp-dev/julesops/issues/61' },
    );
    assert.equal(payload.from.email, 'alerts@example.com');
    assert.equal(payload.personalizations[0].to[0].email, 'user@example.com');

    const result = await sendEmail(
      { type: 'email', email: 'user@example.com' },
      { rule_type: 'dispatch_failure', message: 'Dispatch failed', repository: 'mkshp-dev/julesops', job_url: 'https://github.com/mkshp-dev/julesops/issues/61' },
    );

    await fake.close();
    process.env.SENDGRID_API_KEY = saved.key;
    process.env.ALERT_EMAIL_FROM = saved.from;
    process.env.SENDGRID_API_BASE_URL = saved.base;
    process.env.ALERT_EMAIL_DEMO_FALLBACK = saved.fallback;
    process.env.NODE_ENV = saved.nodeEnv;

    assert.equal(result.ok, true);
    assert.equal(result.status, 202);
    assert.equal(requests.length, 1);
    assert.equal(requests[0].method, 'POST');
    assert.equal(requests[0].url, '/v3/mail/send');
    assert.equal(requests[0].auth, 'Bearer sg.test.key');

    const sentPayload = JSON.parse(requests[0].body);
    assert.equal(sentPayload.from.email, 'alerts@example.com');
    assert.equal(sentPayload.personalizations[0].to[0].email, 'user@example.com');
    assert.ok(sentPayload.content[0].value.includes('Dispatch failed'));
  });

  test('returns an error when SendGrid is configured without a from address', async () => {
    const saved = {
      key: process.env.SENDGRID_API_KEY,
      from: process.env.ALERT_EMAIL_FROM,
      fallback: process.env.ALERT_EMAIL_DEMO_FALLBACK,
      nodeEnv: process.env.NODE_ENV,
    };
    process.env.SENDGRID_API_KEY = 'sg.test.key';
    delete process.env.ALERT_EMAIL_FROM;
    process.env.ALERT_EMAIL_DEMO_FALLBACK = 'false';
    process.env.NODE_ENV = 'production';

    const result = await sendEmail(
      { type: 'email', email: 'user@example.com' },
      { rule_type: 'dispatch_failure', message: 'Dispatch failed' },
    );

    process.env.SENDGRID_API_KEY = saved.key;
    process.env.ALERT_EMAIL_FROM = saved.from;
    process.env.ALERT_EMAIL_DEMO_FALLBACK = saved.fallback;
    process.env.NODE_ENV = saved.nodeEnv;

    assert.equal(result.ok, false);
    assert.match(result.error, /ALERT_EMAIL_FROM/i);
  });

  test('returns an error when the provider rejects the request', async () => {
    const fake = await withServer((req, res) => {
      req.resume();
      res.writeHead(500, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ error: 'boom' }));
    });

    const saved = {
      key: process.env.SENDGRID_API_KEY,
      from: process.env.ALERT_EMAIL_FROM,
      base: process.env.SENDGRID_API_BASE_URL,
      fallback: process.env.ALERT_EMAIL_DEMO_FALLBACK,
      nodeEnv: process.env.NODE_ENV,
    };
    process.env.SENDGRID_API_KEY = 'sg.test.key';
    process.env.ALERT_EMAIL_FROM = 'alerts@example.com';
    process.env.SENDGRID_API_BASE_URL = fake.url;
    process.env.ALERT_EMAIL_DEMO_FALLBACK = 'false';
    process.env.NODE_ENV = 'production';

    const result = await sendEmail(
      { type: 'email', email: 'user@example.com' },
      { rule_type: 'dispatch_failure', message: 'Dispatch failed' },
    );

    await fake.close();
    process.env.SENDGRID_API_KEY = saved.key;
    process.env.ALERT_EMAIL_FROM = saved.from;
    process.env.SENDGRID_API_BASE_URL = saved.base;
    process.env.ALERT_EMAIL_DEMO_FALLBACK = saved.fallback;
    process.env.NODE_ENV = saved.nodeEnv;

    assert.equal(result.ok, false);
    assert.match(result.error, /HTTP 500/);
  });
});

describe('dispatch', () => {
  test('routes email destinations through the email provider', async () => {
    const saved = {
      key: process.env.SENDGRID_API_KEY,
      from: process.env.ALERT_EMAIL_FROM,
      base: process.env.SENDGRID_API_BASE_URL,
      fallback: process.env.ALERT_EMAIL_DEMO_FALLBACK,
      nodeEnv: process.env.NODE_ENV,
    };
    process.env.SENDGRID_API_KEY = 'sg.test.key';
    process.env.ALERT_EMAIL_FROM = 'alerts@example.com';
    process.env.SENDGRID_API_BASE_URL = 'http://127.0.0.1:9';
    process.env.ALERT_EMAIL_DEMO_FALLBACK = 'false';
    process.env.NODE_ENV = 'production';

    const result = await dispatch(
      { type: 'email', email: 'user@example.com' },
      { rule_type: 'dispatch_failure', message: 'Dispatch failed' },
    );

    process.env.SENDGRID_API_KEY = saved.key;
    process.env.ALERT_EMAIL_FROM = saved.from;
    process.env.SENDGRID_API_BASE_URL = saved.base;
    process.env.ALERT_EMAIL_DEMO_FALLBACK = saved.fallback;
    process.env.NODE_ENV = saved.nodeEnv;

    assert.equal(result.ok, false);
    assert.match(result.error, /ECONNREFUSED|connect/i);
  });
});