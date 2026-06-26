# JulesOps architecture

This document describes the intended **v1 architecture** of JulesOps and how it should evolve from a repository-local workflow kit into a larger control plane.

---

# 1. Architectural principle

JulesOps should be split into **three conceptual layers** even if the first implementation only ships the first one.

## Layer A — workflow kit (v1, open core)
GitHub-native automation that lives inside the adopting repository.

Responsibilities:
- issue template for Jules tasks
- queue / dispatch workflow
- issue ↔ PR state synchronization
- blocked / failed labeling rules
- watchdog / retry flows
- generic orchestration instructions for Jules
- repository config file consumption

## Layer B — optional backend / control-plane data store (later)
A persistent system of record for JulesOps jobs across repositories.

Responsibilities:
- durable job history
- attempt history and retries
- stale-run detection across repos
- analytics and reporting
- cross-repo visibility
- alerting / notifications

## Layer C — GitHub App / hosted control plane (later)
A productized installation and orchestration surface.

Responsibilities:
- installation / auth
- webhook ingestion
- repo onboarding UX
- comment commands and richer controls
- hosted dashboard and multi-repo management

---

# 2. v1 scope: workflow kit only

The first version of JulesOps should be implementable **without** a GitHub App or hosted backend.

That means:
- state lives primarily in GitHub issues / PRs / labels
- workflows are executed in GitHub Actions
- repo-specific instructions are stored in the adopting repository
- the queue is managed with GitHub labels and workflow logic

This is deliberate. The workflow abstraction needs to stabilize before the product grows a separate hosted control plane.

---

# 3. Core v1 components

## 3.1 Repository config
A repository opting into JulesOps should provide a config file, likely at:

- `.github/julesops.yml`

The config defines:
- base branch
- queue label
- label mapping for states
- instruction file paths
- blocked comment marker
- close-on-merge behavior
- max active jobs

## 3.2 Generic orchestration instructions
JulesOps provides `.github/jules-core.md`, which defines the workflow contract Jules should follow in any JulesOps-managed repo.

## 3.3 Repo-specific instructions
The adopting repository provides `.github/jules-repo.md` (or equivalent) containing repository-specific implementation guidance.

## 3.4 Dispatch workflow
A scheduled or manually triggered GitHub Action that:
1. finds the next eligible queued Jules issue
2. checks whether another Jules issue is already active
3. reads the core + repo instructions
4. reads the issue body
5. invokes Jules with the assembled prompt
6. moves the issue to `status:in-progress` on success
7. moves the issue to `status:failed` on dispatch failure

## 3.5 State sync workflow
A GitHub Action that reacts to:
- pull request open / reopen / close events
- issue comments that contain the blocked marker

It updates issue labels and state based on the JulesOps state machine.

## 3.6 Watchdog workflow
A scheduled workflow that detects stale active jobs, for example:
- issue stuck in `in_progress` for too long without PR or comment activity
- issue stuck in `review` for too long
- possible mismatch between issue state and PR state

---

# 4. State ownership in v1

## GitHub as the source of truth
In v1, the source of truth is GitHub itself:
- issue labels encode the current JulesOps state
- issue comments contain blocked / completion context
- PR state drives review / done / blocked transitions

This is intentionally simple and keeps the first version easy to adopt.

## Consequence
The workflows must be careful to preserve a few invariants:
- only one active issue by default
- merged PR closes or completes the linked issue deterministically
- blocked / failed outcomes are explicit
- dispatch failures do not leave ambiguous in-progress state

---

# 5. Prompt assembly model

The dispatcher should build the Jules prompt from three inputs:

## A. JulesOps core instructions
The generic orchestration contract from `.github/jules-core.md`.

## B. Repo-specific instructions
The adopting repo’s `.github/jules-repo.md`.

## C. The selected issue
At minimum:
- issue number
- issue title
- issue URL
- issue body

The prompt should clearly tell Jules:
- this is the only issue to work on
- what branch to target
- where the repo-specific instructions are
- how to behave if blocked

---

# 6. Future backend model (not v1)

A future backend would likely store a `jules_jobs` table with fields like:

- repository
- issue_number
- current_status
- attempt_number
- dispatched_at
- updated_at
- pr_number
- branch_name
- blocked_reason_summary
- last_sync_source
- last_sync_at
- jules_run_id / session_id if available

This backend would support:
- dashboards
- analytics
- retry tooling
- cross-repo operations
- better watchdogs

But none of that is required for the first portable workflow kit.

---

# 7. Why not start with a GitHub App?

Because the current uncertainty is not authentication or installation mechanics — it is **workflow design**.

JulesOps needs to validate:
- the state machine
- the prompt assembly model
- the repo config contract
- the right failure / retry semantics

Once those are stable across multiple repos, a GitHub App becomes a packaging and productization step rather than a speculative architectural commitment.

---

# 8. Recommended v1 file layout in an adopting repo

```text
.github/
├─ ISSUE_TEMPLATE/
│  └─ jules-task.yml
├─ workflows/
│  ├─ jules-dispatch.yml
│  ├─ jules-state-sync.yml
│  └─ jules-watchdog.yml
├─ jules-core.md           # from JulesOps
├─ jules-repo.md           # repo-specific
└─ julesops.yml            # repo config
```

---

# 9. Near-term implementation plan

## Phase 1
- keep the workflow kit installable from this source repository
- validate canonical templates, workflows, and examples
- test installation into external repositories rather than self-dogfooding this repo

## Phase 2
- add retry / requeue flow
- tighten issue to PR to Jules correlation rules
- validate target branch and required issue links

## Phase 3
- adopt in multiple external repositories
- refine config contract and prompt protocol
- evaluate reusable actions, GitHub App packaging, and hosted control plane work