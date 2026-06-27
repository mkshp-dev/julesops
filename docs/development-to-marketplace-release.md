# Development plan to GitHub Marketplace release

This document defines the next development steps for taking JulesOps from an installable source kit to a GitHub Marketplace product.

The strategic shape is:

1. Make the free workflow kit reliable for single repositories.
2. Package installation and upgrades so adoption is low-friction.
3. Introduce a GitHub App when it clearly improves setup, webhooks, auth, or hosted state.
4. Launch paid multi-repo visibility and operations on top of the stable core workflow.

## Release principles

- The single-repository workflow kit remains free and useful without a hosted backend.
- The paid layer should help teams operate JulesOps across repositories, not gate the basic issue to PR workflow.
- Do not build the dashboard before the job protocol is stable in real repositories.
- Prefer boring, inspectable GitHub-native behavior until a hosted component solves a real operational problem.
- Every release step should improve testability, installability, or supportability.

## Phase 1 - Free core hardening

Goal: make the current workflow kit safe to install repeatedly into test repositories.

### Product outcomes

- A maintainer can install JulesOps into a repository using one command.
- The installed repo has all required workflows, templates, config, and repo-specific instruction stubs.
- The maintainer has clear next steps for labels, secrets, and first task creation.
- The kit can be validated before and after install.

### Development tasks

- Expand `scripts/validate-kit.ps1` to check the full config contract, including state labels, instruction paths, and watchdog thresholds.
- Add a label bootstrap helper or generated label checklist.
- Add `-DryRun` support to `scripts/install-julesops.ps1` so adopters can preview changes.
- Add `-Upgrade` semantics so existing installs can be refreshed without overwriting `.github/jules-repo.md`.
- Add a version marker to installed files, for example a comment containing `JulesOps kit version`.
- Add changelog and release notes files.
- Add a minimal test fixture repository under `examples/fixture-basic/` for local installer and validator testing.

### Exit criteria

- Fresh install into an empty test repo passes validation.
- Re-running install with `-Force` or future `-Upgrade` behaves predictably.
- Docs explain labels, secrets, first run, blocked flow, failed dispatch, and watchdog behavior.
- The free-core boundary is documented and stable.

## Phase 2 - Workflow behavior hardening

Goal: make the issue to PR state machine reliable enough for external users.

### Product outcomes

- State transitions are deterministic and understandable from the issue timeline.
- Failed and blocked tasks are visible and recoverable.
- Jules-created PRs are correlated to issues with low ambiguity.
- Maintainers can requeue work without editing labels manually in fragile ways.

### Development tasks

- Add retry / requeue support for `blocked` and `failed` issues.
- Decide whether retry is label-driven, comment-command-driven, or both.
- Add PR base-branch validation when `pull_request.target_base_branch_only` is enabled.
- Add stricter linked-issue validation when `pull_request.require_issue_link` is enabled.
- Add status comments for important transitions, especially dispatch, blocked, failed, requeued, and done.
- Add watchdog handling for likely mismatches, such as issue in `in-progress` while a linked PR is already open.
- Deduplicate repeated config-parsing snippets across workflows when a reusable action or script would reduce mistakes.

### Exit criteria

- The happy path works in at least two external repositories.
- Blocked, failed, closed-without-merge, and stale-review paths are tested manually and documented.
- Retry / requeue has a single recommended workflow.
- The state machine docs match actual workflow behavior.

## Phase 3 - Packaging for public beta

Goal: make JulesOps presentable and supportable for early external adopters.

### Product outcomes

- A new user can understand what JulesOps is, install it, and test it without private context.
- The repository has clear issue templates, support expectations, and release notes.
- The project can accept feedback from beta adopters without creating chaos.

### Development tasks

- Add `CHANGELOG.md`. [DONE]
- Add `CONTRIBUTING.md`. [DONE]
- Add `SECURITY.md` covering secrets, workflow permissions, and responsible disclosure. [DONE]
- Add GitHub issue templates for bug reports, feature requests, and adoption feedback. [DONE]
- Add a public beta checklist to docs. [DONE]
- Add screenshots or terminal examples for install and validation. [DONE]
- Decide initial semantic versioning, likely `v0.x` until the GitHub App/control plane exists. [DONE]
- Tag the first public beta release (v0.3.0). [DONE]

### Exit criteria

- At least two external repositories have completed the install and first-task flow.
- Known limitations are listed clearly.
- Public README has a crisp install path and support path.
- A beta release tag exists with release notes.

## Phase 4 - GitHub App foundation

Goal: introduce a GitHub App only for capabilities that are awkward or unreliable as copied workflow YAML.

