# Agent issue backlog

This backlog turns the current review findings into detailed implementation issues for agents. These are written as GitHub-issue-ready specs, but kept in the repository so they can be copied, split, or assigned as needed.

## Priority guide

- `P0`: Release blocker. Fix before public beta or Marketplace claims.
- `P1`: Important for correctness, trust, or adoption.
- `P2`: Polish, documentation, or follow-up hardening.

---

## Current status after Codex pass

Resolved in the current important-issues pass:

- Issue 1: Resolver no longer depends on PyYAML; validator guards against reintroducing it.
- Issue 2: Retry/requeue command parsing no longer interpolates comment body directly into shell.
- Issue 3: Public and private beta docs now use the nested `julesops:` config schema.
- Issue 4: Label bootstrapper now supports default current-directory usage and `-DryRun`; docs use executable commands.
- Issue 5: Release plan now distinguishes implemented, designed, partial, and todo work.
- Issue 6: Dashboard is clearly marked as a mock/prototype.
- Issue 7: Hosted backend/App docs were downgraded to planned/design language where no runnable backend exists.
- Issue 8: Source-repo CI workflow added for validation and smoke tests.
- Issue 9: Public beta checklist updated for current installer output and version.
- Issue 10: Added `LICENSE`, `PRIVACY.md`, and `TERMS.md`; marketplace copy links to real files.
- Issue 12: `SECURITY.md` now matches workflow permission intent and documents comment-command safety.
- Issue 13: Added `docs/release-checklist.md`.
- Issue 14: `CONTRIBUTING.md` now documents source issue templates vs installed adopter templates.

Remaining task suitable for a smaller/inferior model:

- Issue 11: Build out the fixture repository and optional fixture smoke-test script. This is mostly mechanical test-fixture work after the current CI smoke test exists.
---

# Issue 1 - Fix config resolver portability by removing undeclared PyYAML dependency

Priority: `P0`
Labels: `bug`, `release-blocker`, `workflow-kit`

## Background

Installed workflows now call `.github/resolve-config.py`, copied from `templates/resolve-config.py`. That script imports `yaml`, but PyYAML is not installed by the workflows and should not be assumed to exist on GitHub-hosted runners.

Local check failed:

```powershell
python -c "import yaml"
# ModuleNotFoundError: No module named 'yaml'
```

Affected files:

- `templates/resolve-config.py`
- `workflows/jules-dispatch.yml`
- `workflows/jules-state-sync.yml`
- `workflows/jules-watchdog.yml`

## Goal

Make config resolution work reliably in a freshly installed repository without undeclared Python dependencies.

## Recommended approach

Prefer a dependency-free resolver tailored to the supported `.github/julesops.yml` schema. This keeps the free workflow kit simple and avoids package installation/network failure modes.

A less preferred alternative is explicitly installing PyYAML in every workflow before invoking `.github/resolve-config.py`.

## Tasks

- Remove `import yaml` from `templates/resolve-config.py`, or explicitly install PyYAML in every workflow before running the resolver.
- Ensure the resolver supports all current nested config fields:
  - `julesops.enabled`
  - `julesops.repository.base_branch`
  - `julesops.queue.queue_label`
  - `julesops.queue.max_active_jobs`
  - `julesops.states.todo`
  - `julesops.states.in_progress`
  - `julesops.states.review`
  - `julesops.states.blocked`
  - `julesops.states.failed`
  - `julesops.states.done`
  - `julesops.instructions.core`
  - `julesops.instructions.repo`
  - `julesops.pull_request.target_base_branch_only`
  - `julesops.pull_request.require_issue_link`
  - `julesops.issue_completion.close_on_merge`
  - `julesops.blocked_comment.marker`
  - `julesops.watchdog.stale_in_progress_hours`
  - `julesops.watchdog.stale_review_hours`
- Add validation coverage so this dependency issue is caught in the future.
- Run the installer into a temp repo and verify the installed `.github/resolve-config.py` executes successfully.

## Acceptance criteria

- `python templates/resolve-config.py` can run in a minimal Python environment without `ModuleNotFoundError`.
- A freshly installed target repo can run `python .github/resolve-config.py` locally from the repo root.
- `./scripts/validate-kit.ps1` passes.
- Installed workflows no longer rely on implicit runner packages.

## Verification notes

```powershell
python -c "import yaml"
# This may fail, but JulesOps config resolution should still work.

$target = Join-Path $env:TEMP ("julesops-resolver-test-" + [guid]::NewGuid().ToString("N"))
New-Item -ItemType Directory -Force -Path $target | Out-Null
git -C $target init
Set-Content -LiteralPath (Join-Path $target "README.md") -Value "# test"
git -C $target add README.md
git -C $target -c user.email=test@example.com -c user.name=Test commit -m init
.\scripts\install-julesops.ps1 -TargetRepo $target -BaseBranch master
Push-Location $target
python .github\resolve-config.py
Pop-Location
.\scripts\validate-kit.ps1 -TargetRepo $target
```

