'use strict';

/**
 * session.js — Lightweight in-memory session store with cookie-based session IDs.
 *
 * NOT suitable for multi-process deployments without an external store (e.g. Redis).
 * For a single-process server this is sufficient for the OAuth beta phase.
 *
 * Sessions expire after SESSION_TTL_MS (default 24 hours).
 * A GC sweep runs every 15 minutes to evict stale sessions.
 *
 * Environment variables:
 *   SESSION_TTL_MS    — session lifetime in ms (default: 86400000 = 24h)
 *   SESSION_COOKIE    — cookie name (default: julesops_sid)
 *   SESSION_SECRET    — used to sign session IDs (required in production)
 *   NODE_ENV          — if 'production', cookie is Secure + SameSite=Strict
 */

const crypto = require('crypto');

const COOKIE_NAME = process.env.SESSION_COOKIE || 'julesops_sid';
const TTL_MS = Number(process.env.SESSION_TTL_MS || 86_400_000); // 24h
const SESSION_SECRET = process.env.SESSION_SECRET || '';
const IS_PROD = process.env.NODE_ENV === 'production';

if (!SESSION_SECRET && IS_PROD) {
  console.warn('[session] WARNING: SESSION_SECRET is not set in production. Sessions are not cryptographically signed.');
}

// ─── In-memory store ──────────────────────────────────────────────────────────

/** @type {Map<string, { data: object, expiresAt: number }>} */
const sessions = new Map();

/**
 * Generate a cryptographically random session ID (32 bytes → 64 hex chars).
 *
 * @returns {string}
 */
function generateSessionId() {
  return crypto.randomBytes(32).toString('hex');
}

/**
 * Create and persist a new session.
 *
 * @param {object} data  Initial session data (e.g. { userId, githubLogin })
 * @returns {string} Session ID
 */
function createSession(data) {
  const id = generateSessionId();
  sessions.set(id, { data: { ...data }, expiresAt: Date.now() + TTL_MS });
  return id;
}

/**
 * Look up a session by ID. Returns the session data object or null.
 *
 * @param {string} id
 * @returns {object|null}
 */
function getSession(id) {
  if (!id) return null;
  const entry = sessions.get(id);
  if (!entry) return null;
  if (Date.now() > entry.expiresAt) {
    sessions.delete(id);
    return null;
  }
  // Slide expiry on access
  entry.expiresAt = Date.now() + TTL_MS;
  return entry.data;
}

/**
 * Update a session's data by merging partial data.
 *
 * @param {string} id
 * @param {object} patch
 */
function updateSession(id, patch) {
  const entry = sessions.get(id);
  if (entry) {
    Object.assign(entry.data, patch);
  }
}

/**
 * Destroy a session (logout).
 *
 * @param {string} id
 */
function destroySession(id) {
  sessions.delete(id);
}

// ─── Cookie helpers ───────────────────────────────────────────────────────────

/**
 * Parse the Cookie header into a key/value map.
 *
 * @param {string} header
 * @returns {Record<string, string>}
 */
function parseCookies(header) {
  const result = {};
  if (!header) return result;
  for (const part of header.split(';')) {
    const [name, ...rest] = part.trim().split('=');
    if (name) result[name.trim()] = decodeURIComponent(rest.join('=').trim());
  }
  return result;
}

/**
 * Build a Set-Cookie header value.
 *
 * @param {string} name
 * @param {string} value
 * @param {{ maxAge?: number, httpOnly?: boolean, secure?: boolean, sameSite?: string, path?: string }} opts
 * @returns {string}
 */
function buildSetCookie(name, value, opts = {}) {
  const parts = [`${name}=${encodeURIComponent(value)}`];
  if (opts.maxAge != null) parts.push(`Max-Age=${opts.maxAge}`);
  if (opts.path) parts.push(`Path=${opts.path}`);
  if (opts.httpOnly) parts.push('HttpOnly');
  if (opts.secure) parts.push('Secure');
  if (opts.sameSite) parts.push(`SameSite=${opts.sameSite}`);
  return parts.join('; ');
}

/**
 * Read the session ID from the Cookie header.
 *
 * @param {import('http').IncomingMessage} req
 * @returns {string|null}
 */
function readSessionId(req) {
  const cookies = parseCookies(req.headers.cookie || '');
  return cookies[COOKIE_NAME] || null;
}

/**
 * Write a Set-Cookie header on the response.
 *
 * @param {import('http').ServerResponse} res
 * @param {string} sessionId
 */
function writeSessionCookie(res, sessionId) {
  res.setHeader('set-cookie', buildSetCookie(COOKIE_NAME, sessionId, {
    maxAge: Math.floor(TTL_MS / 1000),
    path: '/',
    httpOnly: true,
    secure: IS_PROD,
    sameSite: IS_PROD ? 'Strict' : 'Lax',
  }));
}

/**
 * Clear the session cookie (logout).
 *
 * @param {import('http').ServerResponse} res
 */
function clearSessionCookie(res) {
  res.setHeader('set-cookie', buildSetCookie(COOKIE_NAME, '', {
    maxAge: 0,
    path: '/',
    httpOnly: true,
    secure: IS_PROD,
    sameSite: IS_PROD ? 'Strict' : 'Lax',
  }));
}

// ─── Express-style middleware ─────────────────────────────────────────────────

/**
 * Session middleware.
 * Attaches `req.session` (or null) and `req.sessionId` to each request.
 *
 * @param {import('http').IncomingMessage} req
 * @param {import('http').ServerResponse}  res
 */
function sessionMiddleware(req, res) {
  const sid = readSessionId(req);
  req.sessionId = sid;
  req.session = sid ? getSession(sid) : null;
}

// ─── Garbage collection ───────────────────────────────────────────────────────

const GC_INTERVAL_MS = 15 * 60 * 1000; // 15 minutes

function gcSessions() {
  const now = Date.now();
  let removed = 0;
  for (const [id, entry] of sessions) {
    if (now > entry.expiresAt) {
      sessions.delete(id);
      removed += 1;
    }
  }
  if (removed > 0) {
    console.log(`[session] GC: removed ${removed} expired session(s). Active: ${sessions.size}`);
  }
}

const gcTimer = setInterval(gcSessions, GC_INTERVAL_MS);
if (gcTimer.unref) gcTimer.unref(); // Don't keep the event loop alive

module.exports = {
  createSession,
  getSession,
  updateSession,
  destroySession,
  sessionMiddleware,
  readSessionId,
  writeSessionCookie,
  clearSessionCookie,
  parseCookies,
  // Exposed for testing
  _sessions: sessions,
};
