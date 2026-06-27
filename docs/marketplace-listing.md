# JulesOps — GitHub Marketplace Listing Materials

This document contains draft copy and materials for a future JulesOps GitHub Marketplace listing. The free workflow kit exists today; hosted dashboard, billing, RBAC, and multi-repo control-plane features are planned/prototyped until backed by production services.

---

## Draft status`r`n`r`nDo not publish this listing as-is until the hosted GitHub App, backend, billing, privacy policy, and terms are implemented and verified.`r`n`r`n## Short Description (160 characters max)

> Automate Jules AI workflows across your repositories with queue management, state sync, and a live operations dashboard.

---

## Long Description

**JulesOps** is an open-core automation kit that turns GitHub Issues into managed, queued tasks for the Jules AI coding agent.

Instead of manually triggering Jules and tracking its status, JulesOps installs a set of GitHub Actions workflows that:

- **Queue and dispatch** Jules tasks automatically using issue labels.
- **Track state** across the full lifecycle: `todo → in-progress → review → done / blocked / failed`.
- **Self-heal** with an automated watchdog that detects stale or mismatched states and requeues them.
- **Comment** meaningful status updates on issues at every key transition.

### Key Features

**🆓 Free Workflow Kit**
- Install with a single PowerShell script — no GitHub App or account required.
- Works entirely within your existing GitHub Actions minutes.
- Configurable label names, queue limits, base branches, and blocked markers.

**Planned Hosted Operations Dashboard (Pro / Team)**
- Real-time multi-repository job telemetry.
- Filter by organization, repository, and status.
- Email and webhook alerts for failed or stale work.
- 90-day job and attempt history.

**Planned Team Roles (Team Plan)**
- Role-based access control (Owner, Admin, Member, Viewer).
- Synchronized with GitHub organization memberships.

---

## Screenshots

> Refer to `docs/screenshots/` for annotated images of:
> - Dashboard overview with stats cards
> - Filtered active job table
> - Issue timeline with JulesOps status comments

---

## Pricing Summary

| Plan | Price | Who is it for? |
| --- | --- | --- |
| **Free** | $0/month | Individual developers and single-repo adopters |
| **Pro** | $9/month/org | Small teams needing multi-repo visibility |
| **Team** | $29/month/org | Larger teams with RBAC and priority support needs |

---

## Support URL

[https://github.com/mkshp-dev/julesops/issues](https://github.com/mkshp-dev/julesops/issues)

---

## Privacy Policy

JulesOps collects no personal data beyond what GitHub provides via OAuth (username, email, organization memberships). Webhook payloads are sanitized before cold archival. No data is sold to third parties. Full policy: [`PRIVACY.md`](../PRIVACY.md).

---

## Terms of Service

The free kit is licensed under [`LICENSE`](../LICENSE). Hosted paid plans require final service terms; current draft terms live in [`TERMS.md`](../TERMS.md).
