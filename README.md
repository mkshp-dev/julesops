# JulesOps

JulesOps is a **Jules-specific DevOps layer** for GitHub repositories.

Its goal is to make Google Jules usable as a reliable implementation agent inside a real repository workflow by adding:

- **Queueing and dispatch** of Jules work from GitHub issues
- **State synchronization** between issues, Jules runs, and pull requests
- **Safety rails** such as branch targeting rules, blocked-task handling, and explicit review states
- **Observability** around what Jules is working on, what is blocked, and what has been merged

## Current scope

The initial focus is a **workflow kit + documentation scaffold**.

The workflow-kit surface now includes:
- a reusable GitHub issue template for Jules tasks
- generic orchestration instructions for Jules
- a repo config contract via `.github/julesops.yml`
- canonical dispatch, state-sync, and watchdog workflow templates
- install / adoption docs and a dogfood example based on Aggregator

## Product direction

JulesOps is intentionally **Jules-specific** for the first phase.

The near-term product thesis is:

> Turn GitHub issues into safe, reviewable Jules work, and keep issue/PR state coherent without maintainers having to babysit the workflow.

Planned evolution:

1. **Workflow kit** (free / open core)
   - reusable issue template
   - dispatch workflow
   - state sync workflow
   - watchdog / retry flows
   - repo configuration
   - adoption docs / examples

2. **Control plane / dashboard** (likely paid)
   - cross-repo visibility
   - job history and analytics
   - stale-run detection and operational alerts
   - multi-repo management and reporting

## Current repository layout

```text
julesops/
├─ README.md
├─ docs/
│  ├─ architecture.md
│  ├─ install.md
│  ├─ product.md
│  ├─ repo-config-spec.md
│  └─ state-machine.md
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

## Dogfood status

JulesOps has now been dogfooded in the `Aggregator` repository.

Validated flow in Aggregator:
1. Jules issue created with queue + todo labels
2. `Jules Dispatch` moved it to `in-progress`
3. Jules opened a linked PR
4. `Jules State Sync` moved it to `review`
5. PR merge moved it to `done` and closed the issue

That means the current first-pass workflow contract is no longer just speculative documentation — it has passed an end-to-end test in a real adopting repository.

## What lives where

### JulesOps owns
- queueing and dispatch logic
- issue ↔ PR state transitions
- blocked / failed conventions
- stale-state detection via the watchdog workflow
- the generic Jules orchestration contract
- the repo config contract
- reusable workflow / template artifacts

### The adopting repository owns
- repo-specific implementation guidance in `.github/jules-repo.md`
- its base branch and label names via `.github/julesops.yml`
- issue acceptance criteria and scope
- domain-specific migration / testing / architecture rules

## Current watchdog behavior

The first watchdog implementation is intentionally conservative.

It currently:
- scans open Jules issues in `in-progress`
- scans open Jules issues in `review`
- checks how long they have gone without GitHub activity
- posts a structured reminder comment when they cross a configured staleness threshold

The current watchdog is **comment-only**. It does not automatically requeue, relabel, or close issues.

Default thresholds:
- `in-progress`: 24 hours
- `review`: 72 hours

These can be overridden in `.github/julesops.yml` using a future-facing `watchdog` block.

## Initial development plan

### Milestone 1 — portable workflow kit
- define the generic JulesOps state machine
- split generic orchestration instructions from repo-specific instructions
- port the Aggregator workflow into reusable templates
- define a repo config format
- write adoption / install docs

### Milestone 2 — ops hardening
- add watchdog / stale-job handling
- add retry / requeue flow
- tighten issue ↔ PR ↔ Jules correlation rules
- add optional comment-command ergonomics if useful

### Milestone 3 — second-repo adoption
- adopt JulesOps in a second repository
- use that to refine what belongs in the reusable kit vs repo-specific config
- decide which pieces should move behind a future control plane

## Non-goals for v1

- a full GitHub App on day one
- multi-agent support
- a broad project management dashboard before the workflow kit is stable
- replacing repository-specific coding instructions

## Open questions

- how much of the current workflow should stay as raw workflow YAML vs move into composite actions or a future GitHub App
- whether `max_active_jobs > 1` should be supported in the workflow kit before a control plane exists
- when the product should introduce a Supabase-backed jobs table / dashboard
- where the clean open-core boundary should sit between workflow kit and control-plane features
