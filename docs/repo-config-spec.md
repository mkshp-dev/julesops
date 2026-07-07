# JulesOps repository config spec

This document defines the config contract for repositories adopting JulesOps.

Config file location:

- `.github/julesops.yml`

---

## Stability definitions

| Badge | Meaning |
|---|---|
| **Stable** | This field is part of the v1 contract. It is consumed by shipping workflows, has been validated across multiple external repositories, and will not change shape or semantics without a major version bump. |
| **Experimental** | This field is declared in the spec but is not yet fully honored by the workflow kit. It may change shape, be renamed, or be removed before stabilization. Adopters should not depend on its exact behavior. |

Top-level shape:

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
  issue_completion:
    close_on_merge: true
  watchdog:
    stale_in_progress_hours: 24
    stale_review_hours: 72
```

---

# 1. `enabled` — **Stable**

```yaml
enabled: true
```

Whether JulesOps is active for the repository.

If `false`, dispatch workflows should exit without selecting work.

---

# 2. `repository.base_branch` — **Stable**

```yaml
repository:
  base_branch: Dev
```

The branch Jules should target when opening implementation PRs.

Examples:
- `main`
- `master`
- `develop`
- `Dev`

This value is consumed by the dispatch workflow and should be included in the prompt passed to Jules.

---

# 3. `queue`

## `queue.queue_label` — **Stable**

```yaml
queue:
  queue_label: jules-queue
```

The label that marks issues as eligible for JulesOps queueing.

## `queue.max_active_jobs` — **Experimental**

```yaml
queue:
  max_active_jobs: 1
```

The maximum number of active Jules issues allowed at once.

### Current v1 behavior
The first-pass workflow kit currently behaves as **single-active-job by default**. The current implementation uses the presence of issues in active states to prevent dispatching new work.

In other words, `max_active_jobs` is currently more of a config declaration than a fully generalized scheduler input.

That is acceptable for v1, but the eventual goal is for the workflow kit or future control plane to honor values greater than 1 explicitly.

---

# 4. `states` — **Stable**

```yaml
states:
  todo: status:todo
  in_progress: status:in-progress
  review: status:review
  blocked: status:blocked
  failed: status:failed
  done: status:done
```

These labels define the JulesOps state machine.

## Required semantics
- `todo`: queued and ready for dispatch
- `in_progress`: Jules has been dispatched successfully and work is active
- `review`: Jules has opened a PR and the issue is awaiting maintainer review / merge
- `blocked`: Jules could not continue safely and left a blocked comment, or a linked PR was closed without merge
- `failed`: the dispatch / invocation step failed before work could proceed normally
- `done`: the linked PR merged and the issue is complete

The actual label names are configurable, but the workflows assume the semantic roles above.

---

# 5. `instructions` — **Stable**

```yaml
instructions:
  core: .github/jules-core.md
  repo: .github/jules-repo.md
```

Paths to the instruction files used to build the Jules prompt.

## `instructions.core` — **Stable**
Path to the generic JulesOps orchestration contract.

## `instructions.repo` — **Stable**
Path to the adopting repository’s repo-specific implementation guidance.

The repo-specific file is optional in principle, but strongly recommended in practice.

---

# 6. `blocked_comment.marker` — **Stable**

```yaml
blocked_comment:
  marker: "## Blocked"
```

A string marker used by the state-sync workflow to recognize blocked comments left by Jules.

If an issue comment contains this marker while the issue is in progress, JulesOps should move the issue to the configured blocked state.

---

# 7. `issue_completion.close_on_merge` — **Stable**

```yaml
issue_completion:
  close_on_merge: true
```

Whether JulesOps should automatically close the linked issue when the PR merges.

If `false`, the workflow may still mark the issue `done` but leave the issue open for a human closer.

---

# 8. `watchdog` — **Stable**

```yaml
watchdog:
  stale_in_progress_hours: 24
  stale_review_hours: 72
