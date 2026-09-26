'use strict';

const fs = require('fs');

function parseJulesCommand(input) {
  if (typeof input !== 'string') {
    return null;
  }

  // Exact commands only: `/jules retry` or `/jules requeue`, optionally followed by
  // `--force` to go past the queue.max_attempts limit. Prints e.g. "retry" or "retry --force".
  const normalized = input.trim().toLowerCase().replace(/\s+/g, ' ');
  const match = /^\/jules (retry|requeue)( --force)?$/.exec(normalized);
  if (!match) {
    return null;
  }
  return match[2] ? `${match[1]} --force` : match[1];
}

if (require.main === module) {
  const input = fs.readFileSync(0, 'utf8');
  const command = parseJulesCommand(input);
  if (!command) {
    process.exit(1);
  }
  process.stdout.write(command);
}

module.exports = { parseJulesCommand };