'use strict';

const { test, describe, before, after } = require('node:test');
const assert = require('node:assert/strict');

delete process.env.DATABASE_URL;
delete process.env.GITHUB_WEBHOOK_SECRET;
delete process.env.STRIPE_WEBHOOK_SECRET;
delete process.env.CORS_ORIGIN;

const { createServer, verifyGitHubSignature } = require('../server');
const { verifyStripeSignature } = require('../billing');
const { safeRedirectPath } = require('../oauth');
const { readBody, BodyTooLargeError } = require('../http-body');
const store = require('../store');

function withEnv(name, value, fn) {
  const saved = process.env[name];
  if (value === undefined) delete process.env[name];
  else process.env[name] = value;
  try {
    return fn();
  } finally {
    if (saved === undefined) delete process.env[name];
    else process.env[name] = saved;
  }
}

describe('webhook signature verification without a secret', () => {
  test('GitHub webhooks are rejected in production', () => {
    const result = withEnv('NODE_ENV', 'production', () => verifyGitHubSignature(Buffer.from('{}'), ''));
    assert.equal(result.ok, false);
    assert.equal(result.status, 503);
  });

  test('GitHub webhooks are accepted unverified outside production (demo mode)', () => {
    const result = withEnv('NODE_ENV', 'development', () => verifyGitHubSignature(Buffer.from('{}'), ''));
    assert.equal(result.ok, true);
    assert.equal(result.mode, 'disabled');
  });

  test('Stripe webhooks are rejected in production', () => {
    const result = withEnv('NODE_ENV', 'production', () => verifyStripeSignature(Buffer.from('{}'), ''));
    assert.equal(result.ok, false);
    assert.equal(result.status, 503);
  });
});

describe('safeRedirectPath', () => {
  test('keeps same-site paths', () => {
    assert.equal(safeRedirectPath('/dashboard'), '/dashboard');
    assert.equal(safeRedirectPath('/dashboard?tab=jobs#top'), '/dashboard?tab=jobs#top');
  });

  test('rejects anything that could leave the site', () => {
    for (const value of [
      'https://evil.example', '//evil.example', '/\\evil.example', 'evil.example',
      'javascript:alert(1)', '/\tevil', '', null, undefined,
    ]) {
      assert.equal(safeRedirectPath(value), '/', `expected "/" for ${JSON.stringify(value)}`);
    }
  });
});

describe('readBody limits', () => {
  const { Readable } = require('node:stream');

  function fakeRequest(chunks, headers = {}) {
    const req = Readable.from(chunks.map((c) => Buffer.from(c)));
    req.headers = headers;
    return req;
  }

  test('reads a body under the limit', async () => {
    const body = await readBody(fakeRequest(['hello ', 'world']), 100);
    assert.equal(body.toString(), 'hello world');
  });

  test('rejects a body that grows past the limit', async () => {
    await assert.rejects(readBody(fakeRequest(['x'.repeat(60), 'x'.repeat(60)]), 100), BodyTooLargeError);
  });

  test('rejects early when Content-Length is over the limit', async () => {
    await assert.rejects(readBody(fakeRequest([], { 'content-length': '5000' }), 100), (err) => err.statusCode === 413);
  });
});

describe('HTTP responses', () => {
  let server;
  let baseUrl;
  let originalListJobs;

  before(async () => {
    originalListJobs = store.listJobs;
    server = createServer();
    await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
    baseUrl = `http://127.0.0.1:${server.address().port}`;
  });

  after(async () => {
    store.listJobs = originalListJobs;
    await new Promise((resolve) => server.close(resolve));
  });

  test('sends no CORS header unless CORS_ORIGIN is set', async () => {
    const res = await fetch(`${baseUrl}/health`);
    assert.equal(res.headers.get('access-control-allow-origin'), null);
  });

  test('does not leak internal error messages', async () => {
    store.listJobs = async () => { throw new Error('secret internal detail'); };
    const res = await fetch(`${baseUrl}/api/jobs`);
    store.listJobs = originalListJobs;
    assert.equal(res.status, 500);
    const body = await res.json();
    assert.equal(body.error, 'internal server error');
  });

  test('answers 413 for an oversized request body', async () => {
    const res = await fetch(`${baseUrl}/billing/checkout`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: 'x'.repeat(2 * 1024 * 1024),
    });
    assert.equal(res.status, 413);
  });
});
