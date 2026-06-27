# JulesOps state machine

This document defines the first-pass JulesOps issue lifecycle for a repository using the workflow kit.

The v1 state machine is intentionally GitHub-native:
- state is represented by issue labels
- transitions are driven by GitHub Actions and PR events
- blocked / failed outcomes remain visible in the issue itself

---

# 1. Canonical states

JulesOps uses six canonical states.

| Canonical state | Typical label | Meaning |
| --- | --- | --- |
| `todo` | `status:todo` | Issue is queued and eligible for dispatch |
| `in_progress` | `status:in-progress` | Jules has been dispatched successfully and is actively working |
| `review` | `status:review` | Jules has opened a PR and the issue is awaiting human review / merge |
| `blocked` | `status:blocked` | Jules could not continue safely, or the linked PR was closed without merge |
| `failed` | `status:failed` | Dispatch / invocation failed before work could proceed normally |
| `done` | `status:done` | The linked PR merged and the issue is complete |

Repositories may map these to different label names in `.github/julesops.yml`, but the semantic roles should remain the same.

---

# 2. Happy-path lifecycle

The standard flow is:

```text
todo → in_progress → review → done
```

## Step A — issue enters queue
A maintainer creates a Jules task issue and applies:
- the queue label (for example `jules-queue`)
- the configured `todo` state label

## Step B — dispatcher selects the issue
`Jules Dispatch` chooses the next eligible queued issue, assembles the prompt, invokes Jules, and on success moves the issue from `todo` to `in_progress`.

## Step C — Jules opens a PR
When Jules opens a PR linked to the issue, `Jules State Sync` moves the issue from `in_progress` to `review`.

For the first-pass workflow kit, the PR body is expected to contain an issue-closing reference such as:
- `Closes #123`
- `Fixes #123`
- `Resolves #123`

## Step D — maintainer merges the PR
When the linked PR merges, `Jules State Sync` moves the issue to `done` and optionally closes it.

---

# 3. Non-happy-path transitions

## Dispatch failure
If the dispatcher cannot successfully hand work to Jules, the issue should move to:

```text
todo → failed
```

Typical causes:
- missing `JULES_API_KEY`
- invalid workflow config
- missing instruction files
- invocation action failure

The workflow should leave a comment if helpful and avoid leaving the issue ambiguously in progress.

## Jules blocked during execution
If Jules cannot safely continue, it should leave a structured blocked comment beginning with the configured marker, usually:

```md
## Blocked
```

When `Jules State Sync` sees that marker on an in-progress issue, it should move the issue to:

```text
in_progress → blocked
```

## PR closed without merge
If Jules opens a PR but it is closed without merge, the issue should move to:

```text
review → blocked
```

This keeps the task visible for maintainer follow-up rather than silently losing it.

---

# 4. Current workflow triggers behind the transitions

## `Jules Dispatch`
Responsible for:
- selecting the next queued issue
- checking whether another issue is already active
- invoking Jules
- moving the issue into `in_progress` on success
- moving the issue into `failed` on dispatch failure

## `Jules State Sync`
Responsible for:
- PR opened / reopened → move linked issue to `review`
- PR merged → move linked issue to `done` and optionally close it
- PR closed without merge → move linked issue to `blocked`
- blocked issue comment marker → move issue to `blocked`

---

# 5. Active-state invariant

The first-pass workflow kit is designed around a **single active issue by default**.

Operationally, an issue in one of these states counts as active for queue-blocking purposes:
- `in_progress`
- `review`
- `blocked`

That means the dispatcher should not select another queued issue while an active one exists, unless the workflow kit is later generalized to support multiple concurrent jobs.

---

# 6. Invariants JulesOps should preserve

A repository using JulesOps should be able to rely on the following invariants:

1. **A queued issue is not silently skipped** — it is either dispatched, still queued, or explicitly failed.
2. **A Jules PR deterministically moves the issue into review** when the issue link is present.
3. **A merged PR deterministically completes the issue**.
4. **Blocked and failed outcomes are explicit** rather than disappearing into logs.
5. **The issue remains the operational home of the task** even though the implementation work happens in a PR.

---

# 7. Things not yet modeled as first-class states

The current state machine does **not** yet include dedicated states for:
- `dispatching`
- `retrying`
- `awaiting-human-input`
- `cancelled`
- `stale-review`

Those may become useful later, but the six-state model is the current starting point for the installable workflow kit.

---

# 8. Retry and requeue mechanics

JulesOps supports both automated and manual recovery paths for issues that enter `blocked` or `failed` states.

## Comment command (Primary)
A repository maintainer can trigger a retry by commenting on the issue:
* `/jules retry` or `/jules requeue`

When the command is received, the `Jules State Sync` workflow:
1. Verifies that the commenter is an authorized maintainer (role `OWNER`, `MEMBER`, or `COLLABORATOR`).
2. Cleans up existing status labels (e.g. `status:blocked`, `status:failed`, etc.) and adds the `status:todo` label.
3. Automatically triggers `Jules Dispatch` immediately to execute the issue.

## Label-driven transition (Manual)
A maintainer can manually move an issue back to the queue by removing the `status:blocked` or `status:failed` label and adding the `status:todo` label.
When `Jules Dispatch` next runs (scheduled cron or manual trigger), it will automatically clean up any remaining status labels and pick up the issue for execution.
