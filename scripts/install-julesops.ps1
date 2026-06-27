param(
  [Parameter(Mandatory = $true)]
  [string]$TargetRepo,

  [string]$BaseBranch = "main",
  [string]$QueueLabel = "jules-queue",
  [switch]$Force,
  [switch]$DryRun,
  [switch]$Upgrade
)

$ErrorActionPreference = "Stop"

$KitVersion = "v0.1.0"

$scriptRoot = Split-Path -Parent $MyInvocation.MyCommand.Path
$kitRoot = Split-Path -Parent $scriptRoot
$targetRoot = [System.IO.Path]::GetFullPath($TargetRepo)

$files = @(
  @{ Source = "templates/jules-core.md"; Target = ".github/jules-core.md" },
  @{ Source = "templates/jules-task.yml"; Target = ".github/ISSUE_TEMPLATE/jules-task.yml" },
  @{ Source = "templates/julesops.yml"; Target = ".github/julesops.yml" },
  @{ Source = "templates/resolve-config.py"; Target = ".github/resolve-config.py" },
  @{ Source = "workflows/jules-dispatch.yml"; Target = ".github/workflows/jules-dispatch.yml" },
  @{ Source = "workflows/jules-state-sync.yml"; Target = ".github/workflows/jules-state-sync.yml" },
  @{ Source = "workflows/jules-watchdog.yml"; Target = ".github/workflows/jules-watchdog.yml" }
)

if ($DryRun) {
  Write-Host "[DryRun] --- JulesOps Installation/Upgrade Preview ---"
  Write-Host "[DryRun] Target Repository: $targetRoot"
  Write-Host "[DryRun] Installing version: $KitVersion"
}

foreach ($file in $files) {
  $source = Join-Path $kitRoot $file.Source
  $target = Join-Path $targetRoot $file.Target
  $targetDir = Split-Path -Parent $target

  if (-not (Test-Path -LiteralPath $source)) {
    throw "Missing kit file: $source"
  }

  $exists = Test-Path -LiteralPath $target
  $shouldCopy = $true

  if ($exists) {
    if ($file.Target -eq ".github/julesops.yml" -and $Upgrade -and -not $Force) {
      $shouldCopy = $false
      if ($DryRun) {
        Write-Host "[DryRun] [Upgrade] Will preserve (skip overwrite): $target"
      } else {
        Write-Host "[Upgrade] Preserved (skipped overwrite): $target"
      }
    } else {
      if ($Force -or $Upgrade) {
        if ($DryRun) {
          Write-Host "[DryRun] Would overwrite: $target (with version: $KitVersion)"
        } else {
          Write-Host "Overwriting: $target (with version: $KitVersion)"
        }
      } else {
        throw "Target file already exists: $target. Re-run with -Force or -Upgrade to overwrite/refresh JulesOps-managed files."
      }
    }
  } else {
    if ($DryRun) {
      Write-Host "[DryRun] Would copy: $source -> $target (with version: $KitVersion)"
    }
  }

  if ($shouldCopy -and -not $DryRun) {
    New-Item -ItemType Directory -Force -Path $targetDir | Out-Null
    
    $content = Get-Content -LiteralPath $source -Raw
    $ext = [System.IO.Path]::GetExtension($target)
    $marker = ""
    if ($ext -eq ".md") {
      $marker = "<!-- JulesOps kit version: $KitVersion -->`r`n"
    } elseif ($ext -eq ".yml" -or $ext -eq ".yaml" -or $ext -eq ".py") {
      $marker = "# JulesOps kit version: $KitVersion`r`n"
    }
    
    Set-Content -LiteralPath $target -Value ($marker + $content) -NoNewline
  }
}

$configPath = Join-Path $targetRoot ".github/julesops.yml"
$wroteNewConfig = -not (Test-Path -LiteralPath $configPath) -or ($Force -or -not $Upgrade)

if ($wroteNewConfig) {
  if ($DryRun) {
    Write-Host "[DryRun] Would customize .github/julesops.yml:"
    Write-Host "  - Set base_branch to: $BaseBranch"
    Write-Host "  - Set queue_label to: $QueueLabel"
  } else {
    $config = Get-Content -LiteralPath $configPath -Raw
    $config = $config -replace "base_branch: main", "base_branch: $BaseBranch"
    $config = $config -replace "queue_label: jules-queue", "queue_label: $QueueLabel"
    Set-Content -LiteralPath $configPath -Value $config -NoNewline
  }
}

$repoInstructionsPath = Join-Path $targetRoot ".github/jules-repo.md"
$instructionsExists = Test-Path -LiteralPath $repoInstructionsPath

if ($instructionsExists) {
  if ($DryRun) {
    Write-Host "[DryRun] $repoInstructionsPath already exists (would skip to preserve existing instructions)"
  } else {
    Write-Host "[Upgrade] Preserved existing instructions: $repoInstructionsPath"
  }
} else {
  if ($DryRun) {
    Write-Host "[DryRun] Would create repository-specific instructions stub: $repoInstructionsPath (with version: $KitVersion)"
  } else {
    $marker = "<!-- JulesOps kit version: $KitVersion -->`r`n"
    $content = $marker + @"
# Repository-specific Jules instructions

Describe the repository-specific rules Jules should follow here.

Include:
- verification commands
- branch or release policies
- schema, migration, or deployment rules
- sensitive areas Jules should avoid unless the issue explicitly asks for changes
"@
    Set-Content -LiteralPath $repoInstructionsPath -Value $content -NoNewline
  }
}

if ($DryRun) {
  Write-Host "[DryRun] --- End of Preview (No files were modified) ---"
} else {
  if ($Upgrade) {
    Write-Host "Upgraded JulesOps in $targetRoot successfully to version $KitVersion."
  } else {
    Write-Host "Installed JulesOps into $targetRoot (version $KitVersion)"
  }
}