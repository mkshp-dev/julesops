# JulesOps repository config spec

This document defines the first-pass config contract for repositories adopting JulesOps.

Config file location:

- `.github/julesops.yml`

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
```

---

# 1. `enabled`

```yaml
enabled: true
```

Whether JulesOps is active for the repository.

If `false`, dispatch workflows should exit without selecting work.

---

# 2. `repository.base_branch`

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

## `queue.queue_label`

```yaml
queue:
  queue_label: jules-queue
```

The label that marks issues as eligible for JulesOps queueing.

## `queue.max_active_jobs`

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

# 4. `states`

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

# 5. `instructions`

```yaml
instructions:
  core: .github/jules-core.md
  repo: .github/jules-repo.md
```

Paths to the instruction files used to build the Jules prompt.

## `instructions.core`
Path to the generic JulesOps orchestration contract.

## `instructions.repo`
Path to the adopting repository’s repo-specific implementation guidance.

The repo-specific file is optional in principle, but strongly recommended in practice.

---

# 6. `blocked_comment.marker`

```yaml
blocked_comment:
  marker: "## Blocked"
```

A string marker used by the state-sync workflow to recognize blocked comments left by Jules.

If an issue comment contains this marker while the issue is in progress, JulesOps should move the issue to the configured blocked state.

---

# 7. `issue_completion.close_on_merge`

```yaml
issue_completion:
  close_on_merge: true
```

Whether JulesOps should automatically close the linked issue when the PR merges.

If `false`, the workflow may still mark the issue `done` but leave the issue open for a human closer.

---

# 8. Future / likely additions

The following fields are plausible extensions but are not yet standardized in the first-pass kit:

## Pull request policy
```yaml
pull_request:
  require_issue_link: true
  target_base_branch_only: true
```

Potential future meaning:
- require the PR body to link a tracked issue
- ensure Jules-created PRs target the configured base branch

## Retry / watchdog policy
```yaml
watchdog:
  stale_in_progress_hours: 12
  stale_review_hours: 72
```

Potential future meaning:
- thresholds for stale issue detection
- reminder or requeue policy

## Completion comment behavior
```yaml
completion:
  require_issue_comment_summary: true
```

Potential future meaning:
- require or validate that Jules leaves a completion summary on the issue

---

# 9. Validation expectations for v1

A repository adopting JulesOps should ensure:
- the YAML parses correctly
- all referenced instruction paths exist
- the configured labels actually exist in the repository
- the configured base branch exists

The first-pass workflows do not yet perform exhaustive schema validation. They assume the repository owner has configured the contract sensibly.

---

# 10. Reference example

See `examples/aggregator/julesops.yml` for a concrete config example based on the current Aggregator dogfood setup.
