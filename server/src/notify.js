'use strict';

const https = require('https');
const http = require('http');

function requestJson(url, payload, options = {}) {
  return new Promise((resolve) => {
    let parsed;
    try {
      parsed = new URL(url);
    } catch {
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
          'user-agent': options.userAgent || 'JulesOps-AlertWorker/0.3',
          ...(options.headers || {}),
        },
        timeout: options.timeoutMs || 5000,
      },
      (res) => {
        const chunks = [];
        res.on('data', (chunk) => chunks.push(chunk));
        res.on('end', () => {
          const responseBody = Buffer.concat(chunks).toString('utf8');
          resolve({
            ok: res.statusCode >= 200 && res.statusCode < 300,
            status: res.statusCode,
            body: responseBody,
          });
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

function sendWebhook(destination, alert) {
  if (!destination.url) return Promise.resolve({ ok: false, error: 'destination.url is required' });
  return requestJson(destination.url, alert);
}

function sendSlack(destination, alert) {
  if (!destination.url) return Promise.resolve({ ok: false, error: 'destination.url is required' });

  const text = [
    `*JulesOps Alert: ${alert.rule_type}*`,
    alert.message,
    alert.job_url ? `<${alert.job_url}|View Job>` : '',
  ].filter(Boolean).join('\n');

  return requestJson(destination.url, { text });
}

function buildSendGridPayload(destination, alert) {
  const fromEmail = process.env.ALERT_EMAIL_FROM || '';
  const fromName = process.env.ALERT_EMAIL_FROM_NAME || 'JulesOps';
  const subjectPrefix = process.env.ALERT_EMAIL_SUBJECT_PREFIX || 'JulesOps Alert';

  return {
    personalizations: [
      {
        to: [{ email: destination.email }],
        subject: `[${subjectPrefix}] ${alert.rule_type.replace(/_/g, ' ')}`,
      },
    ],
    from: {
      email: fromEmail,
      name: fromName,
    },
    reply_to: process.env.ALERT_EMAIL_REPLY_TO
      ? { email: process.env.ALERT_EMAIL_REPLY_TO }
      : undefined,
    content: [
      {
        type: 'text/plain',
        value: [
          alert.message,
          alert.job_url ? `Job: ${alert.job_url}` : null,
          alert.repository ? `Repository: ${alert.repository}` : null,
        ].filter(Boolean).join('\n'),
      },
    ],
  };
}

function emailDemoFallbackEnabled() {
  if (process.env.ALERT_EMAIL_DEMO_FALLBACK === 'false') {
    return false;
  }
  if (process.env.ALERT_EMAIL_DEMO_FALLBACK === 'true') {
    return true;
  }
  return process.env.NODE_ENV !== 'production';
}

async function sendEmail(destination, alert) {
  if (!destination.email) return { ok: false, error: 'destination.email is required' };

  const apiKey = process.env.SENDGRID_API_KEY || '';
  const fromEmail = process.env.ALERT_EMAIL_FROM || '';

  if (!apiKey || !fromEmail) {
    if (!emailDemoFallbackEnabled()) {
      return {
        ok: false,
        error: !apiKey
          ? 'SENDGRID_API_KEY is required for email delivery'
          : 'ALERT_EMAIL_FROM is required for email delivery',
      };
    }

    console.log(
      `[notify] EMAIL (demo fallback) to ${destination.email}: ${alert.rule_type} - ${alert.message}`,
    );
    return { ok: true, note: 'demo fallback used; configure SendGrid for real delivery' };
  }

  const baseUrl = (process.env.SENDGRID_API_BASE_URL || 'https://api.sendgrid.com').replace(/\/+$/, '');
  const payload = buildSendGridPayload(destination, alert);
  const result = await requestJson(`${baseUrl}/v3/mail/send`, payload, {
    headers: {
      authorization: `Bearer ${apiKey}`,
    },
    userAgent: 'JulesOps-AlertWorker/0.3',
  });

  if (!result.ok) {
    return {
      ok: false,
      status: result.status,
      error: result.body
        ? `SendGrid delivery failed with HTTP ${result.status}: ${result.body}`
        : `SendGrid delivery failed with HTTP ${result.status}`,
    };
  }

  return { ok: true, status: result.status };
}

async function dispatch(destination, alert) {
  switch (destination.type) {
    case 'webhook':
      return sendWebhook(destination, alert);
    case 'slack':
      return sendSlack(destination, alert);
    case 'email':
      return sendEmail(destination, alert);
    default:
      return { ok: false, error: `unknown destination type: ${destination.type}` };
  }
}

module.exports = {
  dispatch,
  requestJson,
  sendEmail,
  sendSlack,
  sendWebhook,
  buildSendGridPayload,
};