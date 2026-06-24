# JulesOps state machine

This document defines the canonical **JulesOps job lifecycle** for a single Jules task associated with a GitHub issue.

The state machine is deliberately simple for the first version. It should be implementable with GitHub issue labels and workflow events before a dedicated backend exists.

---

## Core states

### `todo`
The issue is eligible to be worked on by Jules but has not yet been dispatched.

Typical meaning:
- the issue is open
- the issue has the Jules queue label
- no active Jules run is currently associated with it

### `dispatching`
JulesOps has selected the issue and is attempting to invoke Jules.

This state exists conceptually even if the earliest workflow implementation skips the label and transitions directly to `in_progress` after a successful dispatch.

### `in_progress`
Jules has been invoked for the issue and is expected to be working on it.

Typical indicators:
- Jules invocation succeeded
- no PR exists yet, or the task is still being actively worked

### `review`
A PR exists for the task and the issue is now waiting for maintainer review / merge.

### `blocked`
The task could not be completed without maintainer input, or the linked PR was closed without merge, or another operational failure requires human intervention.

### `failed`
JulesOps itself failed to dispatch or manage the task cleanly, and the issue should not remain ambiguously in progress.

Examples:
- dispatch workflow failed before Jules was invoked
- required workflow context was missing
- a hard automation failure occurred that should not be conflated with a repository-level implementation block

### `done`
The task was completed and the linked PR was merged into the configured base branch.

---

## Allowed transitions

### Normal happy path
- `todo -> dispatching`
- `dispatching -> in_progress`
- `in_progress -> review`
- `review -> done`

### Block / failure paths
- `dispatching -> failed`
- `in_progress -> blocked`
- `review -> blocked`

### Recovery / retry paths
- `blocked -> todo`
- `failed -> todo`

---

## Transition triggers

## 1. `todo -> dispatching`
Triggered by the JulesOps dispatcher selecting the next eligible issue.

## 2. `dispatching -> in_progress`
Triggered when Jules invocation succeeds and the issue is officially handed to Jules.

## 3. `dispatching -> failed`
Triggered when the dispatch workflow cannot safely invoke Jules.

## 4. `in_progress -> review`
Triggered when a linked PR is opened or reopened for the issue.

## 5. `in_progress -> blocked`
Triggered when Jules posts a structured blocked comment, or another workflow determines the task needs maintainer intervention.

## 6. `review -> done`
Triggered when the linked PR is merged into the configured base branch.

## 7. `review -> blocked`
Triggered when the linked PR is closed without merge, or review uncovers a state that requires rework / maintainer action.

## 8. `blocked -> todo`
Triggered manually by a maintainer after clarifying requirements, fixing external issues, or deciding to requeue the task.

## 9. `failed -> todo`
Triggered manually by a maintainer after resolving the operational failure or deciding to retry dispatch.

---

## First-pass label mapping

A repository may map these states to labels, for example:

- `todo` -> `status:todo`
- `in_progress` -> `status:in-progress`
- `review` -> `status:review`
- `blocked` -> `status:blocked`
- `failed` -> `status:failed`
- `done` -> `status:done`

`dispatching` may remain implicit in the earliest version if the dispatcher is short-lived, but it is part of the conceptual model and may later become an explicit state.

---

## Invariants

The first version of JulesOps should try to preserve these invariants:

1. **At most one active Jules issue per repo** by default.
   - Active means a task in `dispatching`, `in_progress`, or `review`.

2. **A task should not remain ambiguously active after a known failure.**
   - If dispatch fails, the issue should end up in `failed` or `blocked`, not silently remain `todo` or incorrectly move to `in_progress`.

3. **A merged PR should deterministically resolve the issue.**
   - If the PR targets the configured base branch and is the linked Jules PR, the issue should move to `done` and be closed if configured.

4. **Blocked states should be explicit and legible.**
   - The maintainer should be able to see why Jules stopped and what action is needed.

---

## Open questions

- Should `review` count as an active state that blocks dispatch of the next issue? The initial Aggregator workflow treats it as active; that is likely the right default.
- Should `failed` and `blocked` be distinct labels in v1, or should the first version collapse operational failures into `blocked` for simplicity?
- Should retries create a new job attempt identity even if the GitHub issue remains the same?
