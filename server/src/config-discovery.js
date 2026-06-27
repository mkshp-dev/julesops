'use strict';

/**
 * config-discovery.js — Fetch and parse .github/julesops.yml from a repository
 * via the GitHub Contents API, using an installation access token.
 *
 * On success, persists the config snapshot and SHA to the repositories table.
 * Marks the repository as configured = true if a valid config is found,
 * or configured = false if the file is absent or unparseable.
 *
 * Usage:
 *   const { discoverRepoConfig } = require('./config-discovery');
 *   const result = await discoverRepoConfig(installationId, 'owner', 'repo');
 */

const db = require('./db');
const { createInstallationClient } = require('./github-auth');

// CONFIG_PATH is the well-known location of the JulesOps config file.
const CONFIG_PATH = '.github/julesops.yml';

// ─── YAML parser (built-in; no external dependency) ──────────────────────────

/**
 * Minimal YAML parser sufficient for the JulesOps config schema.
 *
 * Supports:
 *   - top-level and nested key: value pairs
 *   - block sequences (- item)
 *   - quoted and unquoted scalar values
 *   - boolean coercion (true/false/yes/no)
 *   - numeric coercion
 *   - comments (# …)
 *   - empty / null values
 *
 * Does NOT support anchors, multi-line strings, or flow style.
 * For production, replace with the `js-yaml` package.
 *
 * @param {string} text YAML source
 * @returns {object}
 */
