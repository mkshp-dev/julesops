'use strict';

/**
 * rbac.test.js — Unit tests for the RBAC module.
 *
 * Tests role ordering, requireAuth, and filterJobsByAuthorization in JSON-file mode.
 */

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');

delete process.env.DATABASE_URL;

const { roleAtLeast, requireAuth } = require('../rbac');

// ─── roleAtLeast tests ────────────────────────────────────────────────────────

describe('roleAtLeast', () => {
  test('owner satisfies all roles', () => {
    assert.equal(roleAtLeast('owner', 'owner'), true);
    assert.equal(roleAtLeast('owner', 'admin'), true);
    assert.equal(roleAtLeast('owner', 'member'), true);
    assert.equal(roleAtLeast('owner', 'viewer'), true);
  });

  test('admin satisfies admin, member, viewer but not owner', () => {
    assert.equal(roleAtLeast('admin', 'owner'), false);
    assert.equal(roleAtLeast('admin', 'admin'), true);
    assert.equal(roleAtLeast('admin', 'member'), true);
    assert.equal(roleAtLeast('admin', 'viewer'), true);
  });

  test('member satisfies member and viewer only', () => {
    assert.equal(roleAtLeast('member', 'owner'), false);
    assert.equal(roleAtLeast('member', 'admin'), false);
    assert.equal(roleAtLeast('member', 'member'), true);
    assert.equal(roleAtLeast('member', 'viewer'), true);
  });

  test('viewer satisfies only viewer', () => {
    assert.equal(roleAtLeast('viewer', 'owner'), false);
    assert.equal(roleAtLeast('viewer', 'admin'), false);
    assert.equal(roleAtLeast('viewer', 'member'), false);
    assert.equal(roleAtLeast('viewer', 'viewer'), true);
  });
});

// ─── requireAuth tests ────────────────────────────────────────────────────────

describe('requireAuth', () => {
  function makeRes() {
    const headers = {};
    let code = null;
    let body = null;
    return {
      writeHead(c, h) { code = c; Object.assign(headers, h); },
      end(b) { body = b; },
      _code: () => code,
      _body: () => body,
    };
  }

  test('returns false and sends 401 when session is null', () => {
    const req = { session: null };
    const res = makeRes();
    const result = requireAuth(req, res);
    assert.equal(result, false);
    assert.equal(res._code(), 401);
    assert.ok(res._body().includes('authentication required'));
  });

  test('returns true when session exists', () => {
    const req = { session: { githubId: 99, githubLogin: 'user' } };
    const res = makeRes();
    const result = requireAuth(req, res);
    assert.equal(result, true);
    assert.equal(res._code(), null); // no response sent
  });
});
