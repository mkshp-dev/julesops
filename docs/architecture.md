# JulesOps architecture

This document describes the intended **v1 architecture** of JulesOps and how it should evolve from a repository-local workflow kit into a larger control plane.

---

# 1. Architectural principle

JulesOps should be split into **three conceptual layers** even if the first implementation only ships the first one.

## Layer A — workflow kit (v1, open core)
GitHub-native automation that lives inside the adopting repository.

Responsibilities:
- issue template for Jules tasks
- queue / dispatch workflow
- issue ↔ PR state synchronization
- blocked / failed labeling rules
- watchdog / retry flows
- generic orchestration instructions for Jules
- repository config file consumption

## Layer B — optional backend / control-plane data store (later)
A persistent system of record for JulesOps jobs across repositories.

Responsibilities:
- durable job history
- attempt history and retries
- stale-run detection across repos
- analytics and reporting
- cross-repo visibility
- alerting / notifications

## Layer C — GitHub App / hosted control plane (later)
A productized installation and orchestration surface.

Responsibilities:
- installation / auth
- webhook ingestion
- repo onboarding UX
- comment commands and richer controls
- hosted dashboard and multi-repo management

---

# 2. v1 scope: workflow kit only

The first version of JulesOps should be implementable **without** a GitHub App or hosted backend.

That means:
- state lives primarily in GitHub issues / PRs / labels
- workflows are executed in GitHub Actions
- repo-specific instructions are stored in the adopting repository
- the queue is managed with GitHub labels and workflow logic

This is deliberate. The workflow abstraction needs to stabilize before the product grows a separate hosted control plane.

---

# 3. Core v1 components

## 3.1 Repository config
A repository opting into JulesOps should provide a config file, likely at:

- `.github/julesops.yml`

The config defines:
- base branch
- queue label
- label mapping for states
- instruction file paths
- blocked comment marker
- close-on-merge behavior
- max active jobs

## 3.2 Generic orchestration instructions
JulesOps provides `.github/jules-core.md`, which defines the workflow contract Jules should follow in any JulesOps-managed repo.

## 3.3 Repo-specific instructions
The adopting repository provides `.github/jules-repo.md` (or equivalent) containing repository-specific implementation guidance.

## 3.4 Dispatch workflow
A scheduled or manually triggered GitHub Action that:
1. finds the next eligible queued Jules issue
2. checks whether another Jules issue is already active
3. reads the core + repo instructions
4. reads the issue body
5. invokes Jules with the assembled prompt
6. moves the issue to `status:in-progress` on success
7. moves the issue to `status:failed` on dispatch failure

## 3.5 State sync workflow
A GitHub Action that reacts to:
- pull request open / reopen / close events
- issue comments that contain the blocked marker

It updates issue labels and state based on the JulesOps state machine.

## 3.6 Watchdog workflow
A scheduled workflow that detects stale active jobs, for example:
- issue stuck in `in_progress` for too long without PR or comment activity
- issue stuck in `review` for too long
- possible mismatch between issue state and PR state

---

# 4. State ownership in v1

## GitHub as the source of truth
In v1, the source of truth is GitHub itself:
- issue labels encode the current JulesOps state
- issue comments contain blocked / completion context
- PR state drives review / done / blocked transitions

This is intentionally simple and keeps the first version easy to adopt.

## Consequence
The workflows must be careful to preserve a few invariants:
- only one active issue by default
- merged PR closes or completes the linked issue deterministically
- blocked / failed outcomes are explicit
- dispatch failures do not leave ambiguous in-progress state

---

# 5. Prompt assembly model

The dispatcher should build the Jules prompt from three inputs:

## A. JulesOps core instructions
The generic orchestration contract from `.github/jules-core.md`.

## B. Repo-specific instructions
The adopting repo’s `.github/jules-repo.md`.

## C. The selected issue
At minimum:
- issue number
- issue title
- issue URL
- issue body

The prompt should clearly tell Jules:
- this is the only issue to work on
- what branch to target
- where the repo-specific instructions are
- how to behave if blocked

---

# 6. Future backend model (not v1)

A future backend would likely store a `jules_jobs` table with fields like:

- repository
- issue_number
- current_status
- attempt_number
- dispatched_at
- updated_at
- pr_number
- branch_name
- blocked_reason_summary
- last_sync_source
- last_sync_at
- jules_run_id / session_id if available

This backend would support:
- dashboards
- analytics
- retry tooling
- cross-repo operations
- better watchdogs

But none of that is required for the first portable workflow kit.

---

# 7. Why not start with a GitHub App?

