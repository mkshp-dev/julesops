# Marketplace execution roadmap

This roadmap starts from the current JulesOps repository state:

- The free single-repository workflow kit is usable for beta testing.
- The source kit has installer, validator, label bootstrapper, CI smoke tests, and release docs.
- A minimal hosted-control-plane skeleton exists under `server/` with health, metrics, API, webhook signature verification, and JSON-backed event/job storage.
- The dashboard is still a static prototype using mock data.
- The GitHub App, durable database, OAuth/RBAC, billing, deployment, and production operations are not complete.

The goal is to reach a real GitHub Marketplace product with:

1. A free workflow kit that remains useful without a hosted backend.
2. A GitHub App / hosted control plane that observes and manages multi-repo JulesOps activity.
3. Paid dashboard and operations features for multi-repo teams.

---

## Stage 0 - Stabilize the free kit beta

Status: mostly done, but should remain guarded by CI.

### Outcomes

- A user can install JulesOps into a target repo.
- The target repo can queue issues, dispatch Jules, sync PR state, retry/requeue, and run watchdog checks.
- Documentation does not overclaim hosted Marketplace readiness.

### Remaining tasks

- Build out `examples/fixture-basic/` into a real fixture repo.
- Add a fixture smoke-test script for fresh install, dry run, upgrade, force overwrite, resolver execution, and label dry run.
- Run the full workflow in at least two real external repositories.
- Capture beta feedback and update `docs/private-beta.md`.

### Exit criteria

- CI validates the source kit and installer.
- At least two real repos complete happy-path task flow.
- Known limitations are documented.

---

## Stage 1 - Make the hosted backend real

Status: started with `server/` skeleton.

### Outcomes

- The backend runs locally and in CI.
- It has durable persistence beyond a local JSON file.
- It can ingest GitHub App webhooks safely.
- It exposes dashboard-ready APIs.

### Tasks

1. Choose backend stack direction.
   - Current skeleton: dependency-free Node HTTP server.
   - Recommended near-term: keep Node, then move to Fastify/Express only when route complexity grows.
   - Pick database: Postgres is recommended for Marketplace/SaaS.

2. Add database layer.
   - Add migrations directory, e.g. `server/migrations/`.
   - Add tables:
     - `installations`
     - `repositories`
     - `jobs`
     - `attempts`
     - `events`
     - `users`
     - `memberships`
     - `subscriptions`
   - Add repository/data-access module.
   - Keep JSON store only for local demo mode if useful.

3. Implement webhook event persistence.
   - Store raw event metadata and sanitized payload.
   - Track delivery ID for idempotency.
   - Reject duplicate deliveries safely.
   - Record processing status: `received`, `processed`, `failed`.

4. Normalize job state from webhooks.
   - `issues` events update jobs and labels.
   - `pull_request` events link PRs to issue jobs.
   - `issue_comment` events record retry/requeue or blocked signals.
   - `workflow_run` events record attempts and dispatch failures.

5. Expand API endpoints.
   - `GET /api/jobs`
   - `GET /api/jobs/:id`
   - `GET /api/repositories`
   - `GET /api/organizations`
   - `GET /api/events`
   - `GET /api/stats`
   - `GET /api/attempts?job_id=...`

6. Add backend tests.
   - webhook signature tests
   - idempotency tests
   - issue event normalization tests
   - PR link extraction tests
   - metrics and health endpoint tests

### Exit criteria

- Backend can run locally with Postgres.
- Webhook ingestion survives duplicate and malformed payloads.
- Dashboard APIs return data from database.
- CI runs backend tests.

---

## Stage 2 - GitHub App foundation

Status: designed, not implemented.

### Outcomes

- A real GitHub App can be installed on a test repo/org.
- Webhooks from GitHub reach the backend.
- Backend can map installation -> repositories -> JulesOps config.

### Tasks

1. Create dev GitHub App.
   - Permissions:
     - Metadata: read
     - Issues: read/write
     - Pull requests: read/write if PR comments are needed, otherwise read plus issue comments where possible
     - Contents: read
     - Actions: read initially
   - Events:
     - installation
     - installation_repositories
     - issues
     - issue_comment
     - pull_request
     - workflow_run

