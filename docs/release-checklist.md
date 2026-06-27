# Release checklist

This checklist is for the free JulesOps workflow kit public beta. It is separate from future GitHub Marketplace readiness for the hosted App, dashboard, billing, and multi-repo control plane.

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

### 5. Preview Label Bootstrap

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

- Update `$KitVersion` in `scripts/install-julesops.ps1`.
- Update `CHANGELOG.md`.
- Verify `git tag --list` contains the intended tag after release.

## Marketplace Readiness

Do not treat the project as Marketplace-ready until these hosted-service items exist and are verified:

- GitHub App registration and install flow
- runnable backend with webhook signature verification
- hosted dashboard connected to real data
- billing integration
- privacy policy and terms finalized for hosted service
- support runbook and operational monitoring