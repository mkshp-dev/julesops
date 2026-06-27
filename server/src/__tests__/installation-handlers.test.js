'use strict';

/**
 * installation-handlers.test.js — Unit tests for installation webhook handlers.
 *
 * Uses Node's built-in test runner. No Postgres connection required.
 * When DATABASE_URL is not set, db.getPool() returns null and handlers
 * operate in JSON-file demo mode (log-only for installation records).
 */

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');

// DATABASE_URL must NOT be set for these tests to run in JSON-file mode.
delete process.env.DATABASE_URL;

const {
  handleInstallationEvent,
  handleInstallationRepositoriesEvent,
} = require('../installation-handlers');

// ─── Fixtures ─────────────────────────────────────────────────────────────────

function makeInstallation(id = 1001) {
  return {
    id,
    app_id: 42,
    account: { login: 'test-org', type: 'Organization' },
    target_type: 'Organization',
    access_tokens_url: `https://api.github.com/app/installations/${id}/access_tokens`,
    html_url: `https://github.com/apps/julesops/installations/${id}`,
  };
}

function makeRepo(id = 9001, fullName = 'test-org/my-repo') {
  return { id, full_name: fullName, private: false };
}

// ─── Tests ───────────────────────────────────────────────────────────────────

describe('handleInstallationEvent', () => {
  test('handles installation.created with no repos', async () => {
    const payload = {
      action: 'created',
      installation: makeInstallation(2001),
      repositories: [],
    };
    const result = await handleInstallationEvent(payload);
    assert.equal(result.handled, true);
    assert.equal(result.action, 'created');
    assert.equal(result.installationId, 2001);
    assert.ok(result.summary.includes('0 repo'));
  });

  test('handles installation.created with repositories', async () => {
    const payload = {
      action: 'created',
      installation: makeInstallation(2002),
      repositories: [makeRepo(9001, 'test-org/repo-a'), makeRepo(9002, 'test-org/repo-b')],
    };
    const result = await handleInstallationEvent(payload);
    assert.equal(result.handled, true);
    assert.ok(result.summary.includes('2 repo'));
  });

  test('handles installation.deleted', async () => {
    const payload = { action: 'deleted', installation: makeInstallation(2003) };
    const result = await handleInstallationEvent(payload);
    assert.equal(result.handled, true);
    assert.equal(result.action, 'deleted');
  });

  test('handles installation.suspend', async () => {
    const payload = { action: 'suspend', installation: makeInstallation(2004) };
    const result = await handleInstallationEvent(payload);
    assert.equal(result.handled, true);
    assert.equal(result.action, 'suspend');
  });

  test('handles installation.unsuspend', async () => {
    const payload = { action: 'unsuspend', installation: makeInstallation(2005) };
    const result = await handleInstallationEvent(payload);
    assert.equal(result.handled, true);
    assert.equal(result.action, 'unsuspend');
  });

  test('returns handled:false for unknown action', async () => {
    const payload = { action: 'new_permissions_accepted', installation: makeInstallation(2006) };
    const result = await handleInstallationEvent(payload);
    assert.equal(result.handled, false);
  });

  test('returns handled:false when payload has no installation id', async () => {
    const payload = { action: 'created' };
    const result = await handleInstallationEvent(payload);
    assert.equal(result.handled, false);
    assert.equal(result.installationId, null);
  });
});

describe('handleInstallationRepositoriesEvent', () => {
  test('handles repositories.added', async () => {
    const payload = {
      action: 'added',
      installation: makeInstallation(3001),
      repositories_added: [makeRepo(8001, 'test-org/new-repo')],
      repositories_removed: [],
    };
    const result = await handleInstallationRepositoriesEvent(payload);
    assert.equal(result.handled, true);
    assert.equal(result.added, 1);
    assert.equal(result.removed, 0);
  });

  test('handles repositories.removed', async () => {
    const payload = {
      action: 'removed',
      installation: makeInstallation(3002),
      repositories_added: [],
      repositories_removed: [makeRepo(8002, 'test-org/old-repo')],
    };
    const result = await handleInstallationRepositoriesEvent(payload);
    assert.equal(result.handled, true);
    assert.equal(result.added, 0);
    assert.equal(result.removed, 1);
  });

  test('handles both added and removed simultaneously', async () => {
    const payload = {
      action: 'added',
      installation: makeInstallation(3003),
      repositories_added: [makeRepo(8003, 'o/a'), makeRepo(8004, 'o/b')],
      repositories_removed: [makeRepo(8005, 'o/c')],
    };
    const result = await handleInstallationRepositoriesEvent(payload);
    assert.equal(result.added, 2);
    assert.equal(result.removed, 1);
  });

  test('returns handled:false when installation id is missing', async () => {
    const payload = { action: 'added', repositories_added: [], repositories_removed: [] };
    const result = await handleInstallationRepositoriesEvent(payload);
    assert.equal(result.handled, false);
  });
});