2. Add GitHub App auth.
   - Load `GITHUB_APP_ID`.
   - Load private key from env or file.
   - Generate JWT.
   - Exchange installation token.
   - Add GitHub API client module.

3. Implement installation handlers.
   - `installation.created`
   - `installation.deleted`
   - `installation_repositories.added`
   - `installation_repositories.removed`
   - Sync installation and repository metadata.

4. Implement repository config discovery.
   - Read `.github/julesops.yml` through GitHub Contents API.
   - Parse same nested schema as workflow kit.
   - Mark repo as configured/unconfigured.
   - Store config snapshot and version marker.

5. Add local webhook development setup.
   - smee/ngrok docs.
   - `.env.example`.
   - sample payload fixtures.

### Exit criteria

- Private GitHub App install works on a test repository.
- Installation and repo records appear in database.
- Webhook deliveries are verified and persisted.
- Backend can read target repo config through installation token.

---

## Stage 3 - Connect dashboard to real backend APIs

Status: static prototype only.

### Outcomes

- Dashboard shows real jobs from backend APIs.
- Users can filter by org, repo, and status.
- Dashboard clearly separates free-kit local docs from hosted product UI.

### Tasks

1. Decide dashboard stack.
   - Short-term: keep static HTML and fetch backend APIs.
   - Medium-term: move to React/Next/SvelteKit if auth, routing, and state complexity grow.

2. Replace `mockJobs` with API fetch.
   - `GET /api/jobs`
   - `GET /api/repositories`
   - `GET /api/organizations`
   - `GET /api/stats`

3. Add loading/error/empty states.
   - no installations
   - no configured repositories
   - no active jobs
   - backend unavailable

4. Add job detail view.
   - issue link
   - PR link
   - attempts
   - last webhook events
   - current status
   - blocked reason summary

5. Add dashboard tests or smoke checks.
   - API returns expected shape.
   - dashboard loads with fixture data.

### Exit criteria

- Dashboard no longer depends on hardcoded `mockJobs` for normal operation.
- Static prototype warning is removed or replaced with beta warning.
- Dashboard can inspect real webhook-ingested data.

---

## Stage 4 - OAuth, users, RBAC

Status: designed, not implemented.

### Outcomes

- Users can sign in with GitHub.
- Dashboard access is limited to users with rights to the installation/org/repo.
- Roles are explicit and enforced.

### Tasks

1. Add GitHub OAuth app or GitHub App user auth flow.
2. Implement session handling.
   - Secure cookies.
   - CSRF protection for state-changing endpoints.
   - Session expiry.
3. Add users table.
4. Add memberships table.
5. Map GitHub org/repo permissions to JulesOps roles.
6. Enforce RBAC on all dashboard APIs.
7. Add admin-only endpoints for future support tools.

### Exit criteria

- Anonymous users cannot access dashboard data.
- Users only see installations/repositories they are authorized for.
- RBAC tests cover owner/admin/member/viewer behavior.

---

## Stage 5 - Operational features and alerts

Status: designed, not implemented.

### Outcomes

- Teams get useful alerts for stale/failed jobs.
- Operators can inspect and replay failed webhook events.
- Backend is observable in production.

### Tasks

1. Add notification destinations.
   - email
   - generic webhook
   - Slack-compatible webhook payloads if desired

2. Implement alert rules.
   - dispatch failure
   - stale in-progress
   - stale review
   - webhook processing failure
   - app installation/config drift

3. Add admin APIs.
   - list failed events
   - replay failed event
   - inspect installation
   - inspect repository config snapshot
   - inspect job timeline

4. Add metrics.
   - webhook received total
   - webhook failed total
   - processing duration
   - active jobs gauge
   - failed jobs gauge
   - DB query latency

5. Add logging.
   - structured logs
   - request IDs
   - GitHub delivery IDs

### Exit criteria

- Failed webhooks can be replayed.
- Alert delivery works in a test org.
- Operators can debug common support cases without database shell access.

