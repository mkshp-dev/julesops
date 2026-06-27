'use strict';

/**
 * session.test.js — Unit tests for the session store and cookie helpers.
 */

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');

const {
  createSession,
  getSession,
  updateSession,
  destroySession,
  parseCookies,
  _sessions,
} = require('../session');

describe('session store', () => {
  test('createSession returns a hex string', () => {
    const id = createSession({ userId: 'abc' });
    assert.match(id, /^[0-9a-f]{64}$/);
  });

  test('getSession returns session data after creation', () => {
    const id = createSession({ login: 'test-user', role: 'admin' });
    const data = getSession(id);
    assert.ok(data, 'session should exist');
    assert.equal(data.login, 'test-user');
    assert.equal(data.role, 'admin');
  });

  test('getSession returns null for unknown id', () => {
    assert.equal(getSession('nonexistent'), null);
  });

  test('getSession returns null for empty string', () => {
    assert.equal(getSession(''), null);
    assert.equal(getSession(null), null);
  });

  test('updateSession merges patch into existing session', () => {
    const id = createSession({ a: 1, b: 2 });
    updateSession(id, { b: 99, c: 3 });
    const data = getSession(id);
    assert.equal(data.a, 1);
    assert.equal(data.b, 99);
    assert.equal(data.c, 3);
  });

  test('destroySession removes the session', () => {
    const id = createSession({ user: 'x' });
    destroySession(id);
    assert.equal(getSession(id), null);
  });

  test('getSession evicts expired sessions', () => {
    const id = createSession({ x: 1 });
    // Manually expire the session
    const entry = _sessions.get(id);
    entry.expiresAt = Date.now() - 1;
    assert.equal(getSession(id), null);
    assert.equal(_sessions.has(id), false, 'expired session should be deleted');
  });

  test('two sessions are independent', () => {
    const a = createSession({ role: 'admin' });
    const b = createSession({ role: 'viewer' });
    assert.equal(getSession(a).role, 'admin');
    assert.equal(getSession(b).role, 'viewer');
    destroySession(a);
    assert.equal(getSession(a), null);
    assert.ok(getSession(b), 'other session should be unaffected');
  });
});

describe('parseCookies', () => {
  test('parses single cookie', () => {
    const result = parseCookies('name=value');
    assert.equal(result.name, 'value');
  });

  test('parses multiple cookies', () => {
    const result = parseCookies('a=1; b=2; c=three');
    assert.equal(result.a, '1');
    assert.equal(result.b, '2');
    assert.equal(result.c, 'three');
  });

  test('handles empty header', () => {
    assert.deepEqual(parseCookies(''), {});
    assert.deepEqual(parseCookies(null), {});
    assert.deepEqual(parseCookies(undefined), {});
  });

  test('decodes URI-encoded values', () => {
    const result = parseCookies('sid=hello%20world');
    assert.equal(result.sid, 'hello world');
  });

  test('handles cookie values containing =', () => {
    const result = parseCookies('token=abc=def=ghi');
    assert.equal(result.token, 'abc=def=ghi');
  });
});
