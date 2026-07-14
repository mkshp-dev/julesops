# JulesOps

Run Google Jules safely inside GitHub.

JulesOps is a GitHub Action that turns pull requests, comments, and labels into a reliable automation workflow for Google Jules.

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

```yaml
- uses: mkshp-dev/julesops@v1
  with:
    jules-api-key: ${{ secrets.JULES_API_KEY }}
```

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

Get up and running in under 2 minutes:

1. **Add workflow**: Run the installer script in your repository:
   ```powershell
   .\scripts\install-julesops.ps1 -TargetRepo "C:\path\to\repo" -BaseBranch main
   ```
   *(Or refer to the [Manual Installation](docs/install.md#4-manual-install) guide)*
2. **Add API key**: Save your Jules API key as a repository secret named `JULES_API_KEY` (Settings ➔ Secrets and variables ➔ Actions).
3. **Create PR**: Open a pull request or issue with a task description.
4. **Comment**: Comment `/jules retry` or add the `jules-queue` label to trigger the dispatch.

Done.

---

## Example

Here is a complete, single-file workflow example for dispatching Jules tasks:

```yaml
# .github/workflows/jules-dispatch.yml
name: Jules Dispatch

on:
  schedule:
    - cron: "15 * * * *"
  workflow_dispatch:

permissions:
  contents: read
  issues: write
  pull-requests: read

jobs:
  dispatch:
    runs-on: ubuntu-latest
    steps:
      - name: Checkout Repository
        uses: actions/checkout@v4

      - name: Run JulesOps Orchestration
        uses: mkshp-dev/julesops@v1
        with:
          jules-api-key: ${{ secrets.JULES_API_KEY }}
```

---

## Demo

![JulesOps in Action](docs/assets/demo.gif)
*(Note: Record a 15-second demo of a PR opening, a `/jules` comment triggering Jules, and the PR updating, then save it to `docs/assets/demo.gif` to display it here).*

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
- **Failure Behavior**: If a task fails or blocks, the workflow posts the error log as an issue comment and rolls back to a safe state without committing bad code.

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