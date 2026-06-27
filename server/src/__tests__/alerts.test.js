'use strict';

/**
 * alerts.test.js — Unit tests for the alerts module.
 */

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');

delete process.env.DATABASE_URL;

const { buildAlert } = require('../alerts');

describe('buildAlert', () => {
  const job = {
    id: 'abc-123',
    repository: 'test-org/my-repo',
    issue_number: 42,
    issue_title: 'Implement feature X',
  };

  test('dispatch_failure builds correct alert', () => {
    const alert = buildAlert('dispatch_failure', job);
    assert.equal(alert.rule_type, 'dispatch_failure');
    assert.ok(alert.message.includes('test-org/my-repo'));
    assert.ok(alert.message.includes('42'));
    assert.equal(alert.job_id, 'abc-123');
    assert.ok(alert.job_url.includes('issues/42'));
    assert.ok(alert.triggered_at);
  });

  test('stale_in_progress builds correct alert', () => {
    const alert = buildAlert('stale_in_progress', job);
    assert.equal(alert.rule_type, 'stale_in_progress');
    assert.ok(alert.message.includes('in-progress'));
  });

  test('stale_review builds correct alert', () => {
    const alert = buildAlert('stale_review', job);
    assert.equal(alert.rule_type, 'stale_review');
    assert.ok(alert.message.includes('review'));
  });

  test('webhook_failure builds correct alert with no job', () => {
    const alert = buildAlert('webhook_failure', null, { event_type: 'push' });
    assert.equal(alert.rule_type, 'webhook_failure');
    assert.ok(alert.message.includes('push'));
    assert.equal(alert.job_id, null);
    assert.equal(alert.job_url, null);
  });

  test('extra fields are merged into alert', () => {
    const alert = buildAlert('dispatch_failure', job, { custom_field: 'hello' });
    assert.equal(alert.custom_field, 'hello');
  });
});
