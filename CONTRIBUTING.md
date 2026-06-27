# Contributing to JulesOps

Welcome to the JulesOps repository! This document contains instructions and guidelines for developers wishing to contribute.

## Repository Layout

* **`templates/`**: Canonical configuration templates (e.g. `julesops.yml`) and base prompt instructions (e.g. `jules-core.md`).
* **`workflows/`**: Reusable GitHub Action workflows for orchestration (dispatching, state sync, watchdog).
* **`scripts/`**: Utilities like `install-julesops.ps1` for target installation and `validate-kit.ps1` for kit auditing.
* **`docs/`**: Concept, architecture, release plan, and lifecycle specification documents.
* **`examples/`**: Adopting repository examples (e.g. `aggregator` or `fixture-basic`).

---

## Development Workflow

When contributing changes to JulesOps workflows or templates, follow these steps:

### 1. Modifying Files
- Modify files in `templates/` or `workflows/`.
- Ensure any file managed by the installer contains the correct version comment tag.

### 2. Validating the Kit
Before staging commits, run the validation script to verify structure, schemas, and version integrity:
```powershell
.\scripts\validate-kit.ps1
```

### 3. Test Installation
Verify the installer copies and configures files properly:
1. Initialize a temporary test target directory.
2. Run the installer:
   ```powershell
   .\scripts\install-julesops.ps1 -TargetRepo .\temp_target_repo -BaseBranch main
   ```
3. Run the validation script pointing to the target directory:
   ```powershell
   .\scripts\validate-kit.ps1 -TargetRepo .\temp_target_repo
   ```

---

## Coding Guidelines

- **GitHub Actions Workflows**: Minimize duplicate scripts where possible. Prefer using the unified configuration parser helper script `.github/resolve-config.py` for parsing parameters.
- **Convention**: Adhere to [Conventional Commits](https://www.conventionalcommits.org/) standards for all commit messages.
- **Issue Linking**: Ensure all Pull Requests link to a tracked Jules issue in the description (e.g., `Closes #123`) to satisfy strict issue validation checks.
- **Branch Target**: Target the `main` branch.
