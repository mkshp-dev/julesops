'use strict';

/**
 * oauth.js — GitHub OAuth 2.0 login flow.
 *
 * Implements the server-side of GitHub's OAuth web application flow:
 *   1. GET /auth/github       → redirect to GitHub
 *   2. GET /auth/github/callback → exchange code → create session
 *
 * Environment variables required:
 *   GITHUB_OAUTH_CLIENT_ID      — OAuth App client ID
 *   GITHUB_OAUTH_CLIENT_SECRET  — OAuth App client secret
 *   OAUTH_REDIRECT_URI          — Callback URL (default: http://HOST:PORT/auth/github/callback)
 *
 * On successful login, the session gains:
 *   { githubId, githubLogin, githubName, githubAvatarUrl, accessToken }
 *
 * The user record is persisted to Postgres (if available) or logged only.
 */

const https = require('https');
const crypto = require('crypto');

const db = require('./db');
const {
  createSession,
  destroySession,
  writeSessionCookie,
  clearSessionCookie,
} = require('./session');

const CLIENT_ID = process.env.GITHUB_OAUTH_CLIENT_ID || '';
const CLIENT_SECRET = process.env.GITHUB_OAUTH_CLIENT_SECRET || '';

// In-flight state tokens: { state → { redirectTo, expiresAt } }
const pendingStates = new Map();
const STATE_TTL_MS = 10 * 60 * 1000; // 10 minutes

// ─── HTTPS helpers ────────────────────────────────────────────────────────────

function githubPost(path, body, headers = {}) {
  return new Promise((resolve, reject) => {
    const payload = new URLSearchParams(body).toString();
    const req = https.request(
      {
        hostname: 'github.com',
        path,
        method: 'POST',
        headers: {
          accept: 'application/json',
          'content-type': 'application/x-www-form-urlencoded',
          'content-length': Buffer.byteLength(payload),
          'user-agent': 'JulesOps-Server/0.2',
          ...headers,
        },
      },
      (res) => {
        const chunks = [];
        res.on('data', c => chunks.push(c));
        res.on('end', () => {
          const raw = Buffer.concat(chunks).toString('utf8');
          try { resolve({ status: res.statusCode, data: JSON.parse(raw) }); }
          catch { resolve({ status: res.statusCode, data: { raw } }); }
        });
      },
    );
    req.on('error', reject);
    req.write(payload);
    req.end();
  });
}

function githubGet(path, token) {
  return new Promise((resolve, reject) => {
    const req = https.request(
      {
        hostname: 'api.github.com',
        path,
        method: 'GET',
        headers: {
          accept: 'application/vnd.github+json',
          authorization: `Bearer ${token}`,
          'x-github-api-version': '2022-11-28',
          'user-agent': 'JulesOps-Server/0.2',
        },
      },
      (res) => {
        const chunks = [];
        res.on('data', c => chunks.push(c));
        res.on('end', () => {
          const raw = Buffer.concat(chunks).toString('utf8');
          try { resolve({ status: res.statusCode, data: JSON.parse(raw) }); }
          catch { resolve({ status: res.statusCode, data: { raw } }); }
        });
      },
    );
    req.on('error', reject);
    req.end();
  });
}

// ─── User persistence ─────────────────────────────────────────────────────────

/**
 * Upsert a GitHub user into the users table.
 *
 * @param {{ githubId, login, name, email, avatarUrl }} user
 * @returns {Promise<object|null>}
 */
async function upsertUser(user) {
  const pool = db.getPool();
  if (!pool) {
    console.log(`[oauth] JSON-file mode: skipping DB upsert for user ${user.login}`);
    return null;
  }

  return db.queryOne(
    `INSERT INTO users (github_id, login, name, email, avatar_url, updated_at)
     VALUES ($1, $2, $3, $4, $5, NOW())
     ON CONFLICT (github_id) DO UPDATE
       SET login = EXCLUDED.login, name = EXCLUDED.name,
           email = EXCLUDED.email, avatar_url = EXCLUDED.avatar_url, updated_at = NOW()
     RETURNING *`,
    [user.githubId, user.login, user.name || null, user.email || null, user.avatarUrl || null],
  );
}

// ─── CSRF state helpers ───────────────────────────────────────────────────────

function createOAuthState(redirectTo = '/') {
  const state = crypto.randomBytes(16).toString('hex');
  pendingStates.set(state, { redirectTo, expiresAt: Date.now() + STATE_TTL_MS });
  return state;
}

