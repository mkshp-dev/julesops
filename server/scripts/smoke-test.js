const crypto = require('crypto');
const http = require('http');

const baseUrl = process.env.JULESOPS_SERVER_URL || 'http://127.0.0.1:3000';
const secret = process.env.GITHUB_WEBHOOK_SECRET || '';

function request(method, pathname, body, headers = {}) {
  const url = new URL(pathname, baseUrl);
  const payload = body ? Buffer.from(JSON.stringify(body)) : null;
  return new Promise((resolve, reject) => {
    const req = http.request(url, {
      method,
      headers: {
        ...(payload ? { 'content-type': 'application/json', 'content-length': payload.length } : {}),
        ...headers,
      },
    }, (res) => {
      const chunks = [];
      res.on('data', (chunk) => chunks.push(chunk));
      res.on('end', () => resolve({ status: res.statusCode, body: Buffer.concat(chunks).toString('utf8') }));
    });
    req.on('error', reject);
    if (payload) req.write(payload);
    req.end();
  });
}

function signature(body) {
  if (!secret) return {};
  const raw = Buffer.from(JSON.stringify(body));
  const digest = crypto.createHmac('sha256', secret).update(raw).digest('hex');
  return { 'x-hub-signature-256': `sha256=${digest}` };
}

async function assertOk(name, response, expectedStatus) {
  if (response.status !== expectedStatus) {
    throw new Error(`${name} expected ${expectedStatus}, got ${response.status}: ${response.body}`);
  }
  console.log(`${name}: ${response.status}`);
}

async function main() {
  await assertOk('health', await request('GET', '/health'), 200);
  await assertOk('metrics', await request('GET', '/metrics'), 200);
  await assertOk('jobs', await request('GET', '/api/jobs'), 200);

  const payload = {
    action: 'opened',
    repository: { full_name: 'mkshp-dev/julesops' },
    issue: {
      number: 42,
      title: 'Smoke test issue',
      labels: [{ name: 'status:todo' }],
    },
  };

  await assertOk('webhook', await request('POST', '/api/webhooks', payload, {
    'x-github-event': 'issues',
    'x-github-delivery': crypto.randomUUID(),
    ...signature(payload),
  }), 202);

  const jobs = await request('GET', '/api/jobs?repository=mkshp-dev/julesops');
  await assertOk('jobs-after-webhook', jobs, 200);
  if (!jobs.body.includes('Smoke test issue')) {
    throw new Error('jobs endpoint did not include ingested smoke test issue');
  }
}

main().catch((error) => {
  console.error(error.message);
  process.exit(1);
});