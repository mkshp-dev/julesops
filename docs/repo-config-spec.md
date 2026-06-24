# JulesOps repository config spec

This document defines the first-pass configuration contract for a repository that wants to adopt JulesOps.

The exact filename is still open, but the working assumption is a repository-level file such as `.github/julesops.yml` or `julesops.yml`.

---

## Design goals

The config should allow a repository to customize:

- which branch Jules PRs should target
- which labels represent queue and status states
- where JulesOps should find generic vs repo-specific instructions
- whether issue closure and other behaviors are enabled
- basic concurrency / queue behavior

It should **not** try to encode repository-specific implementation guidance. That belongs in repo-specific Jules instructions.

---

## Proposed v1 schema

```yaml
julesops:
  enabled: true

  repository:
    base_branch: Dev

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

  pull_request:
    require_issue_link: true
    target_base_branch_only: true
```

---

## Field descriptions

## `enabled`
Whether JulesOps automation should run for the repository.

## `repository.base_branch`
The branch that Jules work should target.

Example:
- `Dev`
- `main`

## `queue.queue_label`
The label used to identify issues that belong to the Jules queue.

Example:
- `jules-queue`

## `queue.max_active_jobs`
Maximum number of active Jules jobs allowed at once in the repository.

The first implementation should default to `1`.

## `states.*`
Maps canonical JulesOps states to repository-specific labels.

This keeps the internal state machine stable while letting repositories choose their label names.

## `instructions.core`
Path to the **generic orchestration instructions** that Jules should always follow in a JulesOps-enabled repo.

Example:
- `.github/jules-core.md`

## `instructions.repo`
Path to the **repo-specific implementation instructions** for that repository.

Example:
- `.github/jules-repo.md`

## `blocked_comment.marker`
Marker string used to detect a structured blocked comment from Jules.

The first implementation will likely use a simple substring check.

## `issue_completion.close_on_merge`
Whether JulesOps should close the issue automatically when the linked PR is merged into the configured base branch.

## `pull_request.require_issue_link`
Whether Jules-created PRs are expected to include a GitHub issue-closing reference such as `Closes #123`.

## `pull_request.target_base_branch_only`
Whether JulesOps should assume Jules PRs must target the configured base branch and treat other target branches as invalid / out of policy.

---

## Example: Aggregator-style config

```yaml
julesops:
  enabled: true

  repository:
    base_branch: Dev

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

  pull_request:
    require_issue_link: true
    target_base_branch_only: true
```

---

## Likely future extensions

These do **not** need to be in the first implementation, but are plausible future additions:

- `watchdog.max_in_progress_age_hours`
- `watchdog.max_review_age_hours`
- `retry.allow_comment_commands`
- `retry.comment_command_prefix`
- `notifications.*`
- `dashboard.*`
- `backend.*` for optional hosted control-plane integration

---

## Open questions

1. Should the config live at `.github/julesops.yml` or repository root?
2. Should `dispatching` be a configurable state label from day one, or stay implicit until it exists operationally?
3. Should there be an explicit config field for which labels count as “active” when blocking dispatch of the next issue?