Because the current uncertainty is not authentication or installation mechanics — it is **workflow design**.

JulesOps needs to validate:
- the state machine
- the prompt assembly model
- the repo config contract
- the right failure / retry semantics

Once those are stable across multiple repos, a GitHub App becomes a packaging and productization step rather than a speculative architectural commitment.

---

# 8. Recommended v1 file layout in an adopting repo

```text
.github/
├─ ISSUE_TEMPLATE/
│  └─ jules-task.yml
├─ workflows/
│  ├─ jules-dispatch.yml
│  ├─ jules-state-sync.yml
│  └─ jules-watchdog.yml
├─ jules-core.md           # from JulesOps
├─ jules-repo.md           # repo-specific
└─ julesops.yml            # repo config
```

---

# 9. Near-term implementation plan

## Phase 1
- keep the workflow kit installable from this source repository
- validate canonical templates, workflows, and examples
- test installation into external repositories rather than self-dogfooding this repo

## Phase 2
- add retry / requeue flow
- tighten issue to PR to Jules correlation rules
- validate target branch and required issue links

## Phase 3
- adopt in multiple external repositories
- refine config contract and prompt protocol
- evaluate reusable actions, GitHub App packaging, and hosted control plane work

---

# 10. GitHub App permission model (Phase 4)

When transition packaging moves to a hosted GitHub App in Phase 4 to simplify installation and multi-repository visibility, the App must follow the principle of least privilege. The required permission scopes are:

## 10.1 Repository permissions

| Scope | Permission | Purpose |
| --- | --- | --- |
| **Metadata** | `Read-only` | Access basic repository information, search capabilities, and webhook source validation. |
| **Issues** | `Read & Write` | Observe task issue creation/comments, manage state labels (`todo`, `in-progress`, etc.), and post timeline comments. |
| **Pull Requests** | `Read & Write` | Check base branch targets, verify linking references, edit PR labels, and post warning/status comments on PR timelines. |
| **Contents** | `Read-only` | Read `.github/julesops.yml` and instruction files (`.github/jules-core.md`, `.github/jules-repo.md`) to assemble prompts. *Note: Upgrade to `Read & Write` only if features like automated kit updates or file injection are enabled.* |
| **Actions** | `Read-only` | Monitor workflow run dispatch outcomes and dispatch state status checks. |

## 10.2 Organization permissions

No organization-wide read or write permissions are required, ensuring that the App's access boundaries are strictly isolated to the repositories where users explicitly install it.

## 10.3 App installation & monitoring mode

JulesOps GitHub App supports two operational modes depending on adopter preferences and security policies:

### 10.3.1 Monitor Mode (Default / Recommended)
- **Behavior**: The App acts purely as a monitoring, state-validation, and telemetry plane. It observes webhook events (issues, pull requests, comment creations, workflow runs) and populates the multi-repo operations dashboard, while execution remains fully managed by GitHub Actions inside the repository.
- **Permissions**: Requires only `Read-only` contents permission (to read `.github/julesops.yml` and the instruction prompts).
- **Upgrades**: When workflow kit updates are released, the App alerts maintainers on the dashboard that their workflows are out of date and prompts them to run `.\scripts\install-julesops.ps1 -Upgrade` locally.

### 10.3.2 Auto-Upgrade/Install Mode (Opt-in)
- **Behavior**: The App actively manages the installation and updates of the JulesOps workflows (`jules-*.yml`) and config files directly, ensuring zero-maintenance synchronization.
- **Permissions**: Requires `Read & Write` contents permission.
- **Upgrades**: Upgrades to core workflows are automatically pushed to the target repository via commits created by the App.

## 10.4 Webhook Handler Design

To support real-time state synchronization, self-healing, and dashboard monitoring in Phase 4, the hosted App backend will ingest GitHub webhooks. The handlers are designed as follows:

### 10.4.1 `installation` / `installation_repositories`
- **Events**: `created`, `deleted`, `added`, `removed`.
- **Payload Data**: Installation ID, Account (organization/user) metadata, lists of added/removed repository IDs.
- **Handler Action**:
  - On `created` / `added`: Initialize or update adoption records in the database, kick off metadata sync, and trigger a welcoming notification.
  - On `deleted` / `removed`: Clean up adoption records or mark repositories as inactive.

### 10.4.2 `issues`
- **Events**: `opened`, `edited`, `labeled`, `unlabeled`, `closed`, `reopened`.
- **Payload Data**: Issue object, labels list, sender association.
- **Handler Action**:
  - If the queue label is added: Validate issue config rules, verify queue limit constraints, and trigger the dispatch scheduler.
  - On status label edits: Sync state transitions in the backend database to maintain telemetry.