### Product outcomes

- Installation is easier than copying workflows manually.
- App permissions are understandable and minimal.
- The App can observe repository events needed for a future dashboard.
- The free workflow kit still remains usable without the hosted app.

### Development tasks

- Define the GitHub App permission model: [DONE]
  - repository metadata: read
  - issues: read/write
  - pull requests: read/write
  - actions/workflows: read-only
  - contents: read (write only if App installs files directly)
- Decide whether the App installs files, comments instructions, or only monitors existing workflow-kit installs. [DONE]
- Design webhook handlers for issue, pull request, issue comment, workflow run, and installation events. [DONE]
- Define a hosted job model for observing state without replacing GitHub as the source of truth. [DONE]
- Add a minimal backend schema for installations, repositories, jobs, attempts, and events. [DONE]
- Add local development docs for the App and webhook processing. [DONE]

### Exit criteria

- A private GitHub App can be installed on a test organization or repository.
- The App can detect JulesOps-managed issues and linked PR transitions.
- The App does not require paid features for the free single-repo workflow.
- Permission choices are documented and defensible.

## Phase 5 - Paid control plane MVP

Goal: build the first paid feature set around multi-repo operations.

### Product outcomes

- Users can see JulesOps activity across repositories.
- Users can identify stale, blocked, failed, and review-awaiting work quickly.
- Users can inspect job history and attempts.
- The paid layer saves maintainers time without changing the free core contract.

### Development tasks

- Build dashboard views for: [DONE]
  - active jobs
  - blocked jobs
  - failed dispatches
  - stale review items
  - recently completed work
- Store normalized job and attempt history. [DONE]
- Add repository filters, organization filters, and status filters. [DONE]
- Add notification hooks for stale or failed work, starting with email or webhook destinations.
- Add organization membership and authorization model.
- Add billing integration only after the dashboard value is proven in private beta.

### Exit criteria

- A private beta user can connect multiple repositories and see useful cross-repo state.
- Dashboard data matches GitHub issue and PR state.
- Paid/free boundaries are implemented in code and documented.
- Billing can be enabled without changing the free workflow kit.

## Phase 6 - Marketplace readiness

Goal: prepare for a GitHub Marketplace listing and public launch.

### Product outcomes

- Marketplace users understand what is free, what is paid, and how to start.
- Installation flow is reliable enough for strangers.
- Support, security, and billing expectations are clear.

### Development tasks

- Prepare Marketplace listing copy:
  - short description
  - long description
  - screenshots
  - pricing summary
  - support URL
  - privacy policy URL
  - terms URL
- Prepare public docs for:
  - install
  - upgrade
  - uninstall
  - permissions
  - security model
  - data retention
  - billing and plan limits
- Add operational monitoring for the hosted App and dashboard.
- Add admin tools for support, installation inspection, and failed webhook replay.
- Run a private beta with 3-5 real users or repositories.
- Freeze the `v1.0` free-core config contract or clearly mark remaining unstable fields.

### Exit criteria

- GitHub App installation flow works from a clean account.
- Marketplace listing materials are complete.
- Paid plan limits and free plan limits are explicit.
- Privacy, terms, and security documents exist.
- Support runbook exists for install failures, webhook failures, billing issues, and workflow-kit drift.

## Suggested release sequence

| Release | Purpose | Audience |
| --- | --- | --- |
| `v0.1` | Installable workflow kit | Internal / personal test repos |
| `v0.2` | Retry, stricter validation, upgrade flow | Early external adopters |
| `v0.3` | Public beta docs, examples, support templates | Public beta users |
| `v0.5` | Private GitHub App foundation | Private App testers |
| `v0.7` | Multi-repo dashboard MVP | Paid beta users |
| `v1.0` | Marketplace-ready free core + paid control plane | GitHub Marketplace |

## What not to build yet

- A polished dashboard before the workflow kit is stable in multiple repositories.
- Broad multi-agent abstraction before Jules-specific workflow reliability is proven.
- Complex project management features that compete with GitHub Issues.
- A hosted backend requirement for users who only need single-repo orchestration.
- Automated destructive actions, such as closing or relabeling stale issues without maintainer intent.

## Immediate next tasks

1. Extend validation to check installed config semantics.
2. Add installer `-DryRun` and `-Upgrade` modes.
3. Add label setup helper or label checklist generation.
4. Add retry / requeue workflow design and implementation.
5. Create a basic fixture repo example for repeatable smoke tests.
6. Add `CHANGELOG.md`, `CONTRIBUTING.md`, and `SECURITY.md`.
7. Run the full install and first-task flow in a second external repository.