---

## Stage 6 - Billing and plan enforcement

Status: designed, not implemented.

### Outcomes

- Free workflow kit remains free.
- Paid features are gated cleanly.
- Billing state does not affect single-repo workflow execution.

### Tasks

1. Define final plan matrix.
   - Free: workflow kit, maybe one-repo dashboard view.
   - Pro: multi-repo dashboard, notifications, history.
   - Team: RBAC, priority support, longer retention.

2. Add Stripe integration.
   - customers
   - subscriptions
   - checkout session
   - billing portal
   - webhook handling

3. Add subscription table.
4. Add plan enforcement middleware.
5. Add billing UI.
6. Add downgrade behavior.
   - preserve data for defined grace period
   - disable paid-only features gracefully

### Exit criteria

- Test checkout works in Stripe test mode.
- Plan gates are enforced by API and UI.
- Downgrade path is documented and tested.

---

## Stage 7 - Deployment and production readiness

Status: not started.

### Outcomes

- Hosted backend/dashboard can be deployed reliably.
- Secrets are managed safely.
- Monitoring and backups exist.

### Tasks

1. Choose deployment platform.
   - Render/Fly/Railway for speed.
   - AWS/GCP/Azure for more control.
   - Supabase/Neon/RDS for Postgres.

2. Add production configuration.
   - `DATABASE_URL`
   - `GITHUB_APP_ID`
   - `GITHUB_PRIVATE_KEY`
   - `GITHUB_WEBHOOK_SECRET`
   - `GITHUB_OAUTH_CLIENT_ID`
   - `GITHUB_OAUTH_CLIENT_SECRET`
   - `STRIPE_SECRET_KEY`
   - `STRIPE_WEBHOOK_SECRET`

3. Add deployment docs.
4. Add database migrations command.
5. Add backup/restore plan.
6. Add uptime monitoring.
7. Add error tracking.
8. Add rate-limit handling for GitHub API.

### Exit criteria

- Production deployment exists.
- A test GitHub App can point webhooks at production URL.
- Health checks are monitored.
- Database backups are configured.

---

## Stage 8 - Marketplace launch preparation

Status: draft docs exist, not ready.

### Outcomes

- Marketplace listing is truthful and complete.
- Legal, privacy, billing, and support docs are ready.
- Install flow works for a clean customer account.

### Tasks

1. Finalize `docs/marketplace-listing.md`.
2. Finalize screenshots using real dashboard data.
3. Finalize `PRIVACY.md` for hosted service data handling.
4. Finalize `TERMS.md` for SaaS plans.
5. Add support policy.
6. Add uninstall/deauthorization behavior.
7. Run private beta with 3-5 external repositories.
8. Fix beta feedback.
9. Submit GitHub Marketplace listing.

### Exit criteria

- Clean GitHub account can install the App and see dashboard data.
- Billing can be enabled for a test org.
- Support and security docs are complete.
- Marketplace copy does not describe unimplemented features.

---

## Suggested implementation order

1. Durable database and migrations.
2. GitHub App installation auth and webhook persistence.
3. Repository config discovery through GitHub API.
4. Real dashboard API integration.
5. OAuth login and RBAC.
6. Notifications and admin replay tools.
7. Billing.
8. Deployment.
9. Marketplace submission.

## Near-term issue list

Use these as the next concrete agent tasks:

1. Add Postgres schema and migration runner to `server/`.
2. Replace JSON store with repository/data-access layer backed by Postgres.
3. Add GitHub App JWT and installation-token module.
4. Implement `installation` and `installation_repositories` webhook handlers.
5. Implement config discovery from `.github/julesops.yml` via GitHub Contents API.
6. Replace dashboard `mockJobs` with `/api/jobs` fetch and add loading/error states.
7. Add OAuth login skeleton and session middleware.
8. Add RBAC tables and API authorization checks.
9. Add notification destination model and failed/stale alert worker.
10. Add Stripe test-mode checkout and subscription webhook handling.
11. Add deployment guide and `.env.example` for production.
12. Run a real private beta and update the release checklist with evidence.