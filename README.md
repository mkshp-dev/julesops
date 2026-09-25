# JulesOps

Run Google Jules safely inside GitHub.

JulesOps is a GitHub Actions workflow kit that turns issues, pull requests, comments, and labels into a reliable automation workflow for Google Jules.

✔ Queue jobs  
✔ Prevent duplicate runs  
✔ Synchronize PR state  
✔ Recover from failures  
✔ Works with any repository  

[![GitHub Marketplace](https://img.shields.io/badge/Marketplace-JulesOps-blueviolet?logo=github)](https://github.com/marketplace/actions/julesops)
[![Latest Release](https://img.shields.io/github/v/release/mkshp-dev/julesops?logo=github)](https://github.com/mkshp-dev/julesops/releases)
[![License](https://img.shields.io/github/license/mkshp-dev/julesops)](LICENSE)
[![Stars](https://img.shields.io/github/stars/mkshp-dev/julesops?style=social)](https://github.com/mkshp-dev/julesops/stargazers)
[![Open Issues](https://img.shields.io/github/issues/mkshp-dev/julesops)](https://github.com/mkshp-dev/julesops/issues)

> **Note:** JulesOps is installed as a set of workflow files in your repository, not as a single
> `uses:` step. The Marketplace entry only points you to the installer.

---

## Why JulesOps?

Google Jules is powerful, but managing concurrent requests, retries, stale pull requests, and synchronization quickly becomes difficult. 

JulesOps handles the operational layer so you can focus on reviewing code.

---

## Features

✓ **Job queue** — Serializes tasks to prevent overlapping runs.  
✓ **Retry failed operations** — Re-run failed tasks with a single comment.  
✓ **Automatic state synchronization** — Moves issues through `todo ➔ in progress ➔ review ➔ done` based on Git activity.  
✓ **Comment-based workflow** — Keep maintainers in the loop with automated issue updates.  
✓ **Safe concurrent execution** — Gates runs so only one active job proceeds per repository.  
✓ **GitHub-native** — State is stored directly in issue labels, no databases required.  
✓ **No external infrastructure required** — Runs entirely on GitHub Actions.  

---

## Quick Start

1. **Install the kit**: Clone this repository and run the installer against your repository (requires PowerShell 7+):
   ```powershell
   .\scripts\install-julesops.ps1 -TargetRepo "C:\path\to\repo" -BaseBranch main
   ```
   This copies the workflows, config, and issue template into `.github/` and creates the status labels.
   *(Or refer to the [Manual Installation](docs/install.md#4-manual-install) guide)*
2. **Commit and push** the new `.github/` files.
3. **Add API key**: Save your Jules API key as a repository secret named `JULES_API_KEY` (Settings ➔ Secrets and variables ➔ Actions).
4. **Queue a task**: Open an issue using the **Jules Task** template. It is labeled `jules-queue` + `status:todo` automatically.
5. **Dispatch**: `Jules Dispatch` picks it up on its hourly schedule, or run it immediately from the Actions tab.

If a task fails or blocks, a maintainer can comment `/jules retry` on the issue to requeue it.

---

## Example

After installation your repository contains:

```text
.github/
├── julesops.yml                 # repository config (base branch, labels, policies)
├── jules-core.md                # generic instructions sent to Jules
├── jules-repo.md                # your repository-specific instructions
├── resolve-config.py            # config resolver used by the workflows
├── jules-comment-command.js     # /jules retry | requeue parser
├── ISSUE_TEMPLATE/jules-task.yml
└── workflows/
    ├── jules-dispatch.yml       # picks the next queued issue and invokes Jules
    ├── jules-state-sync.yml     # moves issues through states on PR / comment events
    └── jules-watchdog.yml       # flags stale in-progress / review issues
```

See [`docs/repo-config-spec.md`](docs/repo-config-spec.md) for every config option.

---

## Architecture

JulesOps is split into two logical layers:
- **Local Workflow Kit**: The issue templates, labels, and state synchronization rules running in your repository via GitHub Actions.
- **State Machine**: Driven by GitHub labels (`status:todo`, `status:in-progress`, `status:review`, `status:blocked`, `status:failed`, `status:done`).

For a detailed deep dive, see the [Architecture Documentation](docs/architecture.md) and [Product Boundaries](docs/product.md).

---

## Security

- **Permissions Required**: The workflow requires `contents: read` to access repository config/files, and `issues: write` to manage status labels and post comments.
- **Secrets Used**: Your `JULES_API_KEY` is required to communicate with Google Jules. It is never stored or exposed in logs.
- **Data Egress**: Only code context, instructions, and issue text relevant to the selected task are sent to Google Jules. No other repository data leaves GitHub.
- **Failure Behavior**: If dispatch fails, the issue is labeled `status:failed` with an explanatory comment; details are in the workflow run log. JulesOps never merges code itself.
- **Who can change state**: Only maintainers (`OWNER`, `MEMBER`, `COLLABORATOR`) can run `/jules retry`. Only maintainers or Jules can move an issue to blocked.

---

## FAQ

### Why not invoke Jules directly?
Invoking Jules directly lacks queue management, leading to duplicate runs, race conditions on pull requests, and uncoordinated state between issues and code.

### Why a queue?
To prevent concurrent runs from stomping on each other, keeping development serial and code changes easy to review.

### Can multiple repositories use it?
Yes, each repository installs its own local kit or accesses the shared app listing.

### Does it work on forks?
No, for security reasons GitHub Action secrets (`JULES_API_KEY`) are not passed to pull requests from forks.

### What happens if Jules is unavailable?
The job is labeled `status:failed` with a clear explanation, and can be retried later using `/jules retry`.

---

## Roadmap

- [ ] Multiple Jules providers
- [ ] Operational dashboard
- [ ] Performance metrics
- [ ] GitHub App integration
- [ ] Cloud control plane