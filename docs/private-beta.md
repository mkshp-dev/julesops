# JulesOps Private Beta Plan & Config Contract Freeze

This document outlines the private beta programme for JulesOps and defines the proposed stable `v1.0` free-core config contract.

---

## 1. Private Beta Programme

### 1.1 Objectives

- Validate the free workflow kit on 3-5 real external repositories.
- Identify friction points in install, labeling, and dispatch flows.
- Confirm watchdog and state-sync workflows behave correctly under real-world conditions.
- Collect feedback on dashboard prototype usefulness without treating it as production.

### 1.2 Participant Criteria

Private beta participants should:

- Have an active GitHub repository with regular issue activity.
- Be comfortable with the installation script and YAML configuration.
- Agree to provide structured feedback via a shared form or discussion thread.

### 1.3 Beta Invitation Process

1. Operator opens a GitHub Discussion in `mkshp-dev/julesops` announcing beta access.
2. Participants submit their GitHub org/repo via a form or Discussion reply.
3. Operator sends an install guide and records participant feedback weekly.

### 1.4 Success Criteria for Exiting Beta

- At least 3 repositories run JulesOps for at least 14 days without critical issues.
- Watchdog stale detection or mismatch repair triggers successfully in at least 1 real scenario.
- No proposed `v1.0` config fields require breaking changes based on feedback.

---

## 2. Proposed v1.0 Free-Core Config Contract

The following `.github/julesops.yml` fields are proposed as stable for `v1.0`. The canonical default shape lives in `templates/julesops.yml`; see `docs/repo-config-spec.md` for detailed descriptions.

```yaml
julesops:
  enabled: true

  repository:
    base_branch: main

  queue:
    queue_label: jules-queue
    max_active_jobs: 1

  states:
    todo: status:todo
    in_progress: status:in-progress
    review: status:review
    blocked: status:blocked
    failed: status:failed
    done: status:done

  instructions:
    core: .github/jules-core.md
    repo: .github/jules-repo.md

  blocked_comment:
    marker: "## Blocked"

  pull_request:
    target_base_branch_only: true
    require_issue_link: true

  issue_completion:
    close_on_merge: true

  watchdog:
    stale_in_progress_hours: 24
    stale_review_hours: 72
```

### Stable Field Groups

- `julesops.enabled`
- `julesops.repository.base_branch`
- `julesops.queue.queue_label`
- `julesops.queue.max_active_jobs`
- `julesops.states.*`
- `julesops.instructions.*`
- `julesops.blocked_comment.marker`
- `julesops.pull_request.*`
- `julesops.issue_completion.close_on_merge`
- `julesops.watchdog.*`

### Experimental / Future Fields

The hosted control plane may later add optional sections such as:

```yaml
julesops:
  notifications:
    on_failure: []
    on_stale: []
```

These are not part of the current free-core workflow contract until documented in `docs/repo-config-spec.md` and supported by code.

### Versioning Policy

- Minor field additions under `julesops` are optional and backward-compatible.
- Renamed or removed stable fields require a major version bump after `v1.0`.
- Experimental fields may change before they are promoted into the stable contract.

---

## 3. Beta Implementation Evidence

This section records what has been built and verified as part of the
[marketplace-execution-roadmap](./marketplace-execution-roadmap.md) implementation.
Update as real beta data becomes available.

### 3.1 Completed infrastructure (as of 2026-06-27)

| Task | Status | Evidence |
|------|--------|---------|
| Postgres schema + migration runner | ✅ Done | `server/migrations/001_initial_schema.sql`, `npm run migrate` |
| Data-access layer (Postgres + JSON fallback) | ✅ Done | `server/src/store.js` |
| GitHub App JWT + installation token module | ✅ Done | `server/src/github-auth.js`, 9 unit tests |
| Installation webhook handlers | ✅ Done | `server/src/installation-handlers.js`, 11 unit tests |
| Config discovery via GitHub Contents API | ✅ Done | `server/src/config-discovery.js`, 14 unit tests |
| Dashboard live API fetch (no mockJobs) | ✅ Done | `dashboard/index.html`, loading/error/empty states, job detail drawer |
| OAuth login skeleton + session middleware | ✅ Done | `server/src/oauth.js`, `server/src/session.js`, 13 unit tests |
| RBAC tables + authorization middleware | ✅ Done | `server/migrations/002_rbac.sql`, `server/src/rbac.js`, 6 unit tests |
| Notification model + alert worker | ✅ Done | `server/migrations/003_notifications.sql`, `server/src/alerts.js`, 5 unit tests |
| Stripe checkout + subscription webhooks | ✅ Done | `server/src/billing.js`, 5 unit tests |
| Deployment guide + `.env.example` | ✅ Done | `docs/deployment.md`, `.env.example` |

### 3.2 Unit test summary

All unit tests pass in JSON-file demo mode (no Postgres, no external credentials required):

```
github-auth.test.js          9/9  pass
installation-handlers.test.js 11/11 pass
config-discovery.test.js     14/14 pass
session.test.js              13/13 pass
rbac.test.js                  6/6  pass
alerts.test.js                5/5  pass
billing.test.js               5/5  pass
─────────────────────────────────────
Total                        63/63  pass
```

### 3.3 Smoke test

The full API smoke test covers all endpoints and idempotency in JSON-file mode:

```bash
cd server
$env:GITHUB_WEBHOOK_SECRET="dev-secret"
npm start  # in one terminal

$env:JULESOPS_SERVER_URL="http://127.0.0.1:3000"
$env:GITHUB_WEBHOOK_SECRET="dev-secret"
npm run smoke  # in another terminal
```

Expected: all 12 endpoints return 200/202.

### 3.4 Known limitations (beta phase)

- **Real GitHub App not yet registered**: installation webhooks require a live App ID and private key.
- **OAuth login**: requires `GITHUB_OAUTH_CLIENT_ID` and `GITHUB_OAUTH_CLIENT_SECRET` to be set.
- **RBAC enforcement on APIs**: `requireAuth` / `requireRole` middleware is implemented but not yet applied to all `/api/*` routes (pending staged rollout to avoid breaking demo mode).
- **Email notifications**: dispatch type `email` is a console-log placeholder; wire up SendGrid/Resend before production.
- **Stripe billing**: requires `STRIPE_SECRET_KEY` and a real Stripe account to test checkout.
- **Dashboard served separately**: dashboard is a static HTML file; it must be configured with `window.JULESOPS_API` pointing to the backend URL when served from a different origin.
- **No external beta repositories yet**: criteria in §1.4 not yet met — this is the target for the next milestone.

### 3.5 Next steps for external beta

1. Register a dev GitHub App with the permissions listed in `docs/local-webhook-dev.md`.
2. Install on 3-5 external repositories.
3. Run the backend with Postgres (`DATABASE_URL`) and GitHub App credentials.
4. Invite beta participants, collect feedback via GitHub Discussions.
5. Update §3.5 with: repo names, dates, issues found, config changes made.
6. When 3+ repos have run for 14 days without critical issues → exit beta → Marketplace submission.