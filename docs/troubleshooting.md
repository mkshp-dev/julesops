# JulesOps Troubleshooting Guide

This guide covers common issues and how to diagnose them. For installation steps, see [`docs/install.md`](install.md).

---

## Dispatch issues

### Issue never dispatches

**Symptoms**: `Jules Dispatch` runs on schedule or manually but nothing happens to the issue.

**Check:**

1. The issue has **both** the queue label (`jules-queue`) and the todo status label (`status:todo`).
2. No other issue is currently in `status:in-progress`, `status:review`, or `status:blocked` — dispatch is intentionally gated to one active job.
3. `Jules Dispatch` is enabled in `.github/julesops.yml` (`julesops.enabled: true`).
4. The workflow ran at all — check the **Actions** tab for `Jules Dispatch` run history.
5. The config resolver step ran without errors. Check the `Resolve JulesOps configuration` step output.

### Dispatch fails immediately with JULES_API_KEY error

**Symptoms**: The `Validate Jules API key is configured` step fails with `::error::JULES_API_KEY secret is not set`.

**Fix**: Add the secret to the repository.

1. Go to **Settings → Secrets and variables → Actions** in your GitHub repository.
2. Create a secret named `JULES_API_KEY` with your Jules API key.
3. Get your key at [jules.google.com/settings/api](https://jules.google.com/settings/api).

You can also verify the secret exists by running:

```powershell
.\scripts\validate-kit.ps1 -TargetRepo "C:\path\to\target-repo"
```

The validator will warn if `JULES_API_KEY` is not set.

### Dispatch fails with config preflight error

**Symptoms**: The `Validate config preflight` step fails listing missing fields.

**Fix**: Open `.github/julesops.yml` in the target repo and ensure all required fields are populated. Run:

```powershell
.\scripts\validate-kit.ps1 -TargetRepo "C:\path\to\target-repo"
```

### Dispatch runs but Jules does nothing visible

**Symptoms**: The dispatch job shows success but Jules never opens a PR.

**Check:**

- The `Invoke Jules for selected issue` step shows a Jules task ID or confirmation.
- Jules may have posted a `## Blocked` comment on the issue — check the issue timeline.
- The issue may have been moved to `status:blocked` or `status:failed`.

---

## State transition issues

### Issue dispatches but never moves to review

**Symptoms**: Jules opened a PR but the issue stays in `status:in-progress`.

**Check:**

1. The PR body contains a closing keyword: `Closes #N`, `Fixes #N`, or `Resolves #N` (where N is the issue number). This must be in the **PR body**, not just the title.
2. `Jules State Sync` ran after the PR was opened — check **Actions → Jules State Sync**.
3. The PR targets the configured base branch. If it targets a different branch, the issue may move to `status:blocked` instead.

### Issue gets stuck in review after merge

**Symptoms**: PR merged but issue stays in `status:review` and doesn't close.

**Check:**

1. The PR was **merged**, not just closed (unmerged PRs don't trigger the done transition).
2. The PR body links the issue with `Closes #N`, `Fixes #N`, or `Resolves #N`.
3. `Jules State Sync` ran on the `pull_request closed` event — check **Actions**.
4. `close_on_merge` is set to `true` in `.github/julesops.yml` if you want auto-close.

### Issue moves to blocked unexpectedly

**Symptoms**: Issue transitioned to `status:blocked` without Jules posting a `## Blocked` comment.

**Check:**

- The PR opened by Jules targets a branch other than the configured `base_branch`. The state sync workflow detects this and blocks the issue.
- `pull_request.target_base_branch_only` is set to `true` in config.

---

## Retry and requeue issues

### /jules retry has no effect

**Symptoms**: Posted `/jules retry` comment but issue stays blocked.

**Check:**

1. The comment was posted by a repository collaborator or owner (commenter permission check).
2. `Jules State Sync` ran after the comment was posted — check **Actions**.
3. The comment body is exactly `/jules retry` or `/jules requeue` (case-insensitive, trimmed).

---

## Watchdog issues

### Watchdog is posting reminders too frequently

**Symptoms**: `Jules Watchdog` comments on issues that were just updated.

**Fix**: Increase the watchdog thresholds in `.github/julesops.yml`:

```yaml
watchdog:
  stale_in_progress_hours: 48   # default: 24
  stale_review_hours: 120       # default: 72
```

### Watchdog never fires

**Symptoms**: Issues stay stale for days with no watchdog comment.

**Check:**

1. `Jules Watchdog` is scheduled in `.github/workflows/jules-watchdog.yml`.
2. The watchdog workflow is enabled in Actions (not disabled by GitHub after inactivity).
3. `julesops.enabled` is `true` in config.

---

## Label issues

### Labels missing — dispatch always sees no queued issues

**Symptoms**: Issues with `jules-queue` + `status:todo` are never picked up.

**Check**: The labels must exist on GitHub exactly as configured in `.github/julesops.yml`. Run the validator:

```powershell
.\scripts\validate-kit.ps1 -TargetRepo "C:\path\to\target-repo"
```

If labels are missing:

```powershell
.\scripts\bootstrap-labels.ps1 -TargetRepo "C:\path\to\target-repo"
```

---

## Installer issues

### "Prior JulesOps install detected" on first install

**Symptoms**: Running `install-julesops.ps1` shows a prior install banner on what you believe is a fresh repo.

**Cause**: One or more JulesOps-managed files exist with a version marker. This may be from a partial previous run.

**Fix**: Use `-Upgrade` to refresh managed files while preserving your config, or `-Force` to overwrite everything including `julesops.yml`.

### Installer exits with "Non-interactive shell detected"

**Symptoms**: CI or a script running the installer exits with this error.

**Fix**: Always pass `-Upgrade` or `-Force` explicitly when running the installer in non-interactive contexts (CI scripts, automation).

```powershell
.\scripts\install-julesops.ps1 -TargetRepo "C:\path\to\target-repo" -BaseBranch main -Upgrade
```

---

## Validation issues

### validate-kit.ps1 fails with "Missing required kit file"

**Symptoms**: Running `validate-kit.ps1` from the JulesOps repo root fails.

**Fix**: Ensure you're running from the JulesOps repo root and the kit files are intact. A `git status` or `git pull` may be needed.

### validate-kit.ps1 warns about JULES_API_KEY

**Symptoms**: Warning: `JULES_API_KEY secret is NOT set.`

This is a **warning**, not a failure. The validator checks the GitHub secret when `gh` is authenticated. Follow the link in the warning to add the secret.

---

## Getting help

- Open an issue in [mkshp-dev/julesops](https://github.com/mkshp-dev/julesops/issues)
- See [`docs/install.md`](install.md) for the full installation guide
- See [`docs/repo-config-spec.md`](repo-config-spec.md) for the config reference
- See [`docs/state-machine.md`](state-machine.md) for the full state machine diagram
