# JulesOps — GitHub Marketplace Listing

![JulesOps](assets/WideBannerLogo.png)

This document contains the copy and pricing summary for the GitHub Marketplace submission.

---

## Short description (≤ 125 characters)

> Orchestrate Google Jules inside GitHub. Queue issues, dispatch safely, sync state, and catch failures.

---

## Full description

JulesOps is a **Jules-specific DevOps layer** for GitHub repositories. It bridges the gap between a GitHub issue tracker and Google Jules, giving maintainers a controlled, auditable workflow instead of ad-hoc prompting.

### What it does

**Queue and dispatch**
Add a `jules-queue` label to any GitHub issue formatted with the JulesOps issue template. The dispatch workflow picks it up, moves it to `status:in-progress`, and fires Jules with the right instructions and repository context — one task at a time.

**State synchronization**
When Jules opens a pull request the issue moves to `status:review`. When the PR merges the issue closes. When Jules signals a blocker the issue moves to `status:blocked` and a comment explains why. No manual label management.

**Safety rails**
- Dispatch is gated on a single active job per repository.
- Pull requests must target the configured base branch.
- Issues must link back to a valid open issue before dispatch proceeds.

**Watchdog**
A scheduled watchdog detects stale in-progress and review states and posts a comment nudging the maintainer before work silently disappears.

**Legible failures**
Failed runs land on `status:failed` with a comment explaining the failure. Issues can be requeued with a `/jules retry` comment.

### What you get (free kit)

- GitHub issue template for Jules tasks
- Dispatch, state-sync, and watchdog workflow files
- Repository config contract (`.github/julesops.yml`)
- Generic Jules orchestration instructions
- PowerShell installer and validator scripts
- Label bootstrap script
- Config resolver (pure Python stdlib, no dependencies)

### What is not included

The free kit is a single-repository workflow kit. There is no hosted dashboard, cross-repo visibility, or billing integration in the free tier. A hosted control plane with those features is in development.

---

## Pricing

| Plan | Price | What's included |
|---|---|---|
| **Free** | $0 / forever | Full workflow kit — dispatch, state-sync, watchdog, config, installer, validator |
| **Pro** *(planned)* | TBD | Hosted dashboard, cross-repo visibility, job history, operational alerts, managed upgrades |

The free tier has no usage caps on the workflow kit itself. GitHub Actions usage limits apply per your GitHub plan.

---

## Categories

- Automation
- Code review
- Continuous integration
- Project management

---

## Supported GitHub features

- GitHub Actions
- GitHub Issues
- GitHub Labels
- GitHub Pull Requests

---

## Requirements

- A GitHub repository with GitHub Actions enabled
- A Jules API key stored as a repository secret named `JULES_API_KEY`
- PowerShell 5.1+ (Windows) or PowerShell Core 7+ (macOS/Linux) for the installer
- `git` CLI
- GitHub CLI (`gh`) — recommended; used by the installer to create labels automatically. If absent or unauthenticated, the installer prints a manual label checklist instead.

---

## Links

| Resource | URL |
|---|---|
| Source repository | `https://github.com/mkshp-dev/julesops` |
| Installation docs | `docs/install.md` |
| Config reference | `docs/repo-config-spec.md` |
| Privacy policy | `PRIVACY.md` |
| Terms of service | `TERMS.md` |
| Security policy | `SECURITY.md` |
| Changelog | `CHANGELOG.md` |

---

## Screenshots

### Issue template — Jules Task form
![Issue Template](assets/IssueTemplateSS.png)

### Dispatch workflow run — GitHub Actions
![Dispatch Workflow](assets/DispatchWorkflowSS.png)

### State flow — issue lifecycle after PR merge
![State Flow](assets/StateFlowSS.png)

---

## Logo assets

| Asset | File | Use |
|---|---|---|
| Square mark (512×512) | `docs/assets/logo.png` | Marketplace icon, favicon |
| Wide banner (1280×640) | `docs/assets/WideBannerLogo.png` | README header, Marketplace hero |

---

## Marketplace listing checklist

- [x] Short description ≤ 160 characters
- [x] Full description reviewed — no overclaiming of hosted/paid features
- [x] Pricing table matches actual free/paid boundary
- [x] Privacy policy finalized (`PRIVACY.md`)
- [x] Terms of service finalized (`TERMS.md`)
- [x] Logo / screenshot assets created and stored in `docs/assets/`
- [x] Category tags selected
- [x] Support contact confirmed (GitHub Issues)
- [x] Security policy URL set (`SECURITY.md`)
- [x] E2E test proof available — see [`docs/e2e-adoption-test.md`](e2e-adoption-test.md)
