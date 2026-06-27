'use strict';

/**
 * db.js — Postgres connection pool with JSON-file fallback for local demo mode.
 *
 * When DATABASE_URL is set, all operations use Postgres via the `pg` package.
 * When DATABASE_URL is absent, the module exports null and callers must fall
 * back to the JSON store (store.js handles this transparently).
 */

const DB_URL = process.env.DATABASE_URL || '';

/** @type {import('pg').Pool | null} */
let pool = null;

/**
 * Returns the active Postgres pool, or null when running in demo/JSON mode.
 * The pool is created lazily on first call so that the module can be safely
 * required even when `pg` is not installed (e.g. in tests that mock the DB).
 *
 * @returns {import('pg').Pool | null}
 */
function getPool() {
  if (!DB_URL) {
    return null;
  }

  if (!pool) {
    // Lazy require so the server starts without crashing when pg is not installed
    // and DATABASE_URL is not set.
    let pg;
    try {
      pg = require('pg');
    } catch {
      console.warn('[db] pg package not installed — falling back to JSON store');
      return null;
    }

    pool = new pg.Pool({
      connectionString: DB_URL,
      ssl: DB_URL.includes('sslmode=require') || process.env.PGSSLMODE === 'require'
        ? { rejectUnauthorized: false }
        : undefined,
      max: Number(process.env.PG_POOL_MAX || 10),
      idleTimeoutMillis: 30_000,
      connectionTimeoutMillis: 5_000,
    });

    pool.on('error', (err) => {
      console.error('[db] Unexpected pool error:', err.message);
    });

    console.log('[db] Postgres pool initialised');
  }

  return pool;
}

/**
 * Execute a parameterised query and return all rows.
 *
 * @param {string} text     SQL with $1 … $n placeholders
 * @param {any[]}  [params] Query parameters
 * @returns {Promise<any[]>}
 */
async function query(text, params) {
  const p = getPool();
  if (!p) {
    throw new Error('Postgres is not configured. Set DATABASE_URL to enable durable storage.');
  }
  const start = Date.now();
  const result = await p.query(text, params);
  const duration = Date.now() - start;
  if (process.env.PG_LOG_QUERIES === 'true') {
    console.log('[db] query', { text, duration, rows: result.rowCount });
  }
  return result.rows;
}

/**
 * Execute a parameterised query and return the first row, or null.
 *
 * @param {string} text
 * @param {any[]}  [params]
 * @returns {Promise<any | null>}
 */
async function queryOne(text, params) {
  const rows = await query(text, params);
  return rows[0] ?? null;
}

/**
 * Run a function inside a transaction. Rolls back automatically on error.
 *
 * @param {(client: import('pg').PoolClient) => Promise<T>} fn
 * @returns {Promise<T>}
 * @template T
 */
async function withTransaction(fn) {
  const p = getPool();
  if (!p) {
    throw new Error('Postgres is not configured.');
  }
  const client = await p.connect();
  try {
    await client.query('BEGIN');
    const result = await fn(client);
    await client.query('COMMIT');
    return result;
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

/**
 * Return true when Postgres is configured and reachable.
 *
 * @returns {Promise<boolean>}
 */
async function isHealthy() {
  const p = getPool();
  if (!p) {
    return false;
  }
  try {
    await p.query('SELECT 1');
    return true;
  } catch {
    return false;
  }
}

/**
 * Close the connection pool gracefully (useful in tests and graceful shutdown).
 *
 * @returns {Promise<void>}
 */
async function close() {
  if (pool) {
    await pool.end();
    pool = null;
  }
}

module.exports = { getPool, query, queryOne, withTransaction, isHealthy, close };
