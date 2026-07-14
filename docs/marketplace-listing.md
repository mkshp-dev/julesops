# JulesOps — GitHub Marketplace Listing

![JulesOps](assets/WideBannerLogo.png)

This document contains the copy and pricing summary for the GitHub Marketplace submission.

---

## Short description (≤ 125 characters)

> Run Google Jules safely from GitHub. JulesOps adds reliable queueing, state sync, and retries automatically.

---

## Full description

Run Google Jules safely from GitHub.

JulesOps adds reliable orchestration around Jules by handling queueing, synchronization, retries, and pull request state automatically. Set it up in under five minutes to keep your repository clean, prevent duplicate runs, and recover from failures automatically.

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
