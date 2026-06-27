'use strict';

/**
 * config-discovery.test.js — Unit tests for parseYaml and validateConfig.
 *
 * These tests exercise the built-in YAML parser and schema validator with
 * a range of valid, invalid, and edge-case inputs. No network calls are made.
 */

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');

const { parseYaml, validateConfig } = require('../config-discovery');

// ─── parseYaml tests ─────────────────────────────────────────────────────────

describe('parseYaml', () => {
  test('parses a flat key: value document', () => {
    const yaml = `
name: my-repo
enabled: true
count: 42
`;
    const result = parseYaml(yaml);
    assert.equal(result.name, 'my-repo');
    assert.equal(result.enabled, true);
    assert.equal(result.count, 42);
  });

  test('parses nested mappings', () => {
    const yaml = `
jules:
  label: jules:assigned
  timeout: 30
labels:
  queue: julesops:queue
`;
    const result = parseYaml(yaml);
    assert.equal(result.jules.label, 'jules:assigned');
    assert.equal(result.jules.timeout, 30);
    assert.equal(result.labels.queue, 'julesops:queue');
  });

  test('strips inline comments', () => {
    const yaml = `
key: value # this is a comment
other: 123  # another comment
`;
    const result = parseYaml(yaml);
    assert.equal(result.key, 'value');
    assert.equal(result.other, 123);
  });

  test('coerces boolean values', () => {
    const yaml = `
a: true
b: false
c: yes
d: no
`;
    const result = parseYaml(yaml);
    assert.equal(result.a, true);
    assert.equal(result.b, false);
    assert.equal(result.c, true);
    assert.equal(result.d, false);
  });

  test('coerces null values', () => {
    const yaml = `
a: null
b: ~
`;
    const result = parseYaml(yaml);
    assert.equal(result.a, null);
    assert.equal(result.b, null);
  });

  test('handles empty document', () => {
    const result = parseYaml('');
    assert.deepEqual(result, {});
  });

  test('ignores comment-only lines', () => {
    const yaml = `
# This is a comment
# Another comment
name: value
`;
    const result = parseYaml(yaml);
    assert.equal(result.name, 'value');
  });

  test('parses a realistic julesops.yml', () => {
    const yaml = `
jules:
  label: jules:assigned
  queue_label: julesops:queue
  timeout_minutes: 30

labels:
  queue: julesops:queue
  in_progress: status:in-progress
  review: status:review
  done: status:done
  failed: status:failed
  blocked: status:blocked

settings:
  max_attempts: 3
  stale_days: 7
  notify_on_failure: true
`;
    const result = parseYaml(yaml);
    assert.equal(result.jules.label, 'jules:assigned');
    assert.equal(result.jules.timeout_minutes, 30);
    assert.equal(result.labels.queue, 'julesops:queue');
    assert.equal(result.settings.max_attempts, 3);
    assert.equal(result.settings.notify_on_failure, true);
  });
});

// ─── validateConfig tests ─────────────────────────────────────────────────────

describe('validateConfig', () => {
  test('valid config with jules and labels', () => {
    const config = {
      jules: { label: 'jules:assigned' },
      labels: { queue: 'julesops:queue' },
    };
    const { valid, errors } = validateConfig(config);
    assert.equal(valid, true);
    assert.equal(errors.length, 0);
  });

  test('invalid: null config', () => {
    const { valid, errors } = validateConfig(null);
    assert.equal(valid, false);
    assert.ok(errors.length > 0);
  });

  test('invalid: non-object config', () => {
    const { valid, errors } = validateConfig('not an object');
    assert.equal(valid, false);
    assert.ok(errors.length > 0);
  });

  test('invalid: missing jules section', () => {
    const config = { labels: { queue: 'julesops:queue' } };
    const { valid, errors } = validateConfig(config);
    assert.equal(valid, false);
    assert.ok(errors.some((e) => e.includes('jules')));
  });

  test('invalid: missing labels section', () => {
    const config = { jules: { label: 'jules:assigned' } };
    const { valid, errors } = validateConfig(config);
    assert.equal(valid, false);
    assert.ok(errors.some((e) => e.includes('labels')));
  });

  test('invalid: both sections missing', () => {
    const { valid, errors } = validateConfig({});
    assert.equal(valid, false);
    assert.equal(errors.length, 2);
  });
});
