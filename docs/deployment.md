# JulesOps Deployment Guide

This guide covers deploying the JulesOps hosted control-plane server and
connecting it to a Postgres database and a GitHub App.

---

## Prerequisites

- Node.js 20+
- A Postgres database (Neon, Railway, Render, or self-hosted)
- A GitHub App (see [local-webhook-dev.md](./local-webhook-dev.md) for setup)
- (Optional) Stripe account for billing

---

## Recommended platforms

| Layer | Recommended Option | Alternative |
|-------|-------------------|-------------|
| Server | [Render](https://render.com) Web Service | Railway, Fly.io, AWS App Runner |
| Database | [Neon](https://neon.tech) Postgres | Railway Postgres, Supabase, RDS |
| Monitoring | [Better Uptime](https://betteruptime.com) | UptimeRobot, Checkly |
| Error tracking | [Sentry](https://sentry.io) | Axiom, Logtail |

---

## Step 1 — Provision a Postgres database

1. Create a new Postgres database on Neon, Railway, or Render.
2. Copy the connection string (e.g. `postgres://user:pass@host/dbname?sslmode=require`).
3. Set `DATABASE_URL` in your deployment environment.

---

## Step 2 — Run database migrations

Migrations live in `server/migrations/` and run in alphabetical order.

```bash
cd server
DATABASE_URL=postgres://... npm run migrate
```

Expected output:

```
[migrate] Connected to Postgres
[migrate] APPLY 001_initial_schema.sql …
[migrate] DONE  001_initial_schema.sql
[migrate] APPLY 002_rbac.sql …
[migrate] DONE  002_rbac.sql
...
[migrate] Complete. Applied: 4, Skipped: 0
```

Run `npm run migrate` again at any time — it is **idempotent** and skips already-applied migrations.

---

## Step 3 — Set environment variables

Copy `.env.example` to `.env` and fill in the required values.
For production deployments, set these directly in your platform's environment
settings — **do not commit `.env`**.

### Required for full functionality

| Variable | Description |
|----------|-------------|
| `DATABASE_URL` | Postgres connection string |
| `GITHUB_APP_ID` | Numeric GitHub App ID |
| `GITHUB_WEBHOOK_SECRET` | Webhook secret from App settings |
| `GITHUB_PRIVATE_KEY` | PEM key (escape newlines as `\n`) or use `GITHUB_PRIVATE_KEY_PATH` |
| `GITHUB_OAUTH_CLIENT_ID` | OAuth App client ID |
| `GITHUB_OAUTH_CLIENT_SECRET` | OAuth App client secret |
| `SESSION_SECRET` | Random 32+ char string for session signing |
| `APP_BASE_URL` | Public URL of your deployment (e.g. `https://julesops.example.com`) |

### Required for billing

| Variable | Description |
|----------|-------------|
| `STRIPE_SECRET_KEY` | Stripe secret key (`sk_test_...` or `sk_live_...`) |
| `STRIPE_WEBHOOK_SECRET` | Stripe webhook signing secret (`whsec_...`) |
| `STRIPE_PRO_PRICE_ID` | Stripe Price ID for the Pro plan |
| `STRIPE_TEAM_PRICE_ID` | Stripe Price ID for the Team plan |

---

## Step 4 — Deploy the server

### Render (recommended quickstart)

1. Create a new **Web Service** in Render.
2. Connect to the `mkshp-dev/julesops` GitHub repository.
3. Set:
   - **Root Directory**: `server`
   - **Build Command**: `npm install`
   - **Start Command**: `npm start`
4. Add environment variables in the Render dashboard.
5. Set the Render service URL as your GitHub App's **Webhook URL**
   (append `/api/webhooks`).

### Railway

1. Create a new Railway project and add a Node.js service.
2. Set `RAILWAY_DOCKERFILE_PATH` or use the Nixpacks default Node.js build.
3. Add a Postgres plugin and copy the `DATABASE_URL`.
4. Set all required environment variables.

### Fly.io

```bash
fly launch --name julesops-server --path server
fly secrets set DATABASE_URL=postgres://...
fly deploy
```

---

## Step 5 — Configure GitHub App webhook URL

In your GitHub App settings:

- **Webhook URL**: `https://your-deployment.example.com/api/webhooks`
- **Webhook secret**: the value of `GITHUB_WEBHOOK_SECRET`
- **Active**: ✓

---

## Step 6 — Verify health

```bash
curl https://your-deployment.example.com/health
# → { "ok": true, "storage": "postgres", "uptime_seconds": 42 }

curl https://your-deployment.example.com/health/db
# → { "ok": true, "storage": "postgres" }
```

---

## Step 7 — Set up monitoring

1. **Uptime monitoring**: Add `https://your-deployment.example.com/health` to
   Better Uptime, UptimeRobot, or Checkly. Alert on non-200 responses.

2. **Error tracking**: Integrate Sentry by adding `@sentry/node` and calling
   `Sentry.init({ dsn: process.env.SENTRY_DSN })` at server startup.

3. **Metrics**: The `/metrics` endpoint exposes Prometheus-compatible metrics.
   Scrape with Prometheus or use a hosted solution like Grafana Cloud.

---

## Step 8 — Database backups

For Neon: automatic PITR (point-in-time recovery) is enabled by default on Pro plans.

For self-hosted Postgres:
```bash
pg_dump $DATABASE_URL | gzip > julesops_backup_$(date +%Y%m%d).sql.gz
```

---

## Upgrading

1. Pull the latest `main` branch.
2. `cd server && npm install`
3. Run `DATABASE_URL=... npm run migrate` — new migrations will be applied.
4. Deploy the updated server binary.

---

## Environment variable reference

See [`.env.example`](../.env.example) for the full list of supported variables.
