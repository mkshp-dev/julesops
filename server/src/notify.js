'use strict';

/**
 * notify.js — Generic notification dispatcher.
 *
 * Supports:
 *   - webhook: HTTP POST with JSON payload to any URL
 *   - slack:   Slack incoming webhook (same as webhook but with Slack message shape)
 *   - email:   Placeholder (logs to console; wire up SendGrid/SES later)
 *
 * All send functions return { ok: boolean, error?: string }.
 */

const https = require('https');
const http = require('http');

// ─── HTTP POST helper ─────────────────────────────────────────────────────────

/**
 * POST a JSON body to a URL.
 *
 * @param {string} url
 * @param {object} payload
 * @param {number} [timeoutMs=5000]
 * @returns {Promise<{ ok: boolean, status?: number, error?: string }>}
 */
function postJson(url, payload, timeoutMs = 5000) {
  return new Promise((resolve) => {
    let parsed;
    try {
      parsed = new URL(url);
    } catch (err) {
      resolve({ ok: false, error: `Invalid URL: ${url}` });
      return;
    }

    const body = JSON.stringify(payload);
    const lib = parsed.protocol === 'https:' ? https : http;

    const req = lib.request(
      {
        hostname: parsed.hostname,
        port: parsed.port || undefined,
        path: parsed.pathname + parsed.search,
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'content-length': Buffer.byteLength(body),
          'user-agent': 'JulesOps-AlertWorker/0.2',
        },
        timeout: timeoutMs,
      },
      (res) => {
        const chunks = [];
        res.on('data', c => chunks.push(c));
        res.on('end', () => {
          resolve({ ok: res.statusCode >= 200 && res.statusCode < 300, status: res.statusCode });
        });
      },
    );

    req.on('timeout', () => {
      req.destroy();
      resolve({ ok: false, error: 'request timed out' });
    });

    req.on('error', (err) => {
      resolve({ ok: false, error: err.message });
    });

    req.write(body);
    req.end();
  });
}

// ─── Destination dispatchers ──────────────────────────────────────────────────

/**
 * Send a generic webhook notification.
 *
 * @param {object} destination  { url }
 * @param {object} alert        Alert payload
 */
async function sendWebhook(destination, alert) {
  if (!destination.url) return { ok: false, error: 'destination.url is required' };
  return postJson(destination.url, alert);
}

/**
 * Send a Slack-compatible incoming webhook message.
 *
 * @param {object} destination  { url }
 * @param {object} alert        Alert payload
 */
async function sendSlack(destination, alert) {
  if (!destination.url) return { ok: false, error: 'destination.url is required' };

  const text = [
    `*JulesOps Alert: ${alert.rule_type}*`,
    alert.message,
    alert.job_url ? `<${alert.job_url}|View Job>` : '',
  ].filter(Boolean).join('\n');

  return postJson(destination.url, { text });
}

/**
 * Send an email notification (placeholder — logs to console).
 *
 * @param {object} destination  { email }
 * @param {object} alert        Alert payload
 */
async function sendEmail(destination, alert) {
  if (!destination.email) return { ok: false, error: 'destination.email is required' };

  // TODO: wire up a real email provider (SendGrid, SES, Resend, etc.)
  console.log(
    `[notify] EMAIL (placeholder) to ${destination.email}: ${alert.rule_type} — ${alert.message}`,
  );
  return { ok: true, note: 'email delivery not yet wired — check server logs' };
}

// ─── Public dispatcher ────────────────────────────────────────────────────────

/**
 * Dispatch an alert to a destination based on its type.
 *
 * @param {{ type: string, url?: string, email?: string }} destination
 * @param {object} alert
 * @returns {Promise<{ ok: boolean, error?: string }>}
 */
async function dispatch(destination, alert) {
  switch (destination.type) {
    case 'webhook': return sendWebhook(destination, alert);
    case 'slack':   return sendSlack(destination, alert);
    case 'email':   return sendEmail(destination, alert);
    default:
      return { ok: false, error: `unknown destination type: ${destination.type}` };
  }
}

module.exports = { dispatch, postJson };
