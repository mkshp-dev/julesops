'use strict';

/**
 * github-auth.js — GitHub App authentication helpers.
 *
 * Provides:
 *   - generateJWT(appId, privateKey)           → signed App JWT (valid 10 min)
 *   - getInstallationToken(appId, key, instId) → short-lived installation token
 *   - createGitHubClient(token)                → thin GitHub API wrapper
 *
 * No external JWT library is required; the JWT is built manually using
 * Node's built-in `crypto` module (RS256 / RSASSA-PKCS1-v1_5).
 *
 * Environment variables consumed:
 *   GITHUB_APP_ID          — numeric App ID (required for App auth)
 *   GITHUB_PRIVATE_KEY     — PEM private key, newlines may be escaped as \n
 *   GITHUB_PRIVATE_KEY_PATH — alternative: path to PEM file on disk
 */

const crypto = require('crypto');
const fs = require('fs');
const https = require('https');

// ─── JWT helpers (manual RS256, no external dependency) ──────────────────────

/**
 * Base64url-encode a Buffer or string.
 *
 * @param {Buffer|string} input
 * @returns {string}
 */
function base64url(input) {
  const buf = Buffer.isBuffer(input) ? input : Buffer.from(input, 'utf8');
  return buf.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');
}

/**
 * Generate a GitHub App JWT.
 *
 * @param {string|number} appId     GitHub App numeric ID
 * @param {string}        privateKey PEM-encoded RSA private key
 * @returns {string} Signed JWT (valid for 10 minutes)
 */
function generateJWT(appId, privateKey) {
  const now = Math.floor(Date.now() / 1000);
  const header = base64url(JSON.stringify({ alg: 'RS256', typ: 'JWT' }));
  const payload = base64url(
    JSON.stringify({
      iat: now - 60,      // issued 60 s in the past to guard against clock skew
      exp: now + 9 * 60,  // expires in 9 minutes (GitHub max is 10)
      iss: String(appId),
    }),
  );

  const signingInput = `${header}.${payload}`;
  const sign = crypto.createSign('RSA-SHA256');
  sign.update(signingInput);
  const signature = base64url(sign.sign(privateKey));

  return `${signingInput}.${signature}`;
}

// ─── Private key loader ───────────────────────────────────────────────────────

/**
 * Load the GitHub App private key from environment or file.
 *
 * Checks (in order):
 *   1. GITHUB_PRIVATE_KEY env var (raw PEM; \n may be literal escape sequences)
 *   2. GITHUB_PRIVATE_KEY_PATH env var (path to .pem file)
 *
 * @returns {string} PEM string
 * @throws  {Error}  If no key source is configured
 */
function loadPrivateKey() {
  const envKey = process.env.GITHUB_PRIVATE_KEY;
  if (envKey) {
    // Support keys stored in env with escaped newlines (common in CI/CD)
    return envKey.includes('\\n') ? envKey.replace(/\\n/g, '\n') : envKey;
  }

  const keyPath = process.env.GITHUB_PRIVATE_KEY_PATH;
  if (keyPath) {
    return fs.readFileSync(keyPath, 'utf8');
  }

  throw new Error(
    'GitHub App private key not configured. ' +
    'Set GITHUB_PRIVATE_KEY (PEM string) or GITHUB_PRIVATE_KEY_PATH (path to .pem file).',
  );
}

// ─── GitHub HTTPS helper ──────────────────────────────────────────────────────

const GITHUB_API_BASE = 'https://api.github.com';
const USER_AGENT = `JulesOps-Server/0.2 (Node.js ${process.version})`;

/**
 * Make a GitHub API request.
 *
 * @param {string} method   HTTP method
 * @param {string} pathname API path (e.g. '/app/installations/123/access_tokens')
 * @param {object} [body]   JSON request body
 * @param {string} token    Authorization token (JWT or installation token)
 * @returns {Promise<{ status: number, data: any }>}
 */
