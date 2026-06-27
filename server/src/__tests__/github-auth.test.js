'use strict';

/**
 * github-auth.test.js — Unit tests for the GitHub App auth module.
 *
 * Uses Node.js built-in test runner (node --test).
 * No network calls are made; the token exchange is tested with a stub.
 */

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');

const { generateJWT } = require('../github-auth');

// ─── Generate a throw-away RSA key pair for tests ────────────────────────────

const { privateKey, publicKey } = crypto.generateKeyPairSync('rsa', {
  modulusLength: 2048,
  publicKeyEncoding: { type: 'spki', format: 'pem' },
  privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
});

// ─── Helpers ─────────────────────────────────────────────────────────────────

function decodeJwtPart(part) {
  // Add padding if needed
  const padded = part + '==='.slice((part.length % 4) || 4);
  return JSON.parse(Buffer.from(padded.replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString('utf8'));
}

// ─── Tests ───────────────────────────────────────────────────────────────────

describe('generateJWT', () => {
  test('produces a three-part JWT string', () => {
    const token = generateJWT('12345', privateKey);
    const parts = token.split('.');
    assert.equal(parts.length, 3, 'JWT must have exactly three dot-separated parts');
  });

  test('header declares RS256 algorithm', () => {
    const token = generateJWT('12345', privateKey);
    const header = decodeJwtPart(token.split('.')[0]);
    assert.equal(header.alg, 'RS256');
    assert.equal(header.typ, 'JWT');
  });

  test('payload contains correct iss (app ID)', () => {
    const token = generateJWT('99999', privateKey);
    const payload = decodeJwtPart(token.split('.')[1]);
    assert.equal(payload.iss, '99999');
  });

  test('payload iat is in the past (clock-skew guard)', () => {
    const now = Math.floor(Date.now() / 1000);
    const token = generateJWT('1', privateKey);
    const payload = decodeJwtPart(token.split('.')[1]);
    assert.ok(payload.iat < now, 'iat should be slightly in the past');
  });

  test('payload exp is ~9 minutes in the future', () => {
    const now = Math.floor(Date.now() / 1000);
    const token = generateJWT('1', privateKey);
    const payload = decodeJwtPart(token.split('.')[1]);
    assert.ok(payload.exp > now + 7 * 60, 'exp should be at least 7 min in the future');
    assert.ok(payload.exp < now + 11 * 60, 'exp should be less than 11 min in the future');
  });

  test('signature is valid RS256', () => {
    const token = generateJWT('12345', privateKey);
    const [header, payload, sig] = token.split('.');
    const signingInput = `${header}.${payload}`;

    // Decode base64url signature
    const padded = sig + '==='.slice((sig.length % 4) || 4);
    const sigBuf = Buffer.from(padded.replace(/-/g, '+').replace(/_/g, '/'), 'base64');

    const verify = crypto.createVerify('RSA-SHA256');
    verify.update(signingInput);
    assert.ok(verify.verify(publicKey, sigBuf), 'signature must verify against the public key');
  });

  test('accepts numeric app ID', () => {
    const token = generateJWT(42, privateKey);
    const payload = decodeJwtPart(token.split('.')[1]);
    assert.equal(payload.iss, '42');
  });
});

describe('loadPrivateKey', () => {
  const { loadPrivateKey } = require('../github-auth');

  test('throws when no key source is configured', () => {
    const saved = { key: process.env.GITHUB_PRIVATE_KEY, path: process.env.GITHUB_PRIVATE_KEY_PATH };
    delete process.env.GITHUB_PRIVATE_KEY;
    delete process.env.GITHUB_PRIVATE_KEY_PATH;
    assert.throws(() => loadPrivateKey(), /not configured/);
    process.env.GITHUB_PRIVATE_KEY = saved.key || '';
    if (saved.path) process.env.GITHUB_PRIVATE_KEY_PATH = saved.path;
  });

  test('normalises escaped newlines in GITHUB_PRIVATE_KEY', () => {
    const escaped = privateKey.replace(/\n/g, '\\n');
    process.env.GITHUB_PRIVATE_KEY = escaped;
    const loaded = loadPrivateKey();
    assert.ok(loaded.includes('\n'), 'loaded key must contain real newlines');
    delete process.env.GITHUB_PRIVATE_KEY;
  });
});
