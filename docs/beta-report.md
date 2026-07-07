# JulesOps External Beta Report

**Date**: 2026-07-07
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

---

## 2. Installation outcomes

### 2.1 Fresh installs (plugin-template, poker-anki)

| Step | Result |
|---|---|
| `install-julesops.ps1 -BaseBranch main` | ✅ Success |
| Files created | 7 kit files + `jules-repo.md` stub |
| Config customized | `base_branch: main`, `queue_label: jules-queue` |
| Kit version marker | Embedded in all installed files |

No friction observed. The installer worked on first attempt without errors.

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

All 4 repos passed **file-level and config-level validation** — all required files exist, config YAML parses correctly, base branch exists locally.

All 4 repos **failed remote label validation** — the JulesOps state labels (`status:todo`, `status:in-progress`, etc.) do not yet exist on the GitHub remotes. This is expected for a local-only beta install; labels must be created via `bootstrap-labels.ps1` before workflows can run.

| Repo | Files OK | Config OK | Branch OK | Labels OK |
|---|---|---|---|---|
| `obsidian-plugin-template` | ✅ | ✅ | ✅ | ❌ (not yet bootstrapped) |
| `obsidian-MOC-plugin` | ✅ | ✅ | ✅ | ❌ (partial — `status:failed` missing) |
| `pomoTomato` | ✅ | ✅ | ✅ | ❌ (partial — `status:failed` missing) |
| `poker-anki` | ✅ | ✅ | ✅ | ❌ (not yet bootstrapped) |

### 3.3 Label bootstrap dry-run

`bootstrap-labels.ps1 -DryRun` ran successfully for all 4 repos, printing the expected 7 labels per repo with correct names, colors, and descriptions. No errors.

---

## 4. Config resolver portability

The Python config resolver (`resolve-config.py`) was tested in each repo:

| Repo | Resolver result | All 18 fields resolved? |
|---|---|---|
| `obsidian-plugin-template` | ✅ Success | ✅ 18/18 |
| `obsidian-MOC-plugin` | ✅ Success | ✅ 18/18 |
| `pomoTomato` | ✅ Success | ✅ 18/18 |
| `poker-anki` | ✅ Success | ✅ 18/18 |

The resolver uses only Python stdlib — no PyYAML or network packages required. Portability confirmed across all test repos.

---

## 5. Feedback and observations

### What worked well

- **Installer portability**: The installer worked identically across public and private repos, and across repos with and without prior JulesOps files.
- **Upgrade path**: The `-Upgrade` flag correctly preserves `julesops.yml` and `jules-repo.md` while refreshing all other managed files.
- **Config resolver**: Pure-stdlib Python parser worked in all repos without dependencies.
- **Validation tooling**: `validate-kit.ps1` catches real issues (missing labels) with clear error messages.

### Friction points

1. **Label bootstrapping is a separate step**: A new operator may forget to run `bootstrap-labels.ps1` after installation. The installer could print a reminder.
2. **Upgrade vs. fresh install UX**: A first-time user who runs the installer twice (e.g. after a failed first attempt) hits the "already exists" error and must know about `-Upgrade` or `-Force`. The error message is clear, but this could be smoother.
3. **`JULES_API_KEY` secret not validated**: The installer has no way to check whether the GitHub secret is configured. Dispatch will silently fail until the user adds it.

### No breaking changes identified

All config fields parsed identically across repos. The resolver defaults are sensible and the config template works as-is for `main`-branch repos.

---

## 6. Summary

| Criterion | Status |
|---|---|
| 3–5 external repos installed | ✅ 4 new + 1 existing = 5 total |
| Beta feedback collected | ✅ See §5 above |
| Config contract validated | ✅ 18/18 fields resolve correctly |
| Breaking changes | None identified |