function consumeOAuthState(state) {
  const entry = pendingStates.get(state);
  if (!entry) return null;
  pendingStates.delete(state);
  if (Date.now() > entry.expiresAt) return null;
  return entry;
}

// ─── Route handlers ───────────────────────────────────────────────────────────

/**
 * GET /auth/github — Redirect to GitHub OAuth authorization page.
 *
 * @param {import('http').IncomingMessage} req
 * @param {import('http').ServerResponse}  res
 */
function handleOAuthStart(req, res) {
  if (!CLIENT_ID) {
    res.writeHead(503, { 'content-type': 'text/plain' });
    res.end('GitHub OAuth is not configured. Set GITHUB_OAUTH_CLIENT_ID.');
    return;
  }

  const url = new URL(req.url, `http://${req.headers.host}`);
  const redirectTo = url.searchParams.get('redirect_to') || '/';
  const state = createOAuthState(redirectTo);

  const params = new URLSearchParams({
    client_id: CLIENT_ID,
    scope: 'read:user read:org',
    state,
  });

  res.writeHead(302, { location: `https://github.com/login/oauth/authorize?${params}` });
  res.end();
}

/**
 * GET /auth/github/callback — Handle OAuth callback from GitHub.
 *
 * @param {import('http').IncomingMessage} req
 * @param {import('http').ServerResponse}  res
 */
async function handleOAuthCallback(req, res) {
  const url = new URL(req.url, `http://${req.headers.host}`);
  const code = url.searchParams.get('code');
  const state = url.searchParams.get('state');
  const error = url.searchParams.get('error');

  if (error) {
    res.writeHead(400, { 'content-type': 'text/plain' });
    res.end(`GitHub OAuth error: ${error}`);
    return;
  }

  // Validate CSRF state
  const stateEntry = consumeOAuthState(state);
  if (!stateEntry) {
    res.writeHead(400, { 'content-type': 'text/plain' });
    res.end('Invalid or expired OAuth state. Please try logging in again.');
    return;
  }

  if (!code) {
    res.writeHead(400, { 'content-type': 'text/plain' });
    res.end('Missing OAuth code.');
    return;
  }

  // Exchange code for access token
  let accessToken;
  try {
    const { status, data } = await githubPost('/login/oauth/access_token', {
      client_id: CLIENT_ID,
      client_secret: CLIENT_SECRET,
      code,
    });

    if (status !== 200 || !data.access_token) {
      throw new Error(data.error_description || data.error || `GitHub returned HTTP ${status}`);
    }

    accessToken = data.access_token;
  } catch (err) {
    console.error('[oauth] Token exchange failed:', err.message);
    res.writeHead(502, { 'content-type': 'text/plain' });
    res.end(`OAuth token exchange failed: ${err.message}`);
    return;
  }

  // Fetch GitHub user profile
  let githubUser;
  try {
    const { status, data } = await githubGet('/user', accessToken);
    if (status !== 200) throw new Error(`GitHub /user returned HTTP ${status}`);
    githubUser = data;
  } catch (err) {
    console.error('[oauth] User fetch failed:', err.message);
    res.writeHead(502, { 'content-type': 'text/plain' });
    res.end(`Failed to fetch GitHub user profile: ${err.message}`);
    return;
  }

  // Persist user
  await upsertUser({
    githubId: githubUser.id,
    login: githubUser.login,
    name: githubUser.name,
    email: githubUser.email,
    avatarUrl: githubUser.avatar_url,
  });

  // Create session
  const sessionId = createSession({
    githubId: githubUser.id,
    githubLogin: githubUser.login,
    githubName: githubUser.name,
    githubAvatarUrl: githubUser.avatar_url,
    // NOTE: access token stored in session only — not persisted to DB
    accessToken,
  });

  writeSessionCookie(res, sessionId);

  console.log(`[oauth] User logged in: ${githubUser.login} (id: ${githubUser.id})`);

  res.writeHead(302, { location: stateEntry.redirectTo || '/' });
  res.end();
}

/**
 * GET /auth/logout — Destroy session and redirect to /.
 *
 * @param {import('http').IncomingMessage} req
 * @param {import('http').ServerResponse}  res
 */
function handleLogout(req, res) {
  if (req.sessionId) {
    destroySession(req.sessionId);
  }
  clearSessionCookie(res);
  res.writeHead(302, { location: '/' });
  res.end();
}

module.exports = {
  handleOAuthStart,
  handleOAuthCallback,
  handleLogout,
  upsertUser,
};
