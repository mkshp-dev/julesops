# JulesOps

JulesOps is a **Jules-specific DevOps layer** for GitHub repositories.

Its goal is to make Google Jules usable as a reliable implementation agent inside a real repository workflow by adding:

- **Queueing and dispatch** of Jules work from GitHub issues
- **State synchronization** between issues, Jules runs, and pull requests
- **Safety rails** such as branch targeting rules, blocked-task handling, and explicit review states
- **Observability** around what Jules is working on, what is blocked, and what has been merged

## Current scope

The initial focus is a **workflow kit + documentation scaffold**:

- a reusable GitHub issue template for Jules tasks
- generic orchestration instructions for Jules
- GitHub Actions workflows for dispatch and state sync
- a repo config contract for repositories that want to adopt JulesOps
- docs describing the state machine and architecture

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

2. **Control plane / dashboard** (likely paid)
   - cross-repo visibility
   - job history and analytics
   - stale-run detection and operational alerts
   - multi-repo management and reporting

## Repository layout

```text
julesops/
├─ README.md
├─ docs/
│  ├─ product.md
│  ├─ state-machine.md
│  └─ repo-config-spec.md
├─ .github/
│  ├─ jules-core.md
│  └─ ISSUE_TEMPLATE/
│     └─ jules-task.yml
└─ examples/
   └─ aggregator/
```

## Initial development plan

### Milestone 1 — portable workflow kit
- define the generic JulesOps state machine
- split generic orchestration instructions from repo-specific instructions
- port the existing Aggregator workflow into reusable templates
- define a repo config format

### Milestone 2 — ops hardening
- add watchdog / stale-job handling
- add retry / requeue flow
- add explicit dispatch failure handling
- tighten issue ↔ PR ↔ Jules correlation rules

### Milestone 3 — second-repo adoption
- dogfood JulesOps in Aggregator
- adopt it in a second repo
- use that to refine what belongs in the reusable kit vs repo-specific config

## Non-goals for v1

- a full GitHub App on day one
- multi-agent support
- a broad project management dashboard before the workflow kit is stable
- replacing repository-specific coding instructions

## Open questions

- what the default repo config contract should look like
- how much state should live purely in GitHub labels vs an external backend
- when the product should introduce a Supabase-backed jobs table / dashboard
- whether the open-core boundary should be at workflow-kit vs dashboard / control-plane features
