# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Changed
- **A blocked issue no longer stops the queue.** Only `in-progress` and `review` issues hold it; a blocked issue waits for a maintainer while the next queued issue is dispatched. Set `queue.blocked_holds_queue: true` for the previous behavior.

### Added
- `watchdog.fail_in_progress_hours` (default 72): the watchdog marks an issue failed once it has been in-progress that long, with a comment explaining how to retry, so a stuck task can't hold the queue forever. Measured from when the in-progress label was applied, not `updatedAt`, which every comment (including the watchdog's own reminders) resets. `0` disables it.
- `queue.max_attempts` (default 3): `/jules retry` refuses to requeue an issue that has already been dispatched that many times and asks the maintainer to clarify it first; `/jules retry --force` goes past the limit. `0` means no limit.
### Security
- The GitHub and Stripe webhook endpoints no longer skip signature checks in production when their secret is unset; they reject with 503 instead. Local demo mode still accepts unsigned webhooks, with a startup warning.
- Login after OAuth only redirects to paths on the same site; `redirect_to` could previously send a freshly logged-in user to any URL.
- Request bodies are capped (25 MB for webhooks, matching GitHub's payload limit; 1 MB otherwise) and answered with 413, instead of being buffered without limit.
- API errors no longer return internal error messages to clients.
- CORS is off unless `CORS_ORIGIN` is set (was `*`).
- Login is required whenever `DATABASE_URL` is set, not only when `NODE_ENV=production`.
- The dashboard escapes every value it renders (repository names, statuses, numbers, dates, error messages); values containing HTML could previously inject markup.

### Fixed
- Hosted RBAC looked up memberships by GitHub id, but memberships reference `users.id` (a UUID), so every permission check would fail against Postgres. Sessions now carry `userId`.
- Email alerts reported "HTTP undefined" instead of the real error when SendGrid was unreachable.
- The alert worker read `server/data/store.json` directly, ignoring `JULESOPS_DATA_DIR`.

### Changed
- Server tests run against a temporary store; `server/data/store.json` is no longer tracked. CI runs the server unit tests, and Dependabot checks action and npm updates weekly.

## [0.5.0] - 2026-09-25

### Added
- **The Marketplace action now works.** `uses: mkshp-dev/julesops@v0.5.0` runs JulesOps directly: `mode` selects `dispatch`, `sync`, `watchdog`, or `auto` (picked from the triggering event). A single workflow file and a `JULES_API_KEY` secret are enough; see `examples/julesops-workflow.yml`. Previously `action.yml` only printed an install banner.
- The config file is optional; every setting has a default.
- Missing JulesOps labels are created on the first run.
- An open issue with the queue label and no status label counts as queued, so `jules-queue` alone queues work.
- The core Jules instructions ship with the action and are used when the repository has no `.github/jules-core.md`.
- `dry-run` input that logs every change instead of making it; CI runs the real action this way.
- `scripts/test-action.sh`: tests for the action scripts against a stubbed `gh` CLI.

### Changed
- The kit's workflows are thin wrappers that call the action, pinned to the kit version. The installer no longer copies `.github/resolve-config.py` or `.github/jules-comment-command.js`; `--upgrade` and the uninstaller remove copies left by older installs.
- Status changes replace the issue's status label in a single API call instead of several remove/add calls.
- The watchdog and dispatch no longer stop at the first 30 issues, pull requests, or comments.
- A failed dispatch comment links the run log and mentions `/jules retry`.
- Workflows and examples use `actions/checkout@v5` (Node 24); v4 runs on the deprecated Node 20 runtime.

### Fixed
- `/jules retry` and `/jules requeue` failed in installed repositories because `jules-state-sync.yml` ran `scripts/comment-command.js`, which the installer never copied. The parser now ships as `.github/jules-comment-command.js`, and `validate-kit.sh` checks that every script a workflow executes is installed.
- `require_issue_link` posted a validation warning on every human-authored pull request. It now applies only to pull requests created by Jules: a commit authored by a `pull_request.jules_authors` login (default `google-labs-jules[bot]`) or a Jules task link in the body. The PR author is not used, because Jules opens PRs under the account of the user who started the task.
- Any commenter could move an in-progress issue to `blocked` by posting the blocked marker. The marker is now honored only from bot accounts, `jules_authors`, or maintainers.
- Overlapping `Jules Dispatch` runs could invoke Jules twice for the same issue. Dispatch now uses a `concurrency` group and claims the issue (`status:in-progress`) before invoking Jules.
- Watchdog review-transition comments rendered a stray backslash (`` \`status:review\` ``).
- `--upgrade` on a repository without an existing `julesops.yml` now applies `--base-branch` / `--queue-label` to the newly written config.

### Changed
- **Breaking (kit tooling):** all kit scripts are now bash instead of PowerShell (`install-julesops.sh`, `uninstall-julesops.sh`, `bootstrap-labels.sh`, `validate-kit.sh`, `release-kit.sh`, `test-fixture.sh`, `test-workflow-logic.sh`). They need `bash` 3.2+, `git` 2.28+, and `python3`, and run on Linux, macOS, and WSL. Flags are now GNU-style (`--upgrade`, `--force`, `--dry-run`, `--skip-labels`, `--base-branch`, `--queue-label`, `--include-config`) and the target repository is a positional argument.
- Kit scripts read `julesops.yml` with the same parser as the installed `resolve-config.py` (via `scripts/lib/config_dump.py`), replacing the separate PowerShell YAML reader.
- Installed files are written with LF line endings (the PowerShell installer wrote CRLF version markers).
- `release-kit.sh` moves the `## [Unreleased]` entries under the new version heading; the PowerShell version inserted the new section above `## [Unreleased]`.
- CI runs on `ubuntu-latest` and lints the kit scripts with `shellcheck`.

### Added
- `pull_request.jules_authors` config field.

### Documentation
- `README.md` no longer advertises a non-functional `uses: mkshp-dev/julesops@v1` step; Quick Start now describes the installer flow and the installed file layout.
- `docs/install.md` manual install now lists `resolve-config.py` and `jules-comment-command.js`.

## [0.4.0] - 2026-07-15

### Documentation
- Rewrote `README.md` and `docs/marketplace-listing.md` to optimize for developer adoption, onboarding, and security trust.
- Added `docs/e2e-adoption-test.md`: full E2E adoption test results for `obsidian-sql-plugin` (kit v0.3.1). All 7 test matrix scenarios passed — happy path and all non-happy-path scenarios. Closes #69.

### Added
- `action.yml`: thin composite action at repo root enabling GitHub Marketplace listing. Prints install guide pointing adopters to `docs/install.md`. Closes #91.

### Changed
- `.gitignore`: expanded with `.env`, `*.pem`, `keys/`, `server/data/`, OS/IDE patterns before making the repository public. Closes #90 (prep step).
- Repository visibility changed to **public** at https://github.com/mkshp-dev/julesops. Closes #90.
- Added `docs/troubleshooting.md`: standalone troubleshooting guide extracted from `docs/install.md` §10 with expanded coverage. Closes #78.
- Added cross-platform install section to `docs/install.md` (macOS/Linux via PowerShell Core). Closes #79.
- Added `max_active_jobs` per-repo scope clarification to `docs/repo-config-spec.md`. Closes #87.
- Updated `docs/release-checklist.md`: updated version example and added doc audit step for E2E test. Closes #88.
- Updated `docs/app-development.md`: consolidated duplicate content, added clarifying intro note. Closes #72.
- Updated `docs/marketplace-listing.md`: completed checklist items linked to current kit state and E2E proof. Closes #80.
- Updated `docs/beta-report.md`: §3.2 label table updated to reflect all 6 repos bootstrapped. §7 E2E summary added. Closes #71, #75.
- Added `docs/assets/`: logo (square 512×512 + wide 1280×640 banner) and 3 screenshots (issue template, dispatch run, state flow). Wired into `docs/marketplace-listing.md` and `README.md`. Marketplace listing checklist now 100% complete. Closes #82.

### Added
- `scripts/uninstall-julesops.ps1`: removes all JulesOps-managed files from a target repository. Closes #76.
- `scripts/test-workflow-logic.ps1`: 30 integration tests across 6 suites covering config resolver output, custom label names, resolver defaults, duplicate install detection, and uninstall behavior. All run without `JULES_API_KEY`. Closes #85.
- `.github/workflows/ci.yml`: new `workflow-logic-tests` CI job runs `test-workflow-logic.ps1` on every PR. Closes #85.
- `docs/architecture.md §14`: ADR-001 evaluating reusable GitHub Actions extraction — decision: defer to post-Marketplace with rationale and migration path documented. Closes #84.

### Changed
- `scripts/install-julesops.ps1`: improved duplicate-install UX — detects prior install, offers interactive `Upgrade existing install? [Y/n]` prompt on TTY, prints clear actionable message on non-TTY. Closes #74.
- `templates/jules-task.yml`: issue template now auto-applies `jules-queue` and `status:todo` labels. Closes #81.
- `templates/jules-core.md`: tightened issue-to-PR correlation rules — PR must contain `Closes`, `Fixes`, or `Resolves` + issue number; Jules must not open PRs without a linked issue. Closes #83.
- `workflows/jules-dispatch.yml`: added post-dispatch run summary comment for observability. Closes #86.
- `workflows/jules-dispatch.yml`: added config preflight validation step (checks required fields before queue scan). Closes #73.
- `scripts/validate-kit.ps1`: JULES_API_KEY preflight warning already implemented. Closes #77.

## [0.3.1] - 2026-07-08

### Changed
- Integrated label bootstrap into install-julesops.ps1: GitHub labels are now created automatically at the end of every install or upgrade. Pass -SkipLabels to opt out.

### Fixed
- Fixed -DryRun mode calling ootstrap-labels.ps1 before julesops.yml was written, causing a false error. Dry-run now prints a descriptive note instead.

### Documentation
- Updated docs/install.md section 6: label creation is no longer a separate step.
- Updated docs/marketplace-listing.md: gh CLI correctly documented as recommended rather than required.
- Corrected config field count from 18 to 17 in docs/beta-report.md.
- Added obsidian-sql-plugin beta test results to docs/beta-report.md.

## [0.3.0] - 2026-06-27

This is the first public beta release of JulesOps, consolidating all Phase 2 and Phase 3 packaging features.

### Added
- **Comment-Command Requeue/Retry Support**: Maintainers can trigger issue retries using `/jules retry` or `/jules requeue` comments (Issue #10).
- **PR Target Base-Branch Validation**: Automatically validates that pull requests target the repository's configured base branch when `pull_request.target_base_branch_only` is enabled (Issue #11).
- **PR Stricter Linked-Issue Validation**: Validates that pull requests link back to a tracked Jules issue when `pull_request.require_issue_link` is enabled (Issue #12).
- **Transition Status Comments**: Automatically posts comments on the issue timeline for dispatch, blocked, and done transitions (Issue #13).
- **Watchdog Mismatch Resolution**: Watchdog now auto-heals `in-progress` issues that have open pull requests by transitioning them to `review` and leaving a status comment (Issue #14).
- **Deduplicated Configuration Parser**: Unified YAML config-parsing logic across workflows into a single `.github/resolve-config.py` script to reduce complexity and errors (Issue #15).

## [0.1.0] - 2026-06-27

### Added
- **Initial Release**: Core single-repository orchestrator workflows (`jules-dispatch.yml`, `jules-state-sync.yml`, and `jules-watchdog.yml`).
- **State Machine**: Six-state GitHub-native lifecycle labels (`todo`, `in_progress`, `review`, `blocked`, `failed`, `done`).
- **Tooling**: Installation (`install-julesops.ps1`) and validation (`validate-kit.ps1`) scripts.
- **Documentation**: Initial state machine, architecture, product direction, and installation specifications.