```

Thresholds used by `Jules Watchdog` to decide when an issue should receive a stale reminder comment.

## `watchdog.stale_in_progress_hours`
How long an issue may remain in `in_progress` without GitHub activity before the watchdog comments.

## `watchdog.stale_review_hours`
How long an issue may remain in `review` without GitHub activity before the watchdog comments.

### Current v1 behavior
The watchdog is currently **comment-only**. It does not automatically requeue, relabel, or close issues.

# 9. `pull_request` — **Stable**

```yaml
pull_request:
  target_base_branch_only: true
  require_issue_link: true
```

Configures validations applied when a pull request linked to a Jules issue is opened or reopened.

## `pull_request.target_base_branch_only` — **Stable**

Whether JulesOps should validate that a pull request linked to a Jules issue targets the repository's configured `repository.base_branch`.

If `true` and the pull request targets a different branch, JulesOps will:
- Comment on the pull request alerting the author.
- Comment on the linked issue.
- Mark the issue as `blocked` instead of moving it to the `review` state.

## `pull_request.require_issue_link` — **Stable**

Whether JulesOps should validate that a pull request linked to a Jules issue contains a valid closing reference to a tracked issue (e.g. `Closes #123` or `Fixes #123`).

If `true` and no valid link is present, JulesOps will:
- Comment on the pull request alerting the author.
- Halt state transitions (the issue will not transition to `review`).

---

# 10. Future / experimental additions

The following fields are plausible extensions but are **not yet part of the stable contract**. They are labeled **Experimental** and may change or be removed.

## Retry policy — **Experimental**
```yaml
retry:
  allow_requeue_from_failed: true
  allow_requeue_from_blocked: true
```

Potential future meaning:
- whether maintainers can trigger a standardized retry path
- whether comment-command retries should be enabled

## Completion comment behavior — **Experimental**
```yaml
completion:
  require_issue_comment_summary: true
```

Potential future meaning:
- require or validate that Jules leaves a completion summary on the issue

---

# 11. Validation expectations for v1

A repository adopting JulesOps should ensure:
- the YAML parses correctly
- all referenced instruction paths exist
- the configured labels actually exist in the repository
- the configured base branch exists

The first-pass workflows do not yet perform exhaustive schema validation. They assume the repository owner has configured the contract sensibly.

---

# 12. Reference example

See `examples/aggregator/julesops.yml` for a concrete config example based on an Aggregator-style adopting repository.

---

# 13. v1 contract guarantee

All fields marked **Stable** in this document are part of the v1 free-core config contract. They:

- Are consumed by the shipping workflow kit (dispatch, state-sync, watchdog)
- Have been validated across 5 external repositories in the beta pass (see `docs/beta-report.md`)
- Will not change key names, nesting, or semantics without a major version bump
- Have sensible defaults in `resolve-config.py` that allow the config to work with minimal customization

Fields marked **Experimental** carry no such guarantee and adopters should expect possible changes.

---

# 14. Stability summary

| Field path | Stability | Consumed by |
|---|---|---|
| `julesops.enabled` | **Stable** | dispatch |
| `julesops.repository.base_branch` | **Stable** | dispatch, state-sync |
| `julesops.queue.queue_label` | **Stable** | dispatch, state-sync, watchdog |
| `julesops.queue.max_active_jobs` | **Experimental** | _(declared only; single-job enforcement)_ |
| `julesops.states.*` (6 fields) | **Stable** | dispatch, state-sync, watchdog |
| `julesops.instructions.core` | **Stable** | dispatch |
| `julesops.instructions.repo` | **Stable** | dispatch |
| `julesops.blocked_comment.marker` | **Stable** | state-sync |
| `julesops.pull_request.target_base_branch_only` | **Stable** | state-sync |
| `julesops.pull_request.require_issue_link` | **Stable** | state-sync |
| `julesops.issue_completion.close_on_merge` | **Stable** | state-sync |
| `julesops.watchdog.stale_in_progress_hours` | **Stable** | watchdog |
| `julesops.watchdog.stale_review_hours` | **Stable** | watchdog |
| `retry.*` | **Experimental** | _(not yet implemented)_ |
| `completion.*` | **Experimental** | _(not yet implemented)_ |
