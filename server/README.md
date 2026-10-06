# JulesOps Server (experimental)

> **Status: parked.** This is an unmaintained prototype. It isn't part of JulesOps releases, isn't deployed anywhere, and isn't needed to use the JulesOps action, which keeps all state in GitHub labels. Use it for experiments only.
>
> Known issues:
> - Every issue in an installed repository becomes a job, including issues that aren't Jules tasks; an issue without a status label counts as queued.
> - When a pull request links an issue, the job's title is replaced with "Linked PR #N".
> - "Stale Reviews" counts every issue in review, not only stale ones.
> - Retries aren't recorded, so every job shows attempt 1 and the attempt history is empty.
> - Only the default `status:*` label names are recognized; custom names from `julesops.yml` are ignored.
> - Any comment containing `/retry` or `/requeue` marks a job queued, with no check of the author.
> - The dashboard is unstyled at `/dashboard` without a trailing slash (use `/dashboard/`), and it stays on "Connecting…" if its icon script from unpkg.com fails to load.
> - The dashboard is read-only; it has no retry or requeue actions.

A GitHub App webhook receiver with a cross-repository dashboard, job history, alerts, and admin tools. Supports both a local JSON-file demo mode
(no database required) and a full Postgres-backed production deployment.

## API surface

### Health & observability
- `GET /health` — service health, storage mode, uptime
- `GET /health/db` — database connectivity
- `GET /health/github` — GitHub App credential presence
- `GET /metrics` — Prometheus-format metrics

### Jobs & events
- `GET /api/jobs` — list jobs (supports `?status=`, `?repository=`, `?organization=`)
- `GET /api/jobs/:id` — job detail + attempts
- `GET /api/attempts?job_id=...` — attempts for a job
- `GET /api/events` — recent webhook events
- `GET /api/stats` — aggregate stats
- `GET /api/repositories` — repository list
- `GET /api/organizations` — organization list
- `POST /api/webhooks` — ingest GitHub webhook (HMAC-SHA256 verified, idempotent)

### Auth
- `GET /auth/github` — start GitHub OAuth login
- `GET /auth/github/callback` — OAuth callback
- `GET /auth/logout` — destroy session
- `GET /api/me` — current authenticated user

### Admin
- `GET /admin/installations/:installation_id` — installation overview, repositories, jobs, and failed events
- `GET /admin/installations/:installation_id/repositories` — repository inspection
- `GET /admin/installations/:installation_id/jobs` — job inspection with filters
- `GET /admin/events?installation_id=...` — failed event listing
- `POST /admin/events/:event_id/replay` — replay a failed event safely

## Run locally (demo mode)

No database required — data is stored in `server/data/store.json`.

```bash
cd server
npm install
export GITHUB_WEBHOOK_SECRET="dev-secret"
npm start
```

Demo mode runs **without login** (unless `NODE_ENV=production` or `DATABASE_URL` is set) and binds to `127.0.0.1`. Don't expose it publicly.

## Run smoke tests

```bash
cd server
export JULESOPS_SERVER_URL="http://127.0.0.1:3000"
export GITHUB_WEBHOOK_SECRET="dev-secret"
npm run smoke
```

## Run unit tests

```bash
cd server
node --test src/__tests__/*.test.js
```

## Run database migrations

```bash
cd server
export DATABASE_URL="postgres://user:pass@host/dbname"
npm run migrate
```

## Environment variables

See [`.env.example`](../.env.example) for the full list.

Key variables:

| Variable | Default | Purpose |
|----------|---------|---------|
| `PORT` | `3000` | HTTP port |
| `HOST` | `127.0.0.1` | HTTP host |
| `DATABASE_URL` | *(unset)* | Postgres URL — if absent, JSON-file demo mode |
| `GITHUB_APP_ID` | *(unset)* | GitHub App numeric ID |
| `GITHUB_WEBHOOK_SECRET` | *(unset)* | Webhook signature verification secret. Unset: webhooks are rejected in production, accepted unverified in local demo mode. |
| `GITHUB_PRIVATE_KEY` | *(unset)* | PEM private key (newlines as `\n`) |
| `GITHUB_OAUTH_CLIENT_ID` | *(unset)* | GitHub OAuth App client ID |
| `GITHUB_OAUTH_CLIENT_SECRET` | *(unset)* | GitHub OAuth App client secret |
| `SESSION_SECRET` | *(unset)* | Session signing secret |
| `CORS_ORIGIN` | *(unset)* | Origin allowed to call the API cross-site. Unset: no CORS headers. |
| `SENDGRID_API_KEY` | *(unset)* | SendGrid API key for alert email delivery |
| `ALERT_EMAIL_FROM` | *(unset)* | Verified sender address for alert emails |
| `ALERT_EMAIL_FROM_NAME` | `JulesOps` | Sender display name for alert emails |
| `ALERT_EMAIL_REPLY_TO` | *(unset)* | Reply-to address for alert emails |
| `SENDGRID_API_BASE_URL` | `https://api.sendgrid.com` | API base URL for SendGrid or a local test server |
| `ALERT_EMAIL_DEMO_FALLBACK` | `true` in non-production | Keep demo logging enabled when email is not configured |

## Deployment

1. Create a GitHub App (webhook URL `https://<your-host>/api/webhooks`, a webhook secret, and a private key) with read access to metadata and contents and read & write access to issues and pull requests. Subscribe it to `issues`, `pull_request`, `issue_comment`, `installation`, and `installation_repositories`.
2. Provision Postgres and run `npm run migrate` with `DATABASE_URL` set. Migrations are tracked in a `_migrations` table, so re-running is safe.
3. Set `NODE_ENV=production`, `HOST=0.0.0.0` (in containers), `APP_BASE_URL`, `SESSION_SECRET`, the GitHub App variables above (or `GITHUB_PRIVATE_KEY_PATH` for a key file), and `PGSSLMODE=require` for TLS-only databases. See `.env.example` at the repository root for every variable.
4. Start with `npm start` and check `GET /health` and `GET /health/db`.