function githubRequest(method, pathname, body, token) {
  return new Promise((resolve, reject) => {
    const url = new URL(pathname, GITHUB_API_BASE);
    const bodyBuffer = body ? Buffer.from(JSON.stringify(body)) : null;

    const req = https.request(
      {
        hostname: url.hostname,
        path: url.pathname + url.search,
        method,
        headers: {
          'user-agent': USER_AGENT,
          accept: 'application/vnd.github+json',
          'x-github-api-version': '2022-11-28',
          authorization: `Bearer ${token}`,
          ...(bodyBuffer
            ? { 'content-type': 'application/json', 'content-length': bodyBuffer.length }
            : {}),
        },
      },
      (res) => {
        const chunks = [];
        res.on('data', (c) => chunks.push(c));
        res.on('end', () => {
          const raw = Buffer.concat(chunks).toString('utf8');
          let data;
          try {
            data = raw ? JSON.parse(raw) : {};
          } catch {
            data = { raw };
          }
          resolve({ status: res.statusCode, data });
        });
      },
    );

    req.on('error', reject);
    if (bodyBuffer) req.write(bodyBuffer);
    req.end();
  });
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Exchange a GitHub App JWT for a short-lived installation access token.
 *
 * @param {string|number} appId          GitHub App ID
 * @param {string}        privateKey     PEM private key
 * @param {number}        installationId GitHub installation ID
 * @returns {Promise<{ token: string, expiresAt: string }>}
 */
async function getInstallationToken(appId, privateKey, installationId) {
  const jwt = generateJWT(appId, privateKey);
  const { status, data } = await githubRequest(
    'POST',
    `/app/installations/${installationId}/access_tokens`,
    {},
    jwt,
  );

  if (status !== 201) {
    throw new Error(
      `Failed to get installation token for installation ${installationId}: ` +
      `HTTP ${status} — ${JSON.stringify(data)}`,
    );
  }

  return {
    token: data.token,
    expiresAt: data.expires_at,
  };
}

/**
 * Create a thin GitHub API client for a given installation.
 * Automatically fetches and caches the installation token.
 *
 * @param {number} installationId
 * @returns {Promise<GitHubClient>}
 */
async function createInstallationClient(installationId) {
  const appId = process.env.GITHUB_APP_ID;
  if (!appId) {
    throw new Error('GITHUB_APP_ID is not set.');
  }
  const privateKey = loadPrivateKey();
  const { token, expiresAt } = await getInstallationToken(appId, privateKey, installationId);
  return createGitHubClient(token, expiresAt);
}

/**
 * @typedef {object} GitHubClient
 * @property {string} token
 * @property {string} expiresAt
 * @property {(pathname: string) => Promise<any>}           get
 * @property {(pathname: string, body: object) => Promise<any>} post
 */

/**
 * Create a GitHub API client from an already-known token.
 *
 * @param {string} token
 * @param {string} [expiresAt]
 * @returns {GitHubClient}
 */
function createGitHubClient(token, expiresAt) {
  return {
    token,
    expiresAt: expiresAt || null,

    async get(pathname) {
      const { status, data } = await githubRequest('GET', pathname, null, token);
      if (status >= 400) {
        throw new Error(`GitHub GET ${pathname} failed: HTTP ${status} — ${JSON.stringify(data)}`);
      }
      return data;
    },

    async post(pathname, body) {
      const { status, data } = await githubRequest('POST', pathname, body, token);
      if (status >= 400) {
        throw new Error(`GitHub POST ${pathname} failed: HTTP ${status} — ${JSON.stringify(data)}`);
      }
      return data;
    },
  };
}

/**
 * Create a client authenticated as the GitHub App itself (not an installation).
 * Useful for listing installations, getting App metadata, etc.
 *
 * @returns {GitHubClient}
 */
function createAppClient() {
  const appId = process.env.GITHUB_APP_ID;
  if (!appId) {
    throw new Error('GITHUB_APP_ID is not set.');
  }
  const privateKey = loadPrivateKey();
  const jwt = generateJWT(appId, privateKey);
  return createGitHubClient(jwt);
}

module.exports = {
  generateJWT,
  loadPrivateKey,
  getInstallationToken,
  createInstallationClient,
  createGitHubClient,
  createAppClient,
};
