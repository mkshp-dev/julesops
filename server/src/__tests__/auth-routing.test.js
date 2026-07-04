'use strict';

const { test, describe, before, after } = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');

process.env.NODE_ENV = 'production';
delete process.env.DATABASE_URL;

const db = require('../db');
const store = require('../store');
const rbac = require('../rbac');
const { createSession } = require('../session');

const jobs = [
  {
    id: 'job-1',
    repository: 'test-org/alpha',
    issue_number: 17,
    issue_title: 'Fix the broken thing',
    current_status: 'review',
    attempt_number: 1,
    updated_at: '2026-07-04T00:00:00.000Z',
  },
  {
    id: 'job-2',
    repository: 'other-org/beta',
    issue_number: 9,
    issue_title: 'Unrelated job',
    current_status: 'blocked',
    attempt_number: 1,
    updated_at: '2026-07-04T00:00:00.000Z',
  },
];

const repositories = [
  { id: 3001, installation_id: 2001, full_name: 'test-org/alpha', account_login: 'test-org', account_type: 'Organization' },
  { id: 3002, installation_id: 2002, full_name: 'other-org/beta', account_login: 'other-org', account_type: 'Organization' },
];

const events = [
  { id: 'event-1', delivery_id: 'delivery-1', installation_id: 2001, processing_status: 'failed', received_at: '2026-07-04T00:00:00.000Z' },
  { id: 'event-2', delivery_id: 'delivery-2', installation_id: 2002, processing_status: 'failed', received_at: '2026-07-04T00:00:00.000Z' },
];

let originalDb;
let originalStore;
let originalRbac;
let server;
let baseUrl;
let viewerCookie;
let adminCookie;

function makeJob(repo, id) {
  return jobs.find((job) => job.id === id && job.repository === repo) || null;
}

function req(path, options = {}) {
  return fetch(`${baseUrl}${path}`, {
    method: options.method || 'GET',
    headers: options.headers || {},
    body: options.body,
    redirect: 'manual',
  });
}