---

# Issue 2 - Fix shell injection risk in `/jules retry` comment handling

Priority: `P0`
Labels: `security`, `release-blocker`, `workflow`

## Background

`workflows/jules-state-sync.yml` interpolates user-controlled issue comment text directly into shell:

```bash
BODY_LOWER=$(echo "${{ github.event.comment.body }}" | tr '[:upper:]' '[:lower:]' | xargs)
```

A crafted issue comment can break quoting or inject shell syntax before maintainer authorization is checked.

## Goal

Parse retry/requeue commands safely.

## Tasks

- Do not interpolate `github.event.comment.body` directly inside a shell command.
- Pass comment body via `env`, for example:

  ```yaml
  env:
    COMMENT_BODY: ${{ github.event.comment.body }}
  ```

- Read and normalize `$COMMENT_BODY` safely inside the script.
- Prefer moving command parsing into a tiny Python or Node script if that makes quoting safer.
- Ensure authorization check still happens before label changes or workflow dispatch.
- Add a short comment explaining why the body must not be interpolated directly.

## Acceptance criteria

- No direct shell interpolation of `github.event.comment.body` remains.
- `/jules retry` and `/jules requeue` still work for authorized maintainers.
- Unauthorized commenters receive a denial comment and no workflow is triggered.
- Malicious comment bodies cannot execute shell commands.

## Verification notes

Test comments to try manually:

```text
/jules retry
/Jules ReQueue
/jules retry"; echo injected; #
$(echo injected)
`echo injected`
```

Only the valid commands from maintainers should requeue.

---

# Issue 3 - Align public docs and private beta docs with actual nested config schema

Priority: `P1`
Labels: `docs`, `release-blocker`

## Background

Some docs show an old flat config shape:

```yaml
base_branch: main
queue_label: jules-queue
labels:
  todo: status:todo
blocked_comment_marker: "## Blocked"
```

The actual template uses the nested `julesops:` schema:

```yaml
julesops:
  repository:
    base_branch: main
  queue:
    queue_label: jules-queue
  states:
    todo: status:todo
```

Affected docs include:

- `docs/public-docs.md`
- `docs/private-beta.md`

## Goal

Make all user-facing docs match `templates/julesops.yml` and `docs/repo-config-spec.md`.

## Tasks

- Replace old flat config examples with the current nested schema.
- Ensure the stable v1 contract in `docs/private-beta.md` matches `docs/repo-config-spec.md`.
- Replace obsolete fields:
  - `labels` -> `julesops.states`
  - `blocked_comment_marker` -> `julesops.blocked_comment.marker`
  - `stale_threshold_hours` / `check_interval_hours` -> current watchdog fields
- Cross-link to `docs/repo-config-spec.md` from public docs and private beta docs.
- Add a note that `templates/julesops.yml` is the canonical source for the default config shape.

## Acceptance criteria

- No docs show the obsolete flat config as current usage.
- A user copying config from docs gets a valid config.
- This search returns no misleading current examples:

  ```powershell
  rg "blocked_comment_marker|stale_threshold_hours|check_interval_hours|^base_branch:" docs
  ```

---

# Issue 4 - Fix label bootstrap instructions and command ergonomics

Priority: `P1`
Labels: `docs`, `installer`, `good-first-agent-task`

## Background

`docs/public-beta-checklist.md` tells users to run:

```powershell
.\scripts\bootstrap-labels.ps1
```

from the target repo. But the script lives in the JulesOps source repo and requires `-TargetRepo`.

## Goal

Make label setup instructions executable as written.

## Tasks

- Update docs to say:

  ```powershell
  .\scripts\bootstrap-labels.ps1 -TargetRepo "C:\path\to\target-repo"
  ```

- Decide whether `bootstrap-labels.ps1` should remain source-kit only or be copied into installed repos.
- If it remains source-kit only, make that explicit in docs.
- Consider making `TargetRepo` default to the current directory if omitted.
- Add `-DryRun` to print labels without creating them.
- Ensure checklist mode works without GitHub auth.

## Acceptance criteria

- Public beta checklist command works.
- Install guide includes the label bootstrap step.
- Script behavior is clear when `gh` auth or GitHub remote is missing.

---

# Issue 5 - Reconcile development plan statuses with actual implementation state

Priority: `P1`
Labels: `docs`, `product`, `release-blocker`

## Background

