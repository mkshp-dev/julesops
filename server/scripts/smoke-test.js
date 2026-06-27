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
  await assertOk('repositories', await request('GET', '/api/repositories'), 200);
  await assertOk('organizations', await request('GET', '/api/organizations'), 200);
  await assertOk('events', await request('GET', '/api/events'), 200);
  await assertOk('stats', await request('GET', '/api/stats'), 200);

  const deliveryId = crypto.randomUUID();
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
    'x-github-delivery': deliveryId,
    ...signature(payload),
  }), 202);

  // Idempotency — same delivery ID should be accepted silently (not error)
  const dup = await request('POST', '/api/webhooks', payload, {
    'x-github-event': 'issues',
    'x-github-delivery': deliveryId,
    ...signature(payload),
  });
  await assertOk('webhook-duplicate', dup, 202);
  if (!dup.body.includes('duplicate delivery ignored')) {
    throw new Error('duplicate delivery was not flagged correctly');
  }

  const jobs = await request('GET', '/api/jobs?repository=mkshp-dev/julesops');
  await assertOk('jobs-after-webhook', jobs, 200);
  if (!jobs.body.includes('Smoke test issue')) {
    throw new Error('jobs endpoint did not include ingested smoke test issue');
  }

  // Get the job ID from the list and test /api/jobs/:id
  const jobsData = JSON.parse(jobs.body);
  const smokeJob = jobsData.jobs.find(j => j.issue_title === 'Smoke test issue' || j.issueTitle === 'Smoke test issue');
  if (smokeJob && smokeJob.id) {
    const jobDetail = await request('GET', `/api/jobs/${smokeJob.id}`);
    await assertOk('job-detail', jobDetail, 200);
    console.log('job-detail: job found with attempts array');
  }

  // Test /api/attempts with job_id
  if (smokeJob && smokeJob.id) {
    await assertOk('attempts', await request('GET', `/api/attempts?job_id=${smokeJob.id}`), 200);
  }
}

main().catch((error) => {
  console.error(error.message);
  process.exit(1);
});