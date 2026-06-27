# JulesOps Private Beta Plan & Config Contract Freeze

This document outlines the private beta programme for JulesOps and defines the stable `v1.0` free-core config contract.

---

## 1. Private Beta Programme

### 1.1 Objectives
- Validate the free workflow kit on 3–5 real external repositories.
- Identify friction points in install, labelling, and dispatch flows.
- Confirm the watchdog and state-sync workflows behave correctly under real-world conditions.
- Collect feedback on dashboard UX and notification reliability.

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
- ≥ 3 repositories run JulesOps for ≥ 14 days without critical issues.
- Watchdog self-healing triggers successfully in ≥ 1 real scenario.
- No `v1.0` config fields require breaking changes based on feedback.

---

## 2. v1.0 Free-Core Config Contract

The following `.github/julesops.yml` fields are considered **stable** and will not change in a backward-incompatible way without a major version bump.

### Stable Fields (v1.0)

```yaml
# Required
base_branch: <string>              # Branch Jules creates PRs against
queue_label: <string>              # Label that triggers Jules dispatch

# Optional — with defaults shown
labels:
  todo: "status:todo"              # Label for queued issues
  in_progress: "status:in-progress"
  review: "status:review"
  blocked: "status:blocked"
  failed: "status:failed"
  done: "status:done"

max_active_jobs: 1                 # Max concurrent Jules dispatches
blocked_comment_marker: "## Blocked"  # Phrase that triggers blocked state
close_on_merge: true               # Close issue when PR merges
```

### Unstable / Experimental Fields (may change before v1.0 GA)

The following fields are available but **not yet frozen**. Use at your own risk:

```yaml
notifications:                     # Experimental — webhook/email hooks
  on_failure: []
  on_stale: []

watchdog:                          # Experimental — timing config
  stale_threshold_hours: 24
  check_interval_hours: 6
```

### Versioning Policy
- **Minor field additions** (new optional keys): backward-compatible, no version bump.
- **Renamed or removed stable fields**: requires `v2.0` major release.
- **Experimental fields**: may change in any release; prefixed in changelog with `[experimental]`.
