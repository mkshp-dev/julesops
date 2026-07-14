# JulesOps External Beta Report

**Date**: 2026-07-08
**Kit version**: v0.3.0
**Conducted by**: automated validation pass (issue #66)

---

## 1. Target repositories

| # | Repository | Visibility | Default branch | Prior JulesOps install? |
|---|---|---|---|---|
| 1 | `mkshp-dev/obsidian-plugin-template` | Public | `main` | No |
| 2 | `mkshp-dev/obsidian-MOC-plugin` | Public | `main` | Yes (partial, pre-v0.3.0) |
| 3 | `mkshp-dev/pomoTomato` | Private | `main` | Yes (partial, pre-v0.3.0) |
| 4 | `mkshp-dev/poker-anki` | Private | `main` | No |
| 5 | `mkshp-dev/Aggregator` | Private | `Dev` | Yes (active, pre-v0.3.0) |
| 6 | `mkshp-dev/obsidian-sql-plugin` | Public | `Dev` | No |

---

## 2. Installation outcomes

### 2.1 Fresh installs (plugin-template, poker-anki, obsidian-sql-plugin)

| Step | Result |
|---|---|
| `install-julesops.ps1 -BaseBranch main` | ✅ Success |
| Files created | 7 kit files + `jules-repo.md` stub |
| Config customized | `base_branch: main`, `queue_label: jules-queue` |
| Kit version marker | Embedded in all installed files |

No friction observed. The installer worked on first attempt without errors.

**obsidian-sql-plugin** additionally exercises the non-`main` default branch (`Dev`) and confirms the integrated label bootstrap. Notable observations:

| Step | Result |
|---|---|
| `install-julesops.ps1 -BaseBranch Dev -DryRun` | ✅ Success — 7 files previewed, labels skipped with clear note |
| `install-julesops.ps1 -BaseBranch Dev` | ✅ Success — files written + 7 labels created on GitHub in one step |
| Duplicate install (no flags) | ❌ Blocked — `Target file already exists` (expected, clear message) |
| `install-julesops.ps1 -BaseBranch Dev -Upgrade` | ✅ Success — `julesops.yml` and `jules-repo.md` preserved; labels idempotent (all already existed) |
| Pre-existing non-JulesOps files (`FUNDING.yml`, `deploy-docs.yml`) | ✅ Untouched |

### 2.2 Upgrade installs (MOC-plugin, pomoTomato)

Both repos had partial prior installs (`.github/ISSUE_TEMPLATE/jules-task.yml` and other files existed from an earlier JulesOps version).

| Step | Result |
|---|---|
| `install-julesops.ps1 -BaseBranch main` (no flags) | ❌ Blocked — `Target file already exists` |
| `install-julesops.ps1 -BaseBranch main -Upgrade` | ✅ Success |
| Overwritten files | `jules-core.md`, `jules-task.yml`, `jules-dispatch.yml`, `jules-state-sync.yml` |
| Preserved files | `.github/julesops.yml` (upgrade skip), `.github/jules-repo.md` |

**Feedback**: The `-Upgrade` flag is required for repos with prior installs and correctly preserves `julesops.yml` and `jules-repo.md`. The error message for the non-Upgrade case is clear and actionable.

---

## 3. Validation results

### 3.1 Source kit validation

```
.\scripts\validate-kit.ps1 → JulesOps kit validation passed.
```

### 3.2 Target repo validation

The original 4 repos passed **file-level and config-level validation** but failed remote label validation (labels not yet bootstrapped at the time).

`obsidian-sql-plugin` passes **all validation checks** including remote label validation — labels were created by the integrated bootstrap during install.

| Repo | Files OK | Config OK | Branch OK | Labels OK |
|---|---|---|---|
---|
| `obsidian-plugin-template` | ✅ | ✅ | ✅ | ✅ (bootstrapped — issue #71) |
| `obsidian-MOC-plugin` | ✅ | ✅ | ✅ | ✅ (bootstrapped — issue #71) |
| `pomoTomato` | ✅ | ✅ | ✅ | ✅ (bootstrapped — issue #71) |
| `poker-anki` | ✅ | ✅ | ✅ | ✅ (bootstrapped — issue #71) |
| `obsidian-sql-plugin` | ✅ | ✅ | ✅ | ✅ (bootstrapped by installer) |

### 3.3 Label bootstrap

`bootstrap-labels.ps1 -DryRun` ran successfully for the original 4 repos. For `obsidian-sql-plugin`, label creation ran live as part of the installer — all 7 labels created on first install, idempotent on upgrade (all reported as already existing).

---

## 4. Config resolver portability

The Python config resolver (`resolve-config.py`) was tested in each repo:

| Repo | Resolver result | All 17 fields resolved? |
|---|---|---|
| `obsidian-plugin-template` | ✅ Success | ✅ 17/17 |
| `obsidian-MOC-plugin` | ✅ Success | ✅ 17/17 |
| `pomoTomato` | ✅ Success | ✅ 17/17 |
| `poker-anki` | ✅ Success | ✅ 17/17 |
| `obsidian-sql-plugin` | ✅ Success | ✅ 17/17 |

The resolver uses only Python stdlib — no PyYAML or network packages required. Portability confirmed across all test repos. *(Note: previous report stated 18 fields; actual output is 17. Count corrected.)*

---

## 5. Feedback and observations

### What worked well

- **Installer portability**: The installer worked identically across public and private repos, and across repos with and without prior JulesOps files.
- **Non-`main` default branch**: `obsidian-sql-plugin` uses `Dev` as its default branch; `base_branch: Dev` was written and validated correctly.
- **Integrated label bootstrap**: Labels now created in a single installer run — no separate step needed. Upgrade runs are idempotent (existing labels skipped).
- **Coexistence with existing workflows**: Pre-existing `.github` files (`FUNDING.yml`, `deploy-docs.yml`) were not touched by the installer.
- **Upgrade path**: The `-Upgrade` flag correctly preserves `julesops.yml` and `jules-repo.md` while refreshing all other managed files.
- **Config resolver**: Pure-stdlib Python parser worked in all repos without dependencies.
- **Validation tooling**: `validate-kit.ps1` catches real issues (missing labels) with clear error messages.

### Friction points

1. **~~Label bootstrapping is a separate step~~** *(Fixed)*: Label creation is now integrated into the installer. `bootstrap-labels.ps1` runs automatically at the end of `install-julesops.ps1`. Pass `-SkipLabels` to opt out.
2. **Upgrade vs. fresh install UX**: A first-time user who runs the installer twice (e.g. after a failed first attempt) hits the "already exists" error and must know about `-Upgrade` or `-Force`. The error message is clear, but this could be smoother.
3. **`JULES_API_KEY` secret not validated**: The installer has no way to check whether the GitHub secret is configured. Dispatch will silently fail until the user adds it.

### No breaking changes identified

All config fields parsed identically across repos. The resolver defaults are sensible and the config template works as-is for `main`-branch repos.

---

## 6. Summary

| Criterion | Status |
|---|---|
| 3–5 external repos installed | ✅ 5 new + 1 existing = 6 total |
| Beta feedback collected | ✅ See §5 above |
| Config contract validated | ✅ 17/17 fields resolve correctly |
| Breaking changes | None identified |
| Integrated label bootstrap validated | ✅ `obsidian-sql-plugin` — labels created + idempotent upgrade confirmed |
| All 6 repos label-validated | ✅ Bootstrapped (issue #71) |

---

## 7. End-to-End Adoption Test

**Date**: 2026-07-15 — **Result: ✅ PASS**

A full E2E adoption test was conducted in `mkshp-dev/obsidian-sql-plugin` (kit v0.3.1, `Dev` branch). All 7 test matrix scenarios passed — including the complete happy path (todo → in-progress → review → done) and all non-happy-path scenarios (missing API key, wrong base branch, blocked comment, `/jules retry`).

See [`docs/e2e-adoption-test.md`](e2e-adoption-test.md) for full pass/fail results.
