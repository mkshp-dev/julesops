# JulesOps

Run Google Jules safely inside GitHub.

JulesOps is a GitHub Action that turns labeled issues into a queue for Google Jules. It sends one issue at a time to Jules, tracks it through `todo ➔ in progress ➔ review ➔ done` as the pull request moves, and lets maintainers retry failures with a comment.

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

1. **Add your Jules API key** as a repository secret named `JULES_API_KEY` (Settings ➔ Secrets and variables ➔ Actions). Get a key at [jules.google.com/settings/api](https://jules.google.com/settings/api).
2. **Add this workflow** as `.github/workflows/julesops.yml`:

   ```yaml
   name: JulesOps

   on:
     schedule:
       - cron: "15 * * * *"   # pick up the next queued issue every hour
     workflow_dispatch:       # "Run workflow" button, and /jules retry
     pull_request:
       types: [opened, reopened, closed]
     issue_comment:
       types: [created]

   permissions:
     contents: read
     issues: write
     pull-requests: read
     actions: write           # lets /jules retry start this workflow

   jobs:
     dispatch:
       if: github.event_name == 'schedule' || github.event_name == 'workflow_dispatch'
       runs-on: ubuntu-latest
       concurrency: julesops-dispatch   # never dispatch two issues at once
       steps:
         - uses: actions/checkout@v5
         - uses: mkshp-dev/julesops@v0.6.0
           with:
             jules-api-key: ${{ secrets.JULES_API_KEY }}

     sync:
       if: github.event_name == 'pull_request' || github.event_name == 'issue_comment'
       runs-on: ubuntu-latest
       steps:
         - uses: actions/checkout@v5
         - uses: mkshp-dev/julesops@v0.6.0
   ```
3. **Queue a task**: label an issue `jules-queue` and describe the work in its body. JulesOps creates its labels on the first run.
4. **Dispatch**: the next hourly run sends it to Jules, or start one now from the Actions tab (**JulesOps ➔ Run workflow**).

When Jules opens a pull request that says `Closes #<issue>`, the issue moves to review, and to done when the PR is merged. If a task fails or blocks, a maintainer comments `/jules retry` on the issue to queue it again.

No config file is needed. To change the base branch, labels, or policies, add a [`.github/julesops.yml`](templates/julesops.yml) — see [`docs/repo-config-spec.md`](docs/repo-config-spec.md) for every option.

### Inputs

| Input | Default | Description |
|---|---|---|
| `jules-api-key` | — | Jules API key. Required for dispatch. |
| `mode` | `auto` | `dispatch`, `sync`, `watchdog`, or `auto`. `auto` runs watchdog + dispatch on `schedule` / `workflow_dispatch`, and sync on `pull_request` / `issue_comment`. |
| `github-token` | `github.token` | Token for reading and updating issues, labels, and PRs. |
| `config-path` | `.github/julesops.yml` | Optional config file. |
| `dispatch-workflow` | the calling workflow | Workflow to start after `/jules retry`. |
| `dry-run` | `false` | Log every change instead of making it, and don't invoke Jules. |

Outputs: `mode` (the modes that ran) and `issue-number` (the issue selected for dispatch).

### Want more control?

The kit installer sets up separate dispatch, sync, and watchdog workflows, a `.github/julesops.yml` to edit, a **Jules Task** issue template, and repository-specific instructions for Jules. The workflows call this same action:

```bash
git clone https://github.com/mkshp-dev/julesops.git && cd julesops
scripts/install-julesops.sh --base-branch main /path/to/your/repo
```

See [`docs/install.md`](docs/install.md). The installer needs `bash`, `git`, and `python3`.

---

## Architecture

JulesOps is split into two logical layers:
- **The action** (`mkshp-dev/julesops`): dispatch, sync, and watchdog logic, run from your repository's workflows. The optional kit installer adds a config file, issue template, and instructions around it.
- **State Machine**: Driven by GitHub labels (`status:todo`, `status:in-progress`, `status:review`, `status:blocked`, `status:failed`, `status:done`).

The lifecycle is described in [`docs/state-machine.md`](docs/state-machine.md).

---

## Security

- **Permissions Required**: `contents: read` to read the config and instruction files, `issues: write` to manage status labels and post comments, `pull-requests: read` to read linked PRs, and `actions: write` only so `/jules retry` can start the workflow.
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
Yes. Add the workflow to each repository; each one keeps its own queue.

### Does it work on forks?
No, for security reasons GitHub Action secrets (`JULES_API_KEY`) are not passed to pull requests from forks.

### What happens if Jules is unavailable?
The job is labeled `status:failed` with a clear explanation, and can be retried later using `/jules retry`. If Jules accepts a task but never opens a pull request, the watchdog marks the issue failed after 72 hours so the queue keeps moving. After 3 attempts, `/jules retry --force` is needed, to avoid retrying a task that keeps failing.

---

## Free and open source

JulesOps is free and MIT-licensed, with no paid tier. If it saves you time, you can support its development through [GitHub Sponsors](https://github.com/sponsors/mkshp-dev).

---

## Roadmap

- [ ] Multiple Jules providers
- [ ] Performance metrics
- [ ] Cross-repository dashboard. An experimental, unmaintained prototype lives in [`server/`](server/README.md); it isn't part of any release.
