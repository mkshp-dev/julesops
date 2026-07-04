# JulesOps Public Documentation

This document covers the current JulesOps free workflow kit and the planned hosted control-plane features.

Current shipping status:

- The **free workflow kit** is installable into a single repository.
- The **hosted GitHub App, dashboard, billing, RBAC, and multi-repo control plane** are currently designed/prototyped, not production services in this repository.

---

## 1. Installation

### Prerequisites

- A GitHub repository where you want to use JulesOps.
- A Jules API key stored as a GitHub Actions secret named `JULES_API_KEY`.
- PowerShell 5.1+ on Windows or PowerShell Core 7+ on macOS/Linux.
- `git` and, for label bootstrapping, the GitHub CLI (`gh`).

### Install Steps

```powershell
# Clone the JulesOps source kit
git clone https://github.com/mkshp-dev/julesops.git
cd julesops

# Install into your target repository
.\scripts\install-julesops.ps1 `
  -TargetRepo "C:\path\to\your\repo" `
  -BaseBranch "main" `
  -QueueLabel "jules-queue"
```

The installer copies the following files into your repository:

- `.github/workflows/jules-dispatch.yml`
- `.github/workflows/jules-state-sync.yml`
- `.github/workflows/jules-watchdog.yml`
- `.github/julesops.yml`
- `.github/jules-core.md`
- `.github/jules-repo.md` if missing
- `.github/resolve-config.py`
- `.github/ISSUE_TEMPLATE/jules-task.yml`

### Validate Installation

```powershell
.\scripts\validate-kit.ps1 -TargetRepo "C:\path\to\your\repo"
```

### Bootstrap Labels

Run this from the JulesOps source repository:

```powershell
.\scripts\bootstrap-labels.ps1 -TargetRepo "C:\path\to\your\repo"
```

If GitHub authentication or a GitHub remote is unavailable, the script prints a manual label checklist.

---

## 2. Configuration

Edit `.github/julesops.yml` in your repository to customize behavior. The canonical default shape lives in `templates/julesops.yml`; see `docs/repo-config-spec.md` for the full contract.

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

---

## 3. Upgrade

When a new JulesOps version is released, upgrade your installation by re-running the installer:

```powershell
.\scripts\install-julesops.ps1 -TargetRepo "C:\path\to\your\repo" -BaseBranch main -Upgrade
```

The installer refreshes JulesOps-managed workflow/template files. It preserves `.github/jules-repo.md`, and `-Upgrade` preserves `.github/julesops.yml` unless `-Force` is also provided.

---

## 4. Uninstall

To remove JulesOps from your repository, delete the following files:

```text
.github/workflows/jules-dispatch.yml
.github/workflows/jules-state-sync.yml
.github/workflows/jules-watchdog.yml
.github/julesops.yml
.github/jules-core.md
.github/jules-repo.md
.github/resolve-config.py
.github/ISSUE_TEMPLATE/jules-task.yml
```

Labels created by JulesOps must be removed manually from your repository's Labels settings page.

---

## 5. Free Workflow Kit Permissions

The free workflow kit uses the `GITHUB_TOKEN` automatically provided by GitHub Actions. No additional OAuth tokens are required.

| Workflow | Permission | Reason |
| --- | --- | --- |
| `jules-dispatch.yml` | `contents: read` | Check out config and instruction files |
| `jules-dispatch.yml` | `issues: write` | Move issue labels and post status comments |
| `jules-dispatch.yml` | `pull-requests: read` | Respect active linked PR state |
| `jules-state-sync.yml` | `contents: read` | Read config helper and config |
| `jules-state-sync.yml` | `issues: write` | Move labels and comment on issues |
| `jules-state-sync.yml` | `pull-requests: read` | Read PR event data and comment via `gh pr comment` using issue permissions |
| `jules-state-sync.yml` | `actions: write` | Trigger `Jules Dispatch` after authorized retry/requeue commands |
| `jules-watchdog.yml` | `contents: read` | Read config helper and config |
| `jules-watchdog.yml` | `issues: write` | Comment on stale issues and repair labels |
| `jules-watchdog.yml` | `pull-requests: read` | Inspect linked open PRs |

---

## 6. Security Model

- **Secrets**: Only `JULES_API_KEY` is required for the free kit. It is stored in GitHub repository secrets and must never be committed.
- **Workflow permissions**: Workflows request only the GitHub token permissions they need.
- **Comment commands**: Retry/requeue commands must be authorized before changing labels or triggering dispatch.
- **Hosted App**: The planned hosted App validates GitHub webhook payloads using HMAC-SHA256 signature verification.
- **Data**: The free workflow kit does not send job data to JulesOps-hosted services. Hosted control-plane data handling is documented separately before paid launch.

See `SECURITY.md` for vulnerability reporting.

---

## 7. Future Hosted Control Plane

Future hosted-control-plane work is tracked in GitHub issues instead of roadmap docs.
The dashboard under `dashboard/` is currently a prototype using mock data.