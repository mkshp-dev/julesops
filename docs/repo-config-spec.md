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

> **The config file is optional.** Without `.github/julesops.yml`, JulesOps uses the defaults shown in this document. Add the file only to change something. Point the action at a different path with its `config-path` input.

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

## `queue.blocked_holds_queue` — **Stable**

```yaml
queue:
  blocked_holds_queue: false
```

Whether a `blocked` issue stops dispatch. Default `false`: a blocked issue means Jules has stopped and is waiting on a human, so the next queued issue is dispatched while it waits. The blocked issue keeps its label and comment for a maintainer to pick up.

`in_progress` and `review` always hold the queue: Jules is working, or its pull request is open and could conflict with the next task.

Set `true` for the earlier behavior, where any blocked issue stops all dispatch until a maintainer acts.

## `queue.max_attempts` — **Stable**

```yaml
queue:
  max_attempts: 3
```

How many times an issue can be dispatched before `/jules retry` (or `/jules requeue`) refuses to requeue it. Attempts are counted from JulesOps's dispatch comments on the issue. At the limit, JulesOps explains why and asks the maintainer to clarify the issue, then comment `/jules retry --force` to dispatch it anyway.

`0` means no limit. Moving an issue back to `todo` by hand is not limited.

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
  fail_in_progress_hours: 72
```

Thresholds used by `Jules Watchdog` for stale reminders and for failing stuck issues.

## `watchdog.stale_in_progress_hours`
How long an issue may remain in `in_progress` without GitHub activity before the watchdog comments.

## `watchdog.stale_review_hours`
How long an issue may remain in `review` without GitHub activity before the watchdog comments.

## `watchdog.fail_in_progress_hours`
How long an issue may stay `in_progress` before the watchdog marks it `failed`, with a comment explaining why and how to `/jules retry`. This frees the queue when Jules never opens a pull request or reports being blocked (for example, the Jules task died). Measured from when the in-progress label was applied, so comments on the issue don't reset it. `0` disables it. Default `72`.

### Other watchdog behavior
- An in-progress issue whose linked pull request is already open is moved to `review`.
- Reminders (at most one per issue per 24 hours) are comments only. Issues in `review` are never failed automatically: reviewing is the maintainer's call.

# 9. `pull_request` — **Stable**

```yaml
pull_request:
  target_base_branch_only: true
  require_issue_link: true
  jules_authors: google-labs-jules[bot]
```

Configures validations applied when a pull request linked to a Jules issue is opened or reopened.

## `pull_request.target_base_branch_only` — **Stable**

Whether JulesOps should validate that a pull request linked to a Jules issue targets the repository's configured `repository.base_branch`.

If `true` and the pull request targets a different branch, JulesOps will:
- Comment on the pull request alerting the author.
- Comment on the linked issue.
- Mark the issue as `blocked` instead of moving it to the `review` state.

## `pull_request.require_issue_link` — **Stable**

Whether JulesOps should validate that a pull request **created by Jules** contains a valid closing reference to a tracked Jules issue (e.g. `Closes #123` or `Fixes #123`). Human pull requests are never warned.

Jules opens pull requests under the account of the user who started the task, so the PR author is not a reliable signal. A pull request counts as created by Jules when any of its commits is authored by a `jules_authors` login, or its body links a Jules task (`jules.google.com/task/...`).

If `true` and no valid link is present, JulesOps will:
- Comment on the pull request alerting the author.
- Halt state transitions (the issue will not transition to `review`).

## `pull_request.jules_authors` — **Stable**

Comma-separated GitHub logins that Jules authors commits and posts comments as. Default: `google-labs-jules[bot]`.

Used to:
- detect pull requests created by Jules (by commit author), which `require_issue_link` applies to
- authorize blocked-marker comments (in addition to any bot account and repository maintainers)

Matching is case-insensitive. Only change this if Jules commits under a different account in your setup.

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
- Will not change key names, nesting, or semantics without a major version bump
- Have defaults in `templates/resolve-config.py`, so the config file itself is optional

Fields marked **Experimental** carry no such guarantee and adopters should expect possible changes.

---

# 14. Stability summary

| Field path | Stability | Consumed by |
|---|---|---|
| `julesops.enabled` | **Stable** | dispatch |
| `julesops.repository.base_branch` | **Stable** | dispatch, state-sync |
| `julesops.queue.queue_label` | **Stable** | dispatch, state-sync, watchdog |
| `julesops.queue.max_active_jobs` | **Experimental** | _(declared only; single-job enforcement)_ |
| `julesops.queue.blocked_holds_queue` | **Stable** | dispatch |
| `julesops.queue.max_attempts` | **Stable** | sync (`/jules retry`) |
| `julesops.states.*` (6 fields) | **Stable** | dispatch, state-sync, watchdog |
| `julesops.instructions.core` | **Stable** | dispatch |
| `julesops.instructions.repo` | **Stable** | dispatch |
| `julesops.blocked_comment.marker` | **Stable** | state-sync |
| `julesops.pull_request.target_base_branch_only` | **Stable** | state-sync |
| `julesops.pull_request.require_issue_link` | **Stable** | state-sync |
| `julesops.pull_request.jules_authors` | **Stable** | state-sync |
| `julesops.issue_completion.close_on_merge` | **Stable** | state-sync |
| `julesops.watchdog.stale_in_progress_hours` | **Stable** | watchdog |
| `julesops.watchdog.stale_review_hours` | **Stable** | watchdog |
| `julesops.watchdog.fail_in_progress_hours` | **Stable** | watchdog |
| `retry.*` | **Experimental** | _(not yet implemented)_ |
| `completion.*` | **Experimental** | _(not yet implemented)_ |
