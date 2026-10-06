# Contributing to JulesOps

Welcome to the JulesOps repository! This document contains instructions and guidelines for developers wishing to contribute.

## Repository Layout

* **`templates/`**: Canonical configuration templates (e.g. `julesops.yml`) and base prompt instructions (e.g. `jules-core.md`).
* **`workflows/`**: Reusable GitHub Action workflows for orchestration (dispatching, state sync, watchdog).
* **`scripts/`**: Utilities like `install-julesops.sh` for target installation and `validate-kit.sh` for kit auditing.
* **`docs/`**: User documentation: install guide, config reference, state machine, and troubleshooting.
* **`src/`**: Scripts the action (`action.yml`) runs for dispatch, sync, and watchdog.
* **`server/`**: Experimental, parked backend and dashboard prototype (see `server/README.md`). Not needed by the action; bug fixes are welcome but it isn't actively developed.
* **`examples/`**: Adopting repository examples (e.g. `aggregator` or `fixture-basic`).

---

## Development Workflow

When contributing changes to JulesOps workflows or templates, follow these steps:

### 1. Modifying Files
- Modify files in `templates/` or `workflows/`.
- Ensure any file managed by the installer contains the correct version comment tag.

### 2. Validating the Kit
Before staging commits, run the validation script to verify structure, schemas, and version integrity:
```bash
scripts/validate-kit.sh
```

### 3. Run the Test Suites
The same checks run in CI on `ubuntu-latest`:
```bash
shellcheck -x -P scripts scripts/*.sh scripts/lib/common.sh
scripts/test-fixture.sh          # install / upgrade / force / validate against a fixture repo
scripts/test-workflow-logic.sh   # resolver output, defaults, installed workflows, upgrade, uninstall
scripts/test-action.sh           # action scripts in src/ against a stubbed gh CLI
node scripts/__tests__/comment-command.test.js
```

To try the installer by hand, point it at any Git repository:
```bash
scripts/install-julesops.sh --base-branch main ./temp_target_repo
scripts/validate-kit.sh ./temp_target_repo
```

---

## Coding Guidelines

- **Kit scripts**: Write them in bash, source `scripts/lib/common.sh`, and keep them compatible with bash 3.2 (the macOS system bash): no associative arrays, `mapfile`, or `${var,,}`. Read config through `scripts/lib/config_dump.py` so scripts and workflows parse `julesops.yml` the same way.
- **Action logic**: The action (`action.yml`) runs the scripts in `src/`. Put logic there, not in workflow YAML; the kit workflows in `workflows/` are thin wrappers. Scripts read config from the `JULESOPS_*` variables exported by `templates/resolve-config.py`, and every GitHub write goes through `gh_write` / `set_status` in `src/lib.sh` so `dry-run` is honored. Cover changes in `scripts/test-action.sh`.
- **Convention**: Adhere to [Conventional Commits](https://www.conventionalcommits.org/) standards for all commit messages.
- **Issue Linking**: Ensure all Pull Requests link to a tracked Jules issue in the description (e.g., `Closes #123`) to satisfy strict issue validation checks.
- **Branch Target**: Target the `main` branch.
---

## Issue Template Ownership

The source repository's `.github/ISSUE_TEMPLATE/` files are for maintaining JulesOps itself, such as bug reports, feature requests, and adoption feedback.

The installed adopter issue template is `templates/jules-task.yml`. The installer copies only that template into target repositories as `.github/ISSUE_TEMPLATE/jules-task.yml`.

Do not treat the JulesOps source repository as self-installed unless that is explicitly part of a task.