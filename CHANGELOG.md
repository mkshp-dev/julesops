# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Documentation
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