### 10.4.3 `pull_request`
- **Events**: `opened`, `reopened`, `closed`, `synchronize`.
- **Payload Data**: Pull request object (body description, base branch, merge status), sender association.
- **Handler Action**:
  - Check for linked issue references in the PR description (e.g. `Closes #123`).
  - Run validations: target base branch verification and linked issue verification. If invalid, post warnings on the PR and set the linked issue state to `blocked`.
  - On merge (`closed` + `merged=true`): Transition the linked issue to `done` and trigger auto-closure.
  - On close without merge: Transition the linked issue to `blocked`.

### 10.4.4 `issue_comment`
- **Events**: `created`.
- **Payload Data**: Comment body text, issue context, sender association.
- **Handler Action**:
  - Check if commenter is authorized (maintainer role).
  - Parse comment body:
    - If command is `/jules retry` or `/jules requeue`: Reset labels to `todo` and queue the task for immediate dispatch.
    - If comment contains the `## Blocked` marker (and comes from Jules): Transition the issue to `blocked`.

### 10.4.5 `workflow_run`
- **Events**: `completed`.
- **Payload Data**: Workflow name (`Jules Dispatch`), run conclusion (success, failure, cancelled), run URL.
- **Handler Action**:
  - If dispatch workflow fails: Transition the task issue to `failed` and log the execution error detail for maintainer debugging.
  - If sync/watchdog runs fail: Log telemetry errors and notify operators.

## 10.5 Hosted Job Model & Database Schema

To support multi-repository visibility and attempt auditing in Phase 4 without displacing GitHub as the source of truth, the JulesOps hosted backend implements a read-only telemetry mirror database. 

### 10.5.1 Hosted Job Model Principle
- **GitHub as Source of Truth**: State labels on GitHub issues and PR status continue to drive the core state machine.
- **Hosted Job Mirror**: The database mirrors jobs and attempts based on webhook events. If the database falls out of sync (e.g. due to missed webhooks), the watchdog will correct both GitHub labels and the database state during its scheduled runs.

### 10.5.2 Database Schema (SQL/DDL)

```sql
-- Track App installations
CREATE TABLE installations (
    id BIGINT PRIMARY KEY, -- Matches GitHub Installation ID
    account_id BIGINT NOT NULL, -- Matches GitHub account owner ID
    account_login VARCHAR(255) NOT NULL, -- e.g., 'mkshp-dev'
    account_type VARCHAR(50) NOT NULL, -- 'User' or 'Organization'
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Track authorized repositories
CREATE TABLE repositories (
    id BIGINT PRIMARY KEY, -- Matches GitHub Repository ID
    installation_id BIGINT REFERENCES installations(id) ON DELETE CASCADE,
    name VARCHAR(255) NOT NULL, -- e.g., 'julesops'
    full_name VARCHAR(255) NOT NULL, -- e.g., 'mkshp-dev/julesops'
    base_branch VARCHAR(100) DEFAULT 'main',
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Track high-level task jobs (tied to GitHub Issues)
CREATE TABLE jobs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    repository_id BIGINT REFERENCES repositories(id) ON DELETE CASCADE,
    issue_number INT NOT NULL,
    issue_title VARCHAR(255) NOT NULL,
    current_status VARCHAR(50) NOT NULL, -- todo, in-progress, review, blocked, failed, done
    pr_number INT,
    branch_name VARCHAR(255),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    UNIQUE (repository_id, issue_number)
);

-- Track individual execution attempts for each job (tied to GitHub Action runs)
CREATE TABLE attempts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    job_id UUID REFERENCES jobs(id) ON DELETE CASCADE,
    attempt_number INT NOT NULL,
    workflow_run_id BIGINT, -- Matches GitHub Actions Workflow Run ID
    workflow_run_url VARCHAR(512),
    status VARCHAR(50) NOT NULL, -- running, completed, failed
    conclusion VARCHAR(50), -- success, failure, cancelled, timed_out
    dispatched_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    completed_at TIMESTAMP WITH TIME ZONE
);

-- Audit log of ingested webhook events
CREATE TABLE events (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    repository_id BIGINT REFERENCES repositories(id) ON DELETE CASCADE,
    job_id UUID REFERENCES jobs(id) ON DELETE SET NULL,
    event_type VARCHAR(100) NOT NULL, -- e.g., 'issue_labeled', 'pr_opened'
    payload JSONB NOT NULL, -- raw webhook JSON
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);
```