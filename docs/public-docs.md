# JulesOps Public Documentation

This document provides comprehensive end-user documentation for JulesOps covering installation, upgrade, uninstall, permissions, security model, data retention, billing, and plan limits.

---

## 1. Installation

### Prerequisites
- A GitHub repository where you want to use JulesOps.
- A [Jules AI](https://jules.google.com) API key stored as a GitHub Actions secret named `JULES_API_KEY`.
- PowerShell 5.1+ (Windows) or PowerShell Core 7+ (macOS/Linux).

### Install Steps
```powershell
# Clone the JulesOps source kit
git clone https://github.com/mkshp-dev/julesops.git
cd julesops

# Install into your target repository (replace placeholders)
.\scripts\install-julesops.ps1 `
  -TargetRepo "C:\path\to\your\repo" `
  -BaseBranch "main" `
  -QueueLabel "jules-queue"
```

The installer copies the following files into your repository:
- `.github/workflows/jules-dispatch.yml`
- `.github/workflows/jules-state-sync.yml`
- `.github/workflows/jules-watchdog.yml`
- `.github/julesops.yml` (config)
- `.github/jules-core.md` (Jules instructions)

### Validate Installation
```powershell
.\scripts\validate-kit.ps1 -TargetRepo "C:\path\to\your\repo"
```

---

## 2. Configuration

Edit `.github/julesops.yml` in your repository to customize behavior:

```yaml
base_branch: main
queue_label: jules-queue
labels:
  todo: "status:todo"
  in_progress: "status:in-progress"
  review: "status:review"
  blocked: "status:blocked"
  failed: "status:failed"
  done: "status:done"
max_active_jobs: 1
blocked_comment_marker: "## Blocked"
close_on_merge: true
```

---

## 3. Upgrade

When a new JulesOps version is released, upgrade your installation by re-running the installer:

```powershell
.\scripts\install-julesops.ps1 -TargetRepo "C:\path\to\your\repo" -BaseBranch main
```

The installer will overwrite workflow files and update version markers. Your `julesops.yml` config and `jules-repo.md` files are **not** overwritten.

---

## 4. Uninstall

To remove JulesOps from your repository, delete the following files:
```
.github/workflows/jules-dispatch.yml
.github/workflows/jules-state-sync.yml
.github/workflows/jules-watchdog.yml
.github/julesops.yml
.github/jules-core.md
.github/resolve-config.py
```

Labels created by JulesOps must be removed manually from your repository's Labels settings page.

---

## 5. Permissions

JulesOps workflows use the `GITHUB_TOKEN` automatically provided by GitHub Actions. No additional OAuth tokens are required for the free kit.

When using the hosted GitHub App (Phase 4+), the App requests:

| Scope | Level | Reason |
| --- | --- | --- |
| Metadata | Read-only | Validate webhooks, access repo info |
| Issues | Read/Write | Manage labels, post status comments |
| Pull Requests | Read/Write | Validate PR targets, post warnings |
| Contents | Read-only | Read `julesops.yml` and instruction files |
| Actions | Read-only | Monitor workflow run outcomes |

No organization-wide permissions are requested.

---

## 6. Security Model

- **Secrets**: Only `JULES_API_KEY` is required. It is stored in GitHub repository secrets and never logged.
- **Workflow permissions**: All workflows follow least-privilege. The `GITHUB_TOKEN` is scoped to the minimum required.
- **Webhook secrets**: The hosted App validates all GitHub webhook payloads using HMAC-SHA256 signature verification.
- **Data**: JulesOps does not access your code content, only issue metadata. See [SECURITY.md](../SECURITY.md).

---

## 7. Data Retention

| Data Type | Retention Policy |
| --- | --- |
| Active job records | Kept indefinitely while active |
| Completed / failed job records | Hot storage for 90 days, then cold archival |
| Webhook event audit logs | Same as job records (90-day hot) |
| Archived data | Compressed parquet/JSON in object storage |
| Payment data | Never stored by JulesOps (Stripe handles it) |

---

## 8. Billing & Plan Limits

| Plan | Price | Repositories | History | Notifications | Team Roles |
| --- | --- | --- | --- | --- | --- |
| Free | $0/month | Unlimited (single-dashboard) | Last 7 days | GitHub only | ❌ |
| Pro | $9/month/org | Unlimited multi-repo | 90 days | Email + Webhook | ❌ |
| Team | $29/month/org | Unlimited multi-repo | 90 days | Email + Webhook | ✅ RBAC |

Billing is managed via Stripe. Downgrading from a paid plan preserves your data for 30 days.