`docs/development-to-marketplace-release.md` marks many Phase 4-6 tasks as `[DONE]`, including hosted App, dashboard, billing, private beta, monitoring, and admin tools.

Current repository appears to contain specs and a static mock dashboard, not a full hosted backend/App/control plane implementation.

## Goal

Make the roadmap honest and useful for future agents.

## Tasks

- Replace inaccurate `[DONE]` markers with clearer statuses:
  - `[DONE]`
  - `[DESIGNED]`
  - `[PARTIAL]`
  - `[TODO]`
- Mark GitHub App/backend/dashboard/billing as designed unless actual runnable code exists.
- Split “design complete” from “implementation complete.”
- Add an “Implementation backlog” section for Phase 4-6.
- Clarify the current release stage, likely `v0.3 public beta workflow kit`, not Marketplace-ready.

## Acceptance criteria

- No Phase 4-6 task is marked done unless runnable code exists.
- Roadmap distinguishes docs/specs from production implementation.
- Agents can tell what remains to build.

---

# Issue 6 - Replace mock dashboard with real implementation plan or mark it as prototype

Priority: `P1`
Labels: `dashboard`, `docs`, `product`

## Background

`dashboard/index.html` uses in-memory `mockJobs`. Marketplace docs describe a hosted operations dashboard, filters, history, billing, and RBAC as product features.

## Goal

Avoid presenting a static mock as a completed paid dashboard.

## Tasks

- Add a clear banner/comment that `dashboard/` is a prototype/mock.
- Rename docs wording from “implemented” to “prototype” where appropriate.
- Define a real dashboard data contract:
  - jobs endpoint
  - repositories endpoint
  - organizations endpoint
  - filters
  - status counts
- Create follow-up implementation issues for backend/API integration.
- Optional: move mock data into `dashboard/mock-data.json`.

## Acceptance criteria

- Users cannot mistake `dashboard/` for a production paid dashboard.
- Marketplace docs do not claim unavailable live dashboard features.
- There is a clear path from mock to real dashboard.

---

# Issue 7 - Add real backend/App implementation skeleton or downgrade Marketplace claims

Priority: `P1`
Labels: `github-app`, `backend`, `marketplace`

## Background

Docs reference:

- GitHub App webhook handling
- `/health`, `/metrics`, admin APIs
- Stripe billing
- RBAC
- event replay
- job history

But the repo has no backend app implementation.

## Goal

Either implement a minimal backend skeleton or clearly mark these as planned.

## Tasks

Option A - implementation:

- Add backend directory, for example `app/` or `server/`.
- Implement minimal endpoints:
  - `GET /health`
  - `POST /api/webhooks`
  - `GET /metrics` placeholder
- Add GitHub webhook signature verification.
- Add local `.env.example`.
- Add minimal event logging abstraction.
- Add README for local dev.

Option B - docs-only correction:

- Update docs to say these are planned architecture, not shipped behavior.
- Remove Marketplace-ready wording until implementation exists.

## Acceptance criteria

- Either a runnable backend skeleton exists, or docs stop implying it exists.
- Local dev guide maps to actual files and commands.
- Marketplace readiness docs are truthful.

---

# Issue 8 - Add CI to validate kit, installer, resolver, and docs

Priority: `P1`
Labels: `ci`, `quality`, `workflow-kit`

## Background

The repo has validation scripts, but no source-repo CI workflow is currently visible. Release readiness needs automated checks.

## Goal

Run core validation automatically on PRs and pushes.

## Tasks

- Add `.github/workflows/ci.yml` for this source repo.
- Run:
  - `./scripts/validate-kit.ps1`
  - installer smoke test into a temp Git repo
  - installed target validation
  - resolver execution test
- Include PowerShell on Windows.
- Optionally include Ubuntu with PowerShell Core if cross-platform support is intended.
- Add docs link checking if practical.

## Acceptance criteria

- CI runs on pull requests and pushes to `main`.
- CI catches missing required kit files.
- CI catches resolver dependency failures.
- CI catches broken installer behavior.

---

# Issue 9 - Fix public beta checklist stale examples and version drift

Priority: `P2`
Labels: `docs`, `beta`

## Background

`docs/public-beta-checklist.md` shows expected output with version `v0.1.0`, but installer currently uses `v0.3.0`.

It also shows output lines that do not match current installer output.

## Goal

Make beta docs match actual commands and outputs.

## Tasks

- Update version examples to current `$KitVersion`.
- Update expected installer output to match `scripts/install-julesops.ps1`.
- Update validation output examples to match current validator.
- Fix label bootstrap command.
- Add note that output may vary depending on GitHub auth and remote availability.

## Acceptance criteria

