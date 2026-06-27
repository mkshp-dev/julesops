# JulesOps Private Beta Plan & Config Contract Freeze

This document outlines the private beta programme for JulesOps and defines the proposed stable `v1.0` free-core config contract.

---

## 1. Private Beta Programme

### 1.1 Objectives

- Validate the free workflow kit on 3-5 real external repositories.
- Identify friction points in install, labeling, and dispatch flows.
- Confirm watchdog and state-sync workflows behave correctly under real-world conditions.
- Collect feedback on dashboard prototype usefulness without treating it as production.

### 1.2 Participant Criteria

Private beta participants should:

- Have an active GitHub repository with regular issue activity.
- Be comfortable with the installation script and YAML configuration.
- Agree to provide structured feedback via a shared form or discussion thread.

### 1.3 Beta Invitation Process

1. Operator opens a GitHub Discussion in `mkshp-dev/julesops` announcing beta access.
2. Participants submit their GitHub org/repo via a form or Discussion reply.
3. Operator sends an install guide and records participant feedback weekly.

### 1.4 Success Criteria for Exiting Beta

- At least 3 repositories run JulesOps for at least 14 days without critical issues.
- Watchdog stale detection or mismatch repair triggers successfully in at least 1 real scenario.
- No proposed `v1.0` config fields require breaking changes based on feedback.

---

## 2. Proposed v1.0 Free-Core Config Contract

The following `.github/julesops.yml` fields are proposed as stable for `v1.0`. The canonical default shape lives in `templates/julesops.yml`; see `docs/repo-config-spec.md` for detailed descriptions.

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

  pull_request:
    target_base_branch_only: true
    require_issue_link: true

  issue_completion:
    close_on_merge: true

  watchdog:
    stale_in_progress_hours: 24
    stale_review_hours: 72
```

### Stable Field Groups

- `julesops.enabled`
- `julesops.repository.base_branch`
- `julesops.queue.queue_label`
- `julesops.queue.max_active_jobs`
- `julesops.states.*`
- `julesops.instructions.*`
- `julesops.blocked_comment.marker`
- `julesops.pull_request.*`
- `julesops.issue_completion.close_on_merge`
- `julesops.watchdog.*`

### Experimental / Future Fields

The hosted control plane may later add optional sections such as:

```yaml
julesops:
  notifications:
    on_failure: []
    on_stale: []
```

These are not part of the current free-core workflow contract until documented in `docs/repo-config-spec.md` and supported by code.

### Versioning Policy

- Minor field additions under `julesops` are backward-compatible when optional.
- Renamed or removed stable fields require a major version bump after `v1.0`.
- Experimental fields may change before they are promoted into the stable contract.