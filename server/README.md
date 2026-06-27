# JulesOps Server

This is the first runnable hosted-control-plane skeleton for JulesOps. It intentionally uses only Node.js built-ins so it can run without package installation.

## Current scope

Implemented now:

- `GET /health`
- `GET /health/db`
- `GET /health/github`
- `GET /health/stripe`
- `GET /metrics`
- `GET /api/jobs`
- `GET /api/repositories`
- `GET /api/organizations`
- `POST /api/webhooks` with optional GitHub HMAC-SHA256 signature verification

Still future work:

- real database persistence
- GitHub App installation token handling
- OAuth/RBAC
- Stripe billing
- production deployment
- webhook replay UI/admin tooling

## Run locally

```powershell
cd server
$env:GITHUB_WEBHOOK_SECRET="dev-secret"
npm start
```

## Smoke test

In another terminal:

```powershell
cd server
$env:JULESOPS_SERVER_URL="http://127.0.0.1:3000"
npm run smoke
```

## Environment variables

| Variable | Default | Purpose |
| --- | --- | --- |
| `PORT` | `3000` | HTTP server port |
| `HOST` | `127.0.0.1` | HTTP server host |
| `GITHUB_WEBHOOK_SECRET` | empty | Optional webhook signature verification secret |
| `JULESOPS_DATA_DIR` | `server/data` | JSON data directory |