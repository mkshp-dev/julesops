# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

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
