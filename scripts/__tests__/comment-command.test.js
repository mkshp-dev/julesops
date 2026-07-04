'use strict';

const assert = require('node:assert/strict');
const { parseJulesCommand } = require('../comment-command');

function check(name, fn) {
  try {
    fn();
    console.log(`ok - ${name}`);
  } catch (err) {
    console.error(`not ok - ${name}`);
    throw err;
  }
}

check('accepts retry with casing and whitespace variations', () => {
  assert.equal(parseJulesCommand('  /Jules   Retry  \n'), 'retry');
});

check('accepts requeue with casing and whitespace variations', () => {
  assert.equal(parseJulesCommand('\t/jules\trequeue\n'), 'requeue');
});

check('rejects punctuation and extra text', () => {
  assert.equal(parseJulesCommand('/jules retry!!!'), null);
  assert.equal(parseJulesCommand('/jules retry please'), null);
});

check('rejects malicious bodies', () => {
  assert.equal(parseJulesCommand('/jules retry; echo hacked'), null);
  assert.equal(parseJulesCommand('$(echo hacked)'), null);
  assert.equal(parseJulesCommand('`echo hacked`'), null);
});

check('rejects non-commands', () => {
  assert.equal(parseJulesCommand('hello world'), null);
  assert.equal(parseJulesCommand(''), null);
  assert.equal(parseJulesCommand(null), null);
});

console.log('comment-command tests passed');