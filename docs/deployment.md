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
[migrate] Complete. Applied: 5, Skipped: 0
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

### Optional — Server tuning

| Variable | Default | Description |
|----------|---------|-------------|
| `PORT` | `3000` | HTTP listen port |
| `HOST` | `127.0.0.1` | Bind address (set to `0.0.0.0` for containers) |
| `NODE_ENV` | `development` | Set to `production` to enforce auth and disable demo fallbacks |
| `CORS_ORIGIN` | `*` | Allowed origin for cross-origin requests (set to your dashboard URL in production) |

### Optional — Database tuning

| Variable | Default | Description |
|----------|---------|-------------|
| `PGSSLMODE` | _(auto)_ | Set to `require` for Neon / RDS / any TLS-required host |
| `PG_POOL_MAX` | `10` | Maximum Postgres connection pool size |
| `PG_LOG_QUERIES` | `false` | Set to `true` to log every SQL query (debugging only) |

### Optional — GitHub App key path

| Variable | Description |
|----------|-------------|
| `GITHUB_PRIVATE_KEY_PATH` | Path to a `.pem` file on disk (alternative to inline `GITHUB_PRIVATE_KEY`) |

### Optional — Session tuning

| Variable | Default | Description |
|----------|---------|-------------|
| `SESSION_COOKIE` | `julesops_sid` | Name of the session cookie |
| `SESSION_TTL_MS` | `86400000` (24 h) | Session expiry in milliseconds |

### Optional — Alert worker

| Variable | Default | Description |
|----------|---------|-------------|
| `ALERT_WORKER_ENABLED` | `true` | Set to `false` to disable the background alert worker |
| `ALERT_STALE_HOURS` | `24` | Hours before a job is considered stale |
| `ALERT_INTERVAL_MS` | `900000` (15 min) | Milliseconds between alert check cycles |

### Optional — Email alerts (SendGrid)

| Variable | Default | Description |
|----------|---------|-------------|
| `SENDGRID_API_KEY` | _(none)_ | SendGrid API key for email delivery |
| `ALERT_EMAIL_FROM` | _(none)_ | Sender email address |
| `ALERT_EMAIL_FROM_NAME` | `JulesOps` | Sender display name |
| `ALERT_EMAIL_REPLY_TO` | _(none)_ | Reply-to email address |
| `ALERT_EMAIL_SUBJECT_PREFIX` | `JulesOps Alert` | Prefix for alert email subject lines |
| `SENDGRID_API_BASE_URL` | `https://api.sendgrid.com` | Override for tests or alternative endpoints |
| `ALERT_EMAIL_DEMO_FALLBACK` | `true` in dev | Keep demo console logging when email is not configured |

### Optional — Local development

| Variable | Default | Description |
|----------|---------|-------------|
| `JULESOPS_DATA_DIR` | `./server/data` | JSON store path (demo mode only, when `DATABASE_URL` is unset) |

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

## Step 6 — Verify health and readiness

After deploying, verify all health and readiness endpoints return the expected responses.

### Core health

```bash
curl https://your-deployment.example.com/health
# → { "ok": true, "service": "julesops-server", "uptime_seconds": 42, "storage": "postgres" }

curl https://your-deployment.example.com/health/db
# → { "ok": true, "storage": "postgres" }
```

### Readiness (for container orchestrators / load balancers)

```bash
curl https://your-deployment.example.com/ready
# → { "ok": true, "ready": true, "storage": "postgres", "alert_worker_enabled": true }
```

Returns `503` if the database is unreachable.

### Subsystem health

```bash
curl https://your-deployment.example.com/health/github
# → { "ok": true, "mode": "configured", "note": "GitHub App credentials present." }
# (returns mode: "not-configured" when GITHUB_APP_ID is not set)

curl https://your-deployment.example.com/health/stripe
# → { "ok": true, "mode": "configured", "note": "Stripe credentials present." }
# (returns mode: "not-configured" when STRIPE_SECRET_KEY is not set)

curl https://your-deployment.example.com/health/alerts
# → { "ok": true, "alert_worker_enabled": true, "alert_rules": 0, "notification_destinations": 0, "alert_deliveries": 0 }
```

### Metrics

```bash
curl https://your-deployment.example.com/metrics
# → Prometheus-compatible text exposition format
```

### Webhook ingress test

Send a test webhook (or use the smoke-test script):

```bash
cd server
npm run smoke
```

The smoke test verifies health, metrics, API endpoints, webhook ingestion, and idempotency.

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
5. Verify `/health` and `/ready` return `200` after deploy.

---

## Rollback and recovery

### Rolling back a bad deploy

1. **Platform rollback**: Most platforms (Render, Railway, Fly.io) support
   one-click rollback to a previous deploy. Use this as the fastest path.
2. **Git-based rollback**: If platform rollback is unavailable:
   ```bash
   git log --oneline -5            # find the last known-good commit
   git revert HEAD                 # or reset to the known-good commit
   git push origin main            # triggers a new deploy
   ```
3. **Verify after rollback**: Confirm `/health` and `/ready` return `200`.

### Rolling back a database migration

Migrations are applied in individual transactions, so a failed migration
automatically rolls back. If a migration was applied successfully but causes
problems:

1. Write a new reverse migration in `server/migrations/` (e.g.
   `006_revert_005.sql`) that undoes the problematic changes.
2. Run `npm run migrate` to apply the reverse migration.
3. Do **not** delete or rename previously applied migration files —
   the `_migrations` tracking table depends on stable filenames.

### Recovering from data loss

- **Neon**: Use point-in-time recovery (PITR) from the Neon dashboard.
- **Self-hosted**: Restore from the most recent `pg_dump` backup:
  ```bash
  gunzip < julesops_backup_20260707.sql.gz | psql $DATABASE_URL
  ```
- After restoring, run `npm run migrate` to ensure the schema is current.

---

## Production readiness checklist

Walk through this checklist before going live:

- [ ] `DATABASE_URL` points to a production Postgres instance (not localhost)
- [ ] `NODE_ENV=production` is set
- [ ] `GITHUB_APP_ID`, `GITHUB_WEBHOOK_SECRET`, and a private key are configured
- [ ] `GITHUB_OAUTH_CLIENT_ID` and `GITHUB_OAUTH_CLIENT_SECRET` are set
- [ ] `SESSION_SECRET` is a random 32+ character string
- [ ] `APP_BASE_URL` matches the public deployment URL
- [ ] `HOST` is set to `0.0.0.0` (or appropriate bind address for containers)
- [ ] All 5 database migrations have been applied (`npm run migrate`)
- [ ] `/health` returns `{ "ok": true, "storage": "postgres" }`
- [ ] `/ready` returns `{ "ok": true, "ready": true }`
- [ ] `/health/db` returns `{ "ok": true }`
- [ ] `/health/github` returns `{ "mode": "configured" }`
- [ ] GitHub App webhook URL is set to `https://<your-domain>/api/webhooks`
- [ ] `npm run smoke` passes against the deployed server
- [ ] Uptime monitor is configured against `/health`
- [ ] Database backup strategy is in place (Neon PITR or scheduled `pg_dump`)
- [ ] (If billing) Stripe env vars are set and `/health/stripe` returns `configured`
- [ ] (If email alerts) SendGrid env vars are set and test alert delivery confirmed

---

## Environment variable reference

See [`.env.example`](../.env.example) for the full list of supported variables.
