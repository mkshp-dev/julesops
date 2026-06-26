# Install JulesOps in a repository

This guide describes how to install the **JulesOps workflow kit** into a repository that wants to use Google Jules as a controlled implementation agent.

JulesOps v1 is GitHub-native:

- state lives in GitHub issues / PRs / labels
- orchestration runs in GitHub Actions
- repository-specific coding rules stay in the adopting repository
- no hosted backend is required for the free core workflow

---

# 1. What gets installed

A JulesOps-managed repository contains:

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

# 2. Install with the script

From the JulesOps repository:

```powershell
.\scripts\install-julesops.ps1 -TargetRepo "C:\path\to\target-repo" -BaseBranch main
```

Useful options:

```powershell
.\scripts\install-julesops.ps1 -TargetRepo "C:\path\to\target-repo" -BaseBranch Dev -QueueLabel jules-queue
.\scripts\install-julesops.ps1 -TargetRepo "C:\path\to\target-repo" -Force
```

The installer copies the canonical files from `templates/` and `workflows/`, creates `.github/jules-repo.md` if missing, and customizes the base branch / queue label in `.github/julesops.yml`.

The installer refuses to overwrite existing installed files unless `-Force` is provided.

---

# 3. Validate the kit or an installed repo

Validate the JulesOps source kit:

```powershell
.\scripts\validate-kit.ps1
```

Validate an installed target repository:

```powershell
.\scripts\validate-kit.ps1 -TargetRepo "C:\path\to\target-repo"
```

The validator checks that the canonical kit files exist, key workflow expectations are present, and an installed target repo has the required `.github` files.

---

# 4. Manual install

If you do not want to use the installer, copy these files into the adopting repository.

From `templates/`:

- `templates/jules-core.md` → `.github/jules-core.md`
- `templates/jules-task.yml` → `.github/ISSUE_TEMPLATE/jules-task.yml`
- `templates/julesops.yml` → `.github/julesops.yml` and then customize it

From `workflows/`:

- `workflows/jules-dispatch.yml` → `.github/workflows/jules-dispatch.yml`
- `workflows/jules-state-sync.yml` → `.github/workflows/jules-state-sync.yml`
- `workflows/jules-watchdog.yml` → `.github/workflows/jules-watchdog.yml`

Then create `.github/jules-repo.md` in the adopting repo.

---

# 5. Configure `.github/julesops.yml`

At minimum, set:

- the repository base branch Jules should target
- the queue label
- the state labels
- the instruction file paths
- whether issues should auto-close on merge
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

# 6. Create the required labels

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

# 7. Add the Jules secret

The dispatch workflow expects a repository secret named:

- `JULES_API_KEY`

Without this secret, dispatch will fail and the issue should be marked `status:failed`.

---

# 8. Write repo-specific guidance

Edit `.github/jules-repo.md` in the adopting repo. A good repo-specific instructions file should tell Jules things like:

- which branch PRs should target if you want to reinforce the config
- what verification commands matter in this repo
- whether schema changes require new migrations
- what parts of the codebase are sensitive or should not be casually changed
- whether app-facing query surfaces should be implemented as views / RPCs / services / modules

JulesOps intentionally does **not** own those repository-specific engineering rules.

---

# 9. First test run

For the first run, prefer a small, low-risk issue such as:

- a documentation update
- a contained service tweak
- a small query / helper change

Avoid large schema refactors or cross-cutting changes until the workflow is proven in the repository.

Expected flow:

1. Create an issue using the **Jules Task** issue template.
2. Ensure it has the queue label and the configured todo label.
3. Run `Jules Dispatch` manually or wait for the scheduled dispatch.
4. JulesOps selects the queued issue, builds the prompt, invokes Jules, and moves the issue to `status:in-progress`.
5. When Jules opens a PR with `Closes #...`, `Fixes #...`, or `Resolves #...` in the PR body, `Jules State Sync` moves the issue to `status:review`.
6. When the PR merges, `Jules State Sync` marks the issue `status:done` and closes it if configured.
7. `Jules Watchdog` comments on stale `in-progress` or `review` issues that exceed the configured thresholds.

---

# 10. Troubleshooting

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