# Release checklist

This checklist is for the free JulesOps workflow kit public beta. The remaining Marketplace and control-plane work is tracked in GitHub issues instead of roadmap prose.

## Free Core Public Beta

Run these checks before tagging a workflow-kit release.

### 1. Validate Source Kit

```powershell
.\scripts\validate-kit.ps1
```

Expected result: `JulesOps kit validation passed.`

### 2. Smoke Test Fresh Install

```powershell
$target = Join-Path $env:TEMP ("julesops-release-" + [guid]::NewGuid().ToString("N"))
New-Item -ItemType Directory -Force -Path $target | Out-Null
git -C $target init
Set-Content -LiteralPath (Join-Path $target "README.md") -Value "# JulesOps release fixture"
git -C $target add README.md
git -C $target -c user.email=test@example.com -c user.name=Test commit -m init
.\scripts\install-julesops.ps1 -TargetRepo $target -BaseBranch master
.\scripts\validate-kit.ps1 -TargetRepo $target
```

### 3. Verify Resolver Portability

```powershell
Push-Location $target
python .github\resolve-config.py
Pop-Location
```

The resolver must not require PyYAML or network-installed packages.

### 4. Smoke Test Upgrade

```powershell
.\scripts\install-julesops.ps1 -TargetRepo $target -BaseBranch master -Upgrade
.\scripts\validate-kit.ps1 -TargetRepo $target
```

Confirm `.github/jules-repo.md` is preserved and `.github/julesops.yml` is not overwritten during normal upgrade.

### 5. Verify Integrated Label Bootstrap

The installer now runs label bootstrapping automatically. For a fixture (no GitHub remote), verify it falls back to a manual checklist without erroring:

```powershell
# Already covered by step 2 above — the fresh-install output should include
# "GitHub remote was not detected. Create these labels manually." and list all 7 labels.
```

To verify the standalone script still works independently:

```powershell
.\scripts\bootstrap-labels.ps1 -TargetRepo $target -DryRun
```

This should print the configured queue/state labels without requiring GitHub authentication.

### 6. Permission Audit

Compare workflow `permissions:` blocks against `SECURITY.md`.

### 7. Documentation Audit

```powershell
rg "blocked_comment_marker|stale_threshold_hours|check_interval_hours|^base_branch:" docs
```

Any matches should be historical context only, not current config examples.

### 8. Version Audit

```powershell
.\scripts\release-kit.ps1 -Version v0.4.0 -Date 2026-07-15
```

- Update the version file at `scripts/kit-version.txt`.
- Review the generated `CHANGELOG.md` entry before tagging.
- Verify `git tag --list` contains the intended tag after release.

### 9. Documentation Audit

Before tagging, verify:

- `docs/e2e-adoption-test.md` reflects the current kit version and a recent test run.
- `docs/beta-report.md` §3.2 label table is current (all repos show ✅).
- `docs/marketplace-listing.md` checklist has no unchecked items relevant to the current release.
- `docs/troubleshooting.md` matches the current workflow behavior.

```powershell
# Quick check: look for stale version references in docs
rg "v0\.3\.0|v0\.3\.1" docs --include="*.md"
```

Any matches should be intentional historical references, not stale version examples.
