# Install JulesOps in a repository

This guide describes how to adopt the **JulesOps workflow kit** in a repository that wants to use Google Jules as a controlled implementation agent.

JulesOps v1 is intentionally GitHub-native:
- state lives in GitHub issues / PRs / labels
- orchestration runs in GitHub Actions
- repository-specific coding rules stay in the adopting repository

---

# 1. What gets installed

A JulesOps-managed repository should contain the following surfaces:

```text
.github/
├─ ISSUE_TEMPLATE/
│  └─ jules-task.yml
├─ workflows/
│  ├─ jules-dispatch.yml
│  ├─ jules-state-sync.yml
│  └─ jules-watchdog.yml
├─ jules-core.md                # generic JulesOps orchestration contract
├─ jules-repo.md                # repo-specific implementation guidance
└─ julesops.yml                 # repository config
```

---

# 2. Adoption checklist

## Required files
Copy these files from the JulesOps repo into the adopting repository:

### From `templates/`
- `templates/jules-core.md` → `.github/jules-core.md`
- `templates/jules-task.yml` → `.github/ISSUE_TEMPLATE/jules-task.yml`
- `templates/julesops.yml` → `.github/julesops.yml` and then customize it

### From `workflows/`
- `workflows/jules-dispatch.yml` → `.github/workflows/jules-dispatch.yml`
- `workflows/jules-state-sync.yml` → `.github/workflows/jules-state-sync.yml`
- `workflows/jules-watchdog.yml` → `.github/workflows/jules-watchdog.yml`

### Repo-specific file you must author
Create `.github/jules-repo.md` in the adopting repo. This should contain repository-specific guidance such as:
- migration / schema rules
- verification expectations
- branch policy if you want it reiterated
- architectural constraints or implementation guardrails

---

# 3. Configure `.github/julesops.yml`

At minimum, set:
- the repository base branch Jules should target
- the queue label
- the state labels
- the instruction file paths
- whether issues should auto-close on merge

Optional but recommended:
- watchdog thresholds for stale `in-progress` and `review` issues

Example:

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

  watchdog:
    stale_in_progress_hours: 24
    stale_review_hours: 72
```

See `docs/repo-config-spec.md` for the config contract.

---

# 4. Create the required labels

The repository should define the labels referenced in `julesops.yml`.

Recommended default labels:
- `jules-queue`
- `status:todo`
- `status:in-progress`
- `status:review`
- `status:blocked`
- `status:failed`
- `status:done`

These labels are the v1 state model.

---

# 5. Add the Jules secret

The dispatch workflow expects a repository secret named:

- `JULES_API_KEY`

Without this secret, dispatch will fail and the issue should be marked `status:failed`.

---

# 6. How the first run should work

1. Create an issue using the **Jules Task** issue template.
2. Ensure it has the queue label and the configured todo label.
3. Run `Jules Dispatch` manually or wait for the scheduled dispatch.
4. JulesOps should:
   - select the queued issue
   - build the prompt from `.github/jules-core.md`, `.github/jules-repo.md`, and the issue body
   - invoke Jules
   - move the issue to `status:in-progress`
5. When Jules opens a PR with `Closes #...`, `Fixes #...`, or `Resolves #...` in the PR body, `Jules State Sync` should move the issue to `status:review`.
6. When the PR merges, `Jules State Sync` should mark the issue `status:done` and close it if configured.
7. `Jules Watchdog` should periodically comment on stale `in-progress` or `review` issues that exceed the configured thresholds.

---

# 7. Minimum repo-specific guidance for `.github/jules-repo.md`

A good repo-specific instructions file should tell Jules things like:
- which branch PRs should target if you want to reinforce the config
- what verification commands matter in this repo
- whether schema changes require new migrations
- what parts of the codebase are sensitive or should not be casually changed
- whether app-facing query surfaces should be implemented as views / RPCs / services / modules

JulesOps intentionally does **not** own those repository-specific engineering rules.

---

# 8. Recommended first dogfood issue

For the first run, prefer a small, low-risk issue such as:
- a documentation update
- a small assistant-facing query surface
- a contained edge-function or service tweak

Avoid large schema refactors or cross-cutting changes until the workflow is proven in the repository.

---

# 9. Troubleshooting

## Issue never dispatches
Check:
- the issue has the queue label and todo label expected by `julesops.yml`
- `Jules Dispatch` is enabled and ran successfully
- no other issue is already active in `in-progress`, `review`, or `blocked`

## Issue dispatches but never moves to review
Check:
- Jules actually opened a PR
- the PR body contains a linked issue reference such as `Resolves #123`
- the PR targets the expected base branch

## Issue gets stuck in review after merge
Check:
- the PR was merged rather than closed unmerged
- the PR body linked the correct issue
- `Jules State Sync` ran on the PR closed event

## Watchdog is posting reminders too aggressively
Check:
- the `watchdog` thresholds in `.github/julesops.yml`
- whether normal issue / PR activity is actually happening in GitHub
- whether you want longer thresholds for slower review cycles

## Dispatch fails immediately
Check:
- `JULES_API_KEY` exists
- `.github/julesops.yml` is valid YAML
- the instruction file paths in the config exist

---

# 10. Current adoption status

The first dogfood adopter is `Aggregator`, which is used as the reference example for the current workflow contract.