describe('hosted auth gates', () => {
  before(async () => {
    originalDb = {
      getPool: db.getPool,
      query: db.query,
      queryOne: db.queryOne,
    };
    originalStore = {
      listJobs: store.listJobs,
      getJob: store.getJob,
      listAttempts: store.listAttempts,
      listRepositories: store.listRepositories,
      listEvents: store.listEvents,
      listInstallationEvents: store.listInstallationEvents,
      getInstallation: store.getInstallation,
      getStats: store.getStats,
    };
    originalRbac = {
      requireRole: rbac.requireRole,
      getAccessibleInstallationIds: rbac.getAccessibleInstallationIds,
    };

    db.getPool = () => ({ mocked: true });
    db.query = async (text, params) => {
      if (text.includes('FROM memberships m JOIN installations')) {
        return [{ installation_id: 2001, role: 'viewer' }];
      }
      if (text.includes('SELECT DISTINCT installation_id FROM memberships')) {
        return [{ installation_id: 2001 }];
      }
      return [];
    };
    db.queryOne = async (text, params) => {
      if (text.includes('SELECT role FROM memberships')) {
        return { role: params[1] === 2001 ? 'viewer' : null };
      }
      return null;
    };

    store.listJobs = async ({ installationId } = {}) => {
      if (!installationId) return jobs;
      return jobs.filter((job) => job.repository === 'test-org/alpha' && Number(installationId) === 2001);
    };
    store.getJob = async (id) => makeJob('test-org/alpha', id) || makeJob('other-org/beta', id);
    store.listAttempts = async () => [];
    store.listRepositories = async ({ installationId } = {}) => {
      if (!installationId) return repositories;
      return repositories.filter((repo) => Number(repo.installation_id) === Number(installationId));
    };
    store.listEvents = async () => events;
    store.listInstallationEvents = async (installationId) => events.filter((event) => Number(event.installation_id) === Number(installationId));
    store.getInstallation = async (installationId) => repositories.find((repo) => Number(repo.installation_id) === Number(installationId)) || null;
    store.getStats = async () => ({ total: jobs.length, review: 1, blocked: 1, events_total: events.length });

    rbac.requireRole = originalRbac.requireRole;
    rbac.getAccessibleInstallationIds = originalRbac.getAccessibleInstallationIds;

    const { createServer } = require('../server');
    server = createServer();
    await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
    const { port } = server.address();
    baseUrl = `http://127.0.0.1:${port}`;

    viewerCookie = `julesops_sid=${createSession({ githubId: 99, githubLogin: 'viewer-user' })}`;
    adminCookie = `julesops_sid=${createSession({ githubId: 100, githubLogin: 'admin-user' })}`;

    // Patch the DB response to treat githubId 100 as an admin for installation 2001.
    db.queryOne = async (text, params) => {
      if (text.includes('SELECT role FROM memberships')) {
        if (params[0] === 100 && Number(params[1]) === 2001) return { role: 'admin' };
        if (params[0] === 99 && Number(params[1]) === 2001) return { role: 'viewer' };
        return null;
      }
      return null;
    };
    db.query = async (text, params) => {
      if (text.includes('FROM memberships m JOIN installations')) {
        if (params[0] === 99) return [{ installation_id: 2001, role: 'viewer' }];
        if (params[0] === 100) return [{ installation_id: 2001, role: 'admin' }];
      }
      if (text.includes('SELECT DISTINCT installation_id FROM memberships')) {
        if (params[0] === 99) return [{ installation_id: 2001 }];
        if (params[0] === 100) return [{ installation_id: 2001 }];
      }
      return [];
    };
  });

  after(async () => {
    await new Promise((resolve) => server.close(resolve));
    db.getPool = originalDb.getPool;
    db.query = originalDb.query;
    db.queryOne = originalDb.queryOne;
    store.listJobs = originalStore.listJobs;
    store.getJob = originalStore.getJob;
    store.listAttempts = originalStore.listAttempts;
    store.listRepositories = originalStore.listRepositories;
    store.listEvents = originalStore.listEvents;
    store.listInstallationEvents = originalStore.listInstallationEvents;
    store.getInstallation = originalStore.getInstallation;
    store.getStats = originalStore.getStats;
    rbac.requireRole = originalRbac.requireRole;
    rbac.getAccessibleInstallationIds = originalRbac.getAccessibleInstallationIds;
  });

  test('redirects unauthenticated dashboard access to login', async () => {
    const res = await req('/dashboard');
    assert.equal(res.status, 302);
    assert.equal(res.headers.get('location'), '/auth/github?redirect_to=/dashboard');
  });

  test('allows an authenticated user to reach the dashboard shell', async () => {
    const res = await req('/dashboard', { headers: { cookie: viewerCookie } });
    assert.equal(res.status, 200);
    const body = await res.text();
    assert.match(body, /JulesOps/);
  });

  test('blocks unauthenticated API access', async () => {
    const res = await req('/api/jobs');
    assert.equal(res.status, 401);
  });

  test('lets a viewer see only permitted jobs', async () => {
    const res = await req('/api/jobs', { headers: { cookie: viewerCookie, accept: 'application/json' } });
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.equal(body.jobs.length, 1);
    assert.equal(body.jobs[0].repository, 'test-org/alpha');
  });

  test('blocks viewer access to another installation job', async () => {
    const res = await req('/api/jobs/job-2', { headers: { cookie: viewerCookie, accept: 'application/json' } });
    assert.equal(res.status, 403);
  });

  test('blocks viewer access to admin routes', async () => {
    const res = await req('/admin/installations/2001', { headers: { cookie: viewerCookie, accept: 'application/json' } });
    assert.equal(res.status, 403);
  });

  test('blocks viewer access to billing portal', async () => {
    const res = await req('/billing/portal?customer_id=cus_123', { headers: { cookie: viewerCookie, accept: 'application/json' } });
    assert.equal(res.status, 403);
  });
});
