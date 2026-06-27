# JulesOps Server

The JulesOps hosted control-plane backend. Supports both a local JSON-file demo mode
(no database required) and a full Postgres-backed production deployment.

## API surface

### Health & observability
- `GET /health` — service health, storage mode, uptime
- `GET /health/db` — database connectivity
- `GET /health/github` — GitHub App credential presence
- `GET /health/stripe` — Stripe credential presence
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

### Billing
- `POST /billing/checkout` — create Stripe Checkout session
- `POST /billing/webhook` — handle Stripe events
- `GET /billing/portal` — redirect to Stripe Customer Portal

## Run locally (demo mode)

No database required — data is stored in `server/data/store.json`.

```powershell
cd server
npm install
$env:GITHUB_WEBHOOK_SECRET="dev-secret"
npm start
```

## Run smoke tests

```powershell
cd server
$env:JULESOPS_SERVER_URL="http://127.0.0.1:3000"
$env:GITHUB_WEBHOOK_SECRET="dev-secret"
npm run smoke
```

## Run unit tests

```powershell
cd server
node --test src/__tests__/*.test.js
```

## Run database migrations

```powershell
cd server
$env:DATABASE_URL="postgres://user:pass@host/dbname"
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
| `GITHUB_WEBHOOK_SECRET` | *(unset)* | Webhook signature verification secret |
| `GITHUB_PRIVATE_KEY` | *(unset)* | PEM private key (newlines as `\n`) |
| `GITHUB_OAUTH_CLIENT_ID` | *(unset)* | GitHub OAuth App client ID |
| `GITHUB_OAUTH_CLIENT_SECRET` | *(unset)* | GitHub OAuth App client secret |
| `SESSION_SECRET` | *(unset)* | Session signing secret |
| `STRIPE_SECRET_KEY` | *(unset)* | Stripe secret key |
| `STRIPE_WEBHOOK_SECRET` | *(unset)* | Stripe webhook signing secret |

## Deployment

See [`docs/deployment.md`](../docs/deployment.md) for step-by-step production deployment
instructions (Render, Railway, Fly.io, Neon Postgres).