'use strict';

const fs = require('fs');

function parseJulesCommand(input) {
  if (typeof input !== 'string') {
    return null;
  }

  const normalized = input.trim().toLowerCase().replace(/\s+/g, ' ');
  if (normalized === '/jules retry') {
    return 'retry';
  }
  if (normalized === '/jules requeue') {
    return 'requeue';
  }

  return null;
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