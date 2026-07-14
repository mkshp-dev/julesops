# Uninstall JulesOps from a repository
#
# JulesOps kit version: managed by install-julesops.ps1
#
# Removes all JulesOps-managed files from a target repository.
# Does NOT delete .github/julesops.yml or .github/jules-repo.md by default
# (these contain user-customized content). Use -IncludeConfig to remove those too.
#
# Usage:
#   .\scripts\uninstall-julesops.ps1 -TargetRepo "C:\path\to\target-repo"
#   .\scripts\uninstall-julesops.ps1 -TargetRepo "C:\path\to\target-repo" -IncludeConfig
#   .\scripts\uninstall-julesops.ps1 -TargetRepo "C:\path\to\target-repo" -DryRun

param(
  [Parameter(Mandatory = $true)]
  [string]$TargetRepo,

  [switch]$IncludeConfig,
  [switch]$DryRun
)

$ErrorActionPreference = "Stop"
$targetRoot = [System.IO.Path]::GetFullPath($TargetRepo)

# Files always removed (kit-managed, no user content)
$managedFiles = @(
  ".github/jules-core.md",
  ".github/resolve-config.py",
  ".github/ISSUE_TEMPLATE/jules-task.yml",
  ".github/workflows/jules-dispatch.yml",
  ".github/workflows/jules-state-sync.yml",
  ".github/workflows/jules-watchdog.yml"
)

# Files removed only with -IncludeConfig (contain user-customized content)
$configFiles = @(
  ".github/julesops.yml",
  ".github/jules-repo.md"
)

if ($DryRun) {
  Write-Host "[DryRun] --- JulesOps Uninstall Preview ---"
  Write-Host "[DryRun] Target: $targetRoot"
  if ($IncludeConfig) {
    Write-Host "[DryRun] Mode: Full removal including config and repo instructions"
  } else {
    Write-Host "[DryRun] Mode: Managed files only (julesops.yml + jules-repo.md preserved)"
  }
  Write-Host ""
}

$removedCount = 0
$skippedCount = 0

foreach ($file in $managedFiles) {
  $fullPath = Join-Path $targetRoot $file
  if (Test-Path -LiteralPath $fullPath) {
    if ($DryRun) {
      Write-Host "[DryRun] Would remove: $fullPath"
    } else {
      Remove-Item -LiteralPath $fullPath -Force
      Write-Host "Removed: $fullPath"
    }
    $removedCount++
  } else {
    if ($DryRun) {
      Write-Host "[DryRun] Not present (skip): $fullPath"
    }
    $skippedCount++
  }
}

if ($IncludeConfig) {
  foreach ($file in $configFiles) {
    $fullPath = Join-Path $targetRoot $file
    if (Test-Path -LiteralPath $fullPath) {
      if ($DryRun) {
        Write-Host "[DryRun] Would remove (config): $fullPath"
      } else {
        Remove-Item -LiteralPath $fullPath -Force
        Write-Host "Removed (config): $fullPath"
      }
      $removedCount++
    } else {
      if ($DryRun) {
        Write-Host "[DryRun] Not present (skip): $fullPath"
      }
      $skippedCount++
    }
  }
} else {
  Write-Host ""
  Write-Host "Preserved (user config): .github/julesops.yml"
  Write-Host "Preserved (user config): .github/jules-repo.md"
  Write-Host ""
  Write-Host "To remove these as well, re-run with -IncludeConfig."
}

# Clean up empty directories
$dirsToCheck = @(
  ".github/ISSUE_TEMPLATE",
  ".github/workflows"
)

foreach ($dir in $dirsToCheck) {
  $fullDir = Join-Path $targetRoot $dir
  if (Test-Path -LiteralPath $fullDir -PathType Container) {
    $remaining = Get-ChildItem -LiteralPath $fullDir -ErrorAction SilentlyContinue
    if ($null -eq $remaining -or $remaining.Count -eq 0) {
      if ($DryRun) {
        Write-Host "[DryRun] Would remove empty directory: $fullDir"
      } else {
        Remove-Item -LiteralPath $fullDir -Force
        Write-Host "Removed empty directory: $fullDir"
      }
    }
  }
}

Write-Host ""
if ($DryRun) {
  Write-Host "[DryRun] --- End of Preview (No files were modified) ---"
} else {
  Write-Host "JulesOps uninstall complete."
  Write-Host "  Files removed: $removedCount"
  Write-Host "  Not present:   $skippedCount"
  Write-Host ""
  Write-Host "Remember to:"
  Write-Host "  - Remove the JULES_API_KEY secret if no longer needed:"
  Write-Host "    https://github.com/OWNER/REPO/settings/secrets/actions"
  Write-Host "  - Delete any open Jules task issues if desired."
  Write-Host "  - Remove JulesOps labels if desired (jules-queue, status:*)."
}
