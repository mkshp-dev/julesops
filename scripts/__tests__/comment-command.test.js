'use strict';

const assert = require('node:assert/strict');
const { parseJulesCommand } = require('../../templates/comment-command');

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

check('accepts --force after either command', () => {
  assert.equal(parseJulesCommand('/jules retry --force'), 'retry --force');
  assert.equal(parseJulesCommand(' /Jules  Requeue   --FORCE \n'), 'requeue --force');
});

check('rejects other flags and misplaced --force', () => {
  assert.equal(parseJulesCommand('/jules retry --forced'), null);
  assert.equal(parseJulesCommand('/jules retry -f'), null);
  assert.equal(parseJulesCommand('/jules --force retry'), null);
  assert.equal(parseJulesCommand('/jules retry --force now'), null);
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