function parseYaml(text) {
  const lines = text
    .split('\n')
    .map((l) => l.replace(/#[^'"]*$/, '').trimEnd()); // strip inline comments

  const root = {};
  const stack = [{ indent: -1, obj: root }];

  function top() {
    return stack[stack.length - 1];
  }

  function coerce(val) {
    if (val === '' || val === 'null' || val === '~') return null;
    if (val === 'true' || val === 'yes') return true;
    if (val === 'false' || val === 'no') return false;
    if (/^-?\d+$/.test(val)) return Number(val);
    if (/^-?\d+\.\d+$/.test(val)) return Number(val);
    // Strip surrounding quotes
    if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
      return val.slice(1, -1);
    }
    return val;
  }

  for (const rawLine of lines) {
    if (rawLine.trim() === '' || rawLine.trim().startsWith('#')) continue;

    const indent = rawLine.search(/\S/);

    // Pop stack back to the correct level
    while (stack.length > 1 && indent <= top().indent) {
      stack.pop();
    }

    const line = rawLine.trim();

    // Block sequence item
    if (line.startsWith('- ')) {
      const val = coerce(line.slice(2).trim());
      const parent = top().obj;
      const parentKey = top().listKey;
      if (parentKey && Array.isArray(parent[parentKey])) {
        parent[parentKey].push(val);
      }
      continue;
    }

    // Key: value pair
    const colonIdx = line.indexOf(':');
    if (colonIdx === -1) continue;

    const key = line.slice(0, colonIdx).trim();
    const rest = line.slice(colonIdx + 1).trim();

    const parent = top().obj;

    if (rest === '' || rest === '|' || rest === '>') {
      // Nested mapping or sequence follows
      const child = {};
      parent[key] = child;
      stack.push({ indent, obj: child, listKey: null });
    } else if (rest === '[]') {
      parent[key] = [];
    } else {
      parent[key] = coerce(rest);
    }

    // Prime the stack for potential sequence items under this key
    if (Array.isArray(parent[key])) {
      top().listKey = key;
    }
  }

  return root;
}

// ─── Config schema validator ──────────────────────────────────────────────────

/**
 * Validate the parsed JulesOps config object.
 * Returns an object with `valid: boolean` and `errors: string[]`.
 *
 * @param {object} config
 * @returns {{ valid: boolean, errors: string[] }}
 */
function validateConfig(config) {
  const errors = [];

  if (!config || typeof config !== 'object') {
    return { valid: false, errors: ['config must be a YAML mapping'] };
  }

  // jules section is required
  if (!config.jules || typeof config.jules !== 'object') {
    errors.push('missing required "jules" section');
  }

  // labels section is required
  if (!config.labels || typeof config.labels !== 'object') {
    errors.push('missing required "labels" section');
  }

  return { valid: errors.length === 0, errors };
}

// ─── Postgres helper ──────────────────────────────────────────────────────────

/**
 * Persist config snapshot and mark repository as configured/unconfigured.
 *
 * @param {string}  fullName       "owner/repo"
 * @param {object|null} config     Parsed config (null if file absent/invalid)
 * @param {string|null} sha        File SHA from GitHub API
 * @param {boolean} configured
 */
async function saveConfigSnapshot(fullName, config, sha, configured) {
  const pool = db.getPool();
  if (!pool) {
    console.log(
      `[config-discovery] JSON-file mode: skipping config snapshot for ${fullName} (configured=${configured})`,
    );
    return;
  }

  await db.query(
    `UPDATE repositories
        SET config_snapshot = $1, config_version = $2, configured = $3, updated_at = NOW()
      WHERE full_name = $4`,
    [config ? JSON.stringify(config) : null, sha || null, configured, fullName],
  );
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * @typedef {object} DiscoveryResult
 * @property {string}       fullName     "owner/repo"
 * @property {boolean}      configured   Whether a valid config was found
 * @property {object|null}  config       Parsed config object (null if not found)
 * @property {string|null}  sha          File SHA at time of fetch
 * @property {string[]}     errors       Validation errors (empty if configured)
 * @property {string}       source       'github-api' | 'not-found' | 'parse-error'
 */

/**
 * Fetch, parse, and persist the JulesOps config for a repository.
 *
 * @param {number} installationId  GitHub installation ID
 * @param {string} owner           Repository owner login
 * @param {string} repo            Repository name
 * @returns {Promise<DiscoveryResult>}
 */
async function discoverRepoConfig(installationId, owner, repo) {
  const fullName = `${owner}/${repo}`;

  let client;
  try {
    client = await createInstallationClient(installationId);
  } catch (err) {
    console.error(`[config-discovery] Cannot create GitHub client for installation ${installationId}:`, err.message);
    return {
      fullName, configured: false, config: null, sha: null,
      errors: [err.message], source: 'auth-error',
    };
  }

  // Fetch the config file from GitHub Contents API
  let fileData;
  try {
    fileData = await client.get(`/repos/${owner}/${repo}/contents/${CONFIG_PATH}`);
  } catch (err) {
    if (err.message && err.message.includes('HTTP 404')) {
      console.log(`[config-discovery] ${fullName}: ${CONFIG_PATH} not found`);
      await saveConfigSnapshot(fullName, null, null, false);
      return { fullName, configured: false, config: null, sha: null, errors: [], source: 'not-found' };
    }
    console.error(`[config-discovery] ${fullName}: GitHub API error:`, err.message);
    return { fullName, configured: false, config: null, sha: null, errors: [err.message], source: 'api-error' };
  }

  // Decode base64 content
  let rawYaml;
  try {
    rawYaml = Buffer.from(fileData.content, 'base64').toString('utf8');
  } catch (err) {
    console.error(`[config-discovery] ${fullName}: failed to decode file content:`, err.message);
    await saveConfigSnapshot(fullName, null, fileData.sha, false);
    return { fullName, configured: false, config: null, sha: fileData.sha, errors: ['base64 decode failed'], source: 'parse-error' };
  }

  // Parse YAML
  let parsed;
  try {
    parsed = parseYaml(rawYaml);
  } catch (err) {
    console.error(`[config-discovery] ${fullName}: YAML parse error:`, err.message);
    await saveConfigSnapshot(fullName, null, fileData.sha, false);
    return { fullName, configured: false, config: null, sha: fileData.sha, errors: [err.message], source: 'parse-error' };
  }

  const { valid, errors } = validateConfig(parsed);

  await saveConfigSnapshot(fullName, parsed, fileData.sha, valid);

  if (valid) {
    console.log(`[config-discovery] ${fullName}: config discovered and valid (sha: ${fileData.sha})`);
  } else {
    console.warn(`[config-discovery] ${fullName}: config found but invalid — ${errors.join('; ')}`);
  }

  return {
    fullName,
    configured: valid,
    config: parsed,
    sha: fileData.sha || null,
    errors,
    source: 'github-api',
  };
}

/**
 * Trigger config discovery for all active repositories under an installation.
 * Used after installation.created or when syncing an existing installation.
 *
 * @param {number}   installationId
 * @param {string[]} repoFullNames  Array of "owner/repo" strings
 * @returns {Promise<DiscoveryResult[]>}
 */
async function discoverInstallationConfigs(installationId, repoFullNames) {
  const results = [];
  for (const fullName of repoFullNames) {
    const [owner, repo] = fullName.split('/');
    if (!owner || !repo) continue;
    const result = await discoverRepoConfig(installationId, owner, repo);
    results.push(result);
  }
  return results;
}

module.exports = {
  discoverRepoConfig,
  discoverInstallationConfigs,
  parseYaml,       // exported for unit testing
  validateConfig,  // exported for unit testing
};
