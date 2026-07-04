# JulesOps Operational Monitoring & Admin Tools

This document describes operational monitoring for the hosted App and dashboard. A minimal runnable backend skeleton now exists in `server/`; health, metrics, webhook ingestion, read-only dashboard data endpoints, SendGrid-backed email alert delivery, and the first admin inspection/replay APIs are implemented there. Durable database storage, billing, and broader production alerting remain planned.

---

## 1. Operational Monitoring

### 1.1 Health Check Endpoints
The current server skeleton exposes these health check endpoints:

| Endpoint | Description |
| --- | --- |
| `GET /health` | Returns `200 OK` if the service is running |
| `GET /health/db` | Returns DB connectivity status |
| `GET /health/stripe` | Returns Stripe API reachability |
| `GET /health/github` | Returns GitHub API rate-limit status |

These endpoints should be polled by an external uptime monitor (e.g. UptimeRobot, Better Uptime) every 60 seconds.

### 1.2 Application Metrics
The current server skeleton exports initial Prometheus-compatible metrics at `/metrics`; future production metrics should expand this list:

| Metric | Description |
| --- | --- |
| `julesops_webhook_received_total` | Total webhooks received, labelled by event type |
| `julesops_webhook_processing_duration_seconds` | Histogram of handler processing time |
| `julesops_jobs_active_total` | Gauge of currently active jobs across all installations |
| `julesops_dispatch_failures_total` | Counter of failed dispatch workflow runs |
| `julesops_db_query_duration_seconds` | Histogram of DB query latency |

### 1.3 Alerting Rules
The following conditions should trigger operator PagerDuty/Slack alerts. Email delivery uses SendGrid via `SENDGRID_API_KEY` and `ALERT_EMAIL_FROM` when configured; demo mode can still fall back to console logging:

| Condition | Severity | Action |
| --- | --- | --- |
| `/health` returns non-2xx for 2+ consecutive checks | Critical | Page on-call engineer |
| `julesops_webhook_processing_duration_seconds p99 > 5s` | Warning | Investigate handler bottleneck |
| `invoice.payment_failed` rate > 10% in 1 hour | Warning | Review Stripe dashboard |
| DB connection pool exhausted | Critical | Scale DB or investigate connections |

---

## 2. Admin Tools

### 2.1 Installation Inspection
The admin API exposes installation inspection endpoints:

```bash
# View installation details
GET /admin/installations/{installation_id}

# List all repositories under an installation
GET /admin/installations/{installation_id}/repositories

# View active jobs for an installation
GET /admin/installations/{installation_id}/jobs?status=in-progress
```

### 2.2 Failed Webhook Replay
When a webhook handler fails (e.g. DB timeout), the raw payload is stored in the `events` table for replay. The admin API supports replaying failed events after authorization:

```bash
# List failed events in last 24 hours
GET /admin/events?status=failed&since=24h

# Replay a specific event by ID
POST /admin/events/{event_id}/replay
```

### 2.3 Job Management
Future admins may force-transition jobs in cases where automated self-healing fails:

```bash
# Force-close a stale job
PATCH /admin/jobs/{job_id}
{ "status": "done", "reason": "Manually resolved by admin" }

# Force-retry a failed dispatch
POST /admin/jobs/{job_id}/retry
```

---

## 3. Support Tooling

### 3.1 Support Lookup
Future support engineers should be able to look up an installation by GitHub org slug or installation ID:

```bash
GET /admin/support/lookup?org=mkshp-dev
```

### 3.2 Audit Log Access
The admin action audit trail is persisted for compliance queries:

```bash
GET /admin/actions?installation_id=123&limit=50
```



