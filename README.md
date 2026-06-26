# JulesOps

JulesOps is a **Jules-specific DevOps layer** for GitHub repositories.

Its goal is to make Google Jules usable as a reliable implementation agent inside real repository workflows by adding:

- **Queueing and dispatch** of Jules work from GitHub issues
- **State synchronization** between issues, Jules runs, and pull requests
- **Safety rails** such as branch targeting rules, blocked-task handling, and explicit review states
- **Observability** around what Jules is working on, what is blocked, and what has been merged

## Current scope

This repository is the **JulesOps source kit**, not an adopting repository.

The current product surface is a portable workflow kit that can be installed into another GitHub repository for testing and adoption. It includes:

- a reusable GitHub issue template for Jules tasks
- generic orchestration instructions for Jules
- a repo config contract via `.github/julesops.yml`
- canonical dispatch, state-sync, and watchdog workflow templates
- installer and validator scripts
- install / adoption docs and a concrete Aggregator example

## Product direction

JulesOps is intentionally **Jules-specific** for the first phase.

The near-term product thesis is:

> Turn GitHub issues into safe, reviewable Jules work, and keep issue/PR state coherent without maintainers having to babysit the workflow.

The long-term product goal is to make JulesOps available through GitHub Marketplace.

1. **Free core / open workflow kit**
   - reusable issue template
   - dispatch workflow
   - state sync workflow
   - watchdog workflow
   - repo configuration
   - installer / validator scripts
   - adoption docs / examples

2. **Paid control plane**
   - cross-repo visibility
   - job history and analytics
   - stale-run detection and operational alerts
   - multi-repo management and reporting
   - hosted setup / upgrade management

See [docs/marketplace-roadmap.md](docs/marketplace-roadmap.md) for the open-core boundary.

## Repository layout

```text
julesops/
├─ README.md
├─ docs/
│  ├─ architecture.md
│  ├─ install.md
│  ├─ marketplace-roadmap.md
│  ├─ product.md
│  ├─ repo-config-spec.md
│  └─ state-machine.md
├─ scripts/
│  ├─ install-julesops.ps1
│  └─ validate-kit.ps1
├─ templates/
│  ├─ jules-core.md
│  ├─ jules-task.yml
│  └─ julesops.yml
├─ workflows/
│  ├─ jules-dispatch.yml
│  ├─ jules-state-sync.yml
│  └─ jules-watchdog.yml
└─ examples/
   └─ aggregator/
```

## Quick install into a test repository

From this repository, run:

```powershell
.\scripts\install-julesops.ps1 -TargetRepo "C:\path\to\target-repo" -BaseBranch main
.\scripts\validate-kit.ps1 -TargetRepo "C:\path\to\target-repo"
```

Then, in the target repository:

1. Edit `.github/jules-repo.md` with repository-specific Jules guidance.
2. Create the labels referenced by `.github/julesops.yml`.
3. Add the `JULES_API_KEY` repository secret.
4. Create a Jules task issue and run `Jules Dispatch` manually.

See [docs/install.md](docs/install.md) for the full install guide.

## What lives where

### JulesOps owns

- queueing and dispatch logic
- issue to PR state transitions
- blocked / failed conventions
- stale-state detection via the watchdog workflow
- the generic Jules orchestration contract
- the repo config contract
- reusable workflow / template artifacts
- installer and validation tooling

### The adopting repository owns

- repo-specific implementation guidance in `.github/jules-repo.md`
- its base branch and label names via `.github/julesops.yml`
- issue acceptance criteria and scope
- domain-specific migration / testing / architecture rules

## Current watchdog behavior

The watchdog implementation is intentionally conservative.

It currently:

- scans open Jules issues in `in-progress`
- scans open Jules issues in `review`
- checks how long they have gone without GitHub activity
- posts a structured reminder comment when they cross a configured staleness threshold

The watchdog is **comment-only**. It does not automatically requeue, relabel, or close issues.

Default thresholds:

- `in-progress`: 24 hours
- `review`: 72 hours

These can be overridden in `.github/julesops.yml`.

## Development milestones

### Milestone 1 - installable workflow kit

- keep canonical templates in `templates/` and `workflows/`
- install the kit into external repositories with `scripts/install-julesops.ps1`
- validate kit integrity with `scripts/validate-kit.ps1`
- keep examples complete enough to copy and reason from

### Milestone 2 - ops hardening

- add retry / requeue flow
- tighten issue to PR to Jules correlation rules
- validate branch targeting and required issue links
- add optional comment-command ergonomics if useful

### Milestone 3 - marketplace foundation

- test the kit in multiple external repositories
- decide what should move into reusable actions
- define the GitHub App installation model
- design the paid dashboard / multi-repo control plane

## Non-goals for the free core

- requiring a hosted backend for single-repository orchestration
- broad project management / roadmap tooling
- replacing repository-specific coding instructions
- hiding basic issue to PR orchestration behind a paid layer