- Copy-pasted commands work.
- Expected output resembles real output.
- No stale `v0.1.0` references remain except changelog history.

---

# Issue 10 - Add Marketplace legal/release prerequisites

Priority: `P1`
Labels: `marketplace`, `legal`, `release`

## Background

Marketplace docs mention privacy policy, terms, SaaS subscription agreement, and MIT license, but the repo file list does not show a `LICENSE`, `PRIVACY.md`, or `TERMS.md`.

## Goal

Add the basic public-facing legal and release docs required before Marketplace launch.

## Tasks

- Add `LICENSE`, or update docs if the project is not MIT.
- Add `PRIVACY.md`.
- Add `TERMS.md` or `TERMS_OF_SERVICE.md`.
- Update `docs/marketplace-listing.md` to link to real files.
- Add support/contact policy.
- Clarify what data the free workflow kit sends nowhere, versus what hosted paid features would collect.

## Acceptance criteria

- Marketplace listing does not link to missing legal docs.
- Free vs hosted data handling is clearly separated.
- License claim is backed by an actual license file.

---

# Issue 11 - Implement real fixture repository for repeatable installer tests

Priority: `P2`
Labels: `tests`, `installer`

## Background

`examples/fixture-basic/README.md` exists, but it is not a real fixture repo structure. A README-only fixture does not test much.

## Goal

Create a useful fixture for smoke testing install/upgrade/validate behavior.

## Tasks

- Add minimal files under `examples/fixture-basic/repo/` or similar.
- Include a script that copies the fixture to temp, initializes Git, commits, runs installer, and validates.
- Test:
  - fresh install
  - dry run
  - upgrade preserving `julesops.yml`
  - force overwrite
  - missing branch failure
- Document how agents should use it.

## Acceptance criteria

- One command runs fixture smoke tests locally.
- Fixture catches installer regressions.
- Validation does not require GitHub remote unless remote checks are explicitly requested.

---

# Issue 12 - Review and tighten workflow permissions

Priority: `P1`
Labels: `security`, `workflow`

## Background

`SECURITY.md` and workflow YAML do not fully agree. For example, `SECURITY.md` says `jules-state-sync.yml` uses `pull-requests: write`, while the workflow currently uses `pull-requests: read` and `actions: write`.

## Goal

Make workflow permissions minimal, correct, and documented.

## Tasks

- Audit every `gh` command in each workflow.
- Confirm which GitHub token permissions are actually required.
- Update workflow `permissions:` blocks if needed.
- Update `SECURITY.md` to match actual workflow permissions.
- Verify whether `actions: write` is required for `gh workflow run`.
- Document why each permission is needed.

## Acceptance criteria

- `SECURITY.md` exactly matches workflow YAML.
- No workflow has unnecessary write permissions.
- Retry/requeue still works after permission tightening.

---

# Issue 13 - Add release readiness checklist for v0.3 public beta

Priority: `P2`
Labels: `release`, `docs`

## Background

The repo now has many release-oriented documents, but no single checklist that says what must be true before calling `v0.3` public-beta-ready.

## Goal

Create a concise release readiness checklist for the current free workflow kit.

## Tasks

- Add `docs/release-checklist.md`.
- Include required checks:
  - resolver portability
  - installer smoke test
  - upgrade smoke test
  - validator pass
  - workflow permission audit
  - docs config-schema alignment
  - label bootstrap command check
  - changelog updated
  - tag exists and points at intended commit
- Include commands for each check.
- Separate free-core beta readiness from Marketplace readiness.

## Acceptance criteria

- Release checklist exists and is linked from `README.md` or `docs/marketplace-roadmap.md`.
- A maintainer can follow it without private context.
- Checklist does not imply hosted backend readiness.

---

# Issue 14 - Decide and document whether issue templates belong in source repo, installed repos, or both

Priority: `P2`
Labels: `docs`, `repo-maintenance`

## Background

The JulesOps source repo now has `.github/ISSUE_TEMPLATE` files for its own project issues, while installed target repos get `templates/jules-task.yml`. This is fine, but the distinction should be explicit so future agents do not confuse source-repo issue templates with installed Jules task templates.

## Goal

Clarify issue template ownership and prevent future self-install confusion.

## Tasks

- Document that source repo issue templates are for JulesOps project maintenance.
- Document that `templates/jules-task.yml` is the installed adopter template.
- Ensure installer only installs `templates/jules-task.yml` into target repos.
- Ensure source repo is not treated as dogfood/self-installed unless explicitly intended.

## Acceptance criteria

- README or contributing docs explain the distinction.
- No docs imply the source repo `.github` templates are part of the installed kit.
- Future agents can safely modify each surface without mixing them.