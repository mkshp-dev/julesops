'use strict';

// Preloaded into every test process (see "test" in package.json). Each test file runs in
// its own process, and each gets a fresh, empty JSON store instead of server/data/store.json.
// The directory is always replaced, because child processes inherit the runner's value.
// Test files that need a specific directory can still set JULESOPS_DATA_DIR themselves.

const fs = require('fs');
const os = require('os');
const path = require('path');

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'julesops-test-'));
process.env.JULESOPS_DATA_DIR = dir;
process.on('exit', () => fs.rmSync(dir, { recursive: true, force: true }));
