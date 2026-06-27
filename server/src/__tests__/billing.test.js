'use strict';

/**
 * billing.test.js — Unit tests for Stripe webhook signature verification.
 */

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');

const { verifyStripeSignature } = require('../billing');

function buildStripeHeader(body, secret, offsetSeconds = 0) {
  const timestamp = Math.floor(Date.now() / 1000) + offsetSeconds;
  const signed = `${timestamp}.${body}`;
  const sig = crypto.createHmac('sha256', secret).update(signed).digest('hex');
  return `t=${timestamp},v1=${sig}`;
}

describe('verifyStripeSignature', () => {
  const secret = 'whsec_test_secret_12345';
  const body = Buffer.from(JSON.stringify({ type: 'customer.subscription.updated' }));

  test('returns ok:true for valid signature', () => {
    const header = buildStripeHeader(body.toString('utf8'), secret);
    process.env.STRIPE_WEBHOOK_SECRET = secret;
    const result = verifyStripeSignature(body, header);
    delete process.env.STRIPE_WEBHOOK_SECRET;
    assert.equal(result.ok, true);
  });

  test('returns ok:false for wrong secret', () => {
    const header = buildStripeHeader(body.toString('utf8'), 'wrong-secret');
    process.env.STRIPE_WEBHOOK_SECRET = secret;
    const result = verifyStripeSignature(body, header);
    delete process.env.STRIPE_WEBHOOK_SECRET;
    assert.equal(result.ok, false);
    assert.ok(result.reason.includes('invalid'));
  });

  test('returns ok:false for missing header', () => {
    process.env.STRIPE_WEBHOOK_SECRET = secret;
    const result = verifyStripeSignature(body, '');
    delete process.env.STRIPE_WEBHOOK_SECRET;
    assert.equal(result.ok, false);
    assert.ok(result.reason.includes('missing'));
  });

  test('returns ok:false for expired timestamp (>5 min old)', () => {
    const header = buildStripeHeader(body.toString('utf8'), secret, -(6 * 60)); // 6 minutes ago
    process.env.STRIPE_WEBHOOK_SECRET = secret;
    const result = verifyStripeSignature(body, header);
    delete process.env.STRIPE_WEBHOOK_SECRET;
    assert.equal(result.ok, false);
    assert.ok(result.reason.includes('timestamp'));
  });

  test('returns ok:true (disabled) when STRIPE_WEBHOOK_SECRET is empty', () => {
    delete process.env.STRIPE_WEBHOOK_SECRET;
    const result = verifyStripeSignature(body, '');
    assert.equal(result.ok, true);
    assert.equal(result.mode, 'disabled');
  });
});
