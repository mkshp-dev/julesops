#!/usr/bin/env node
'use strict';

/**
 * migrate.js — Migration runner for JulesOps server.
 *
 * Usage:
 *   DATABASE_URL=postgres://... node scripts/migrate.js
 *
 * Reads all *.sql files from server/migrations/ in alphabetical order,
 * skips migrations already recorded in the _migrations table, and applies
 * the remainder inside individual transactions.
 *
 * Safe to run multiple times (idempotent).
 */

const fs = require('fs');
const path = require('path');

const DB_URL = process.env.DATABASE_URL;

if (!DB_URL) {
  console.error('[migrate] ERROR: DATABASE_URL environment variable is not set.');
  console.error('[migrate] Set DATABASE_URL to a Postgres connection string and re-run.');
  console.error('[migrate] Example: DATABASE_URL=postgres://user:pass@localhost:5432/julesops node scripts/migrate.js');
  process.exit(1);
}

let pg;
try {
  pg = require('pg');
} catch {
  console.error('[migrate] ERROR: pg package is not installed. Run: npm install');
  process.exit(1);
}

const MIGRATIONS_DIR = path.join(__dirname, '..', 'migrations');

async function run() {
  const client = new pg.Client({ connectionString: DB_URL });

  try {
    await client.connect();
    console.log('[migrate] Connected to Postgres');

    // Ensure the _migrations tracking table exists.
    await client.query(`
      CREATE TABLE IF NOT EXISTS _migrations (
        id         SERIAL PRIMARY KEY,
        name       TEXT NOT NULL UNIQUE,
        applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);

    // Read already-applied migration names.
    const { rows: applied } = await client.query('SELECT name FROM _migrations ORDER BY id');
    const appliedNames = new Set(applied.map((r) => r.name));

    // Collect migration files sorted alphabetically.
    let files;
    try {
      files = fs.readdirSync(MIGRATIONS_DIR)
        .filter((f) => f.endsWith('.sql'))
        .sort();
    } catch (err) {
      console.error(`[migrate] ERROR: Cannot read migrations directory (${MIGRATIONS_DIR}):`, err.message);
      process.exit(1);
    }

    if (files.length === 0) {
      console.log('[migrate] No migration files found.');
      return;
    }

    let appliedCount = 0;
    let skippedCount = 0;

    for (const file of files) {
      if (appliedNames.has(file)) {
        console.log(`[migrate] SKIP  ${file} (already applied)`);
        skippedCount += 1;
        continue;
      }

      const sqlPath = path.join(MIGRATIONS_DIR, file);
      const sql = fs.readFileSync(sqlPath, 'utf8');

      console.log(`[migrate] APPLY ${file} …`);

      try {
        await client.query('BEGIN');
        await client.query(sql);
        await client.query('INSERT INTO _migrations (name) VALUES ($1)', [file]);
        await client.query('COMMIT');
        console.log(`[migrate] DONE  ${file}`);
        appliedCount += 1;
      } catch (err) {
        await client.query('ROLLBACK');
        console.error(`[migrate] FAIL  ${file}:`, err.message);
        process.exit(1);
      }
    }

    console.log(`\n[migrate] Complete. Applied: ${appliedCount}, Skipped: ${skippedCount}`);
  } finally {
    await client.end();
  }
}

run().catch((err) => {
  console.error('[migrate] Unexpected error:', err);
  process.exit(1);
});
