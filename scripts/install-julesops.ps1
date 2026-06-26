param(
  [Parameter(Mandatory = $true)]
  [string]$TargetRepo,

  [string]$BaseBranch = "main",
  [string]$QueueLabel = "jules-queue",
  [switch]$Force
)

$ErrorActionPreference = "Stop"

$scriptRoot = Split-Path -Parent $MyInvocation.MyCommand.Path
$kitRoot = Split-Path -Parent $scriptRoot
$targetRoot = (Resolve-Path -LiteralPath $TargetRepo).Path

$files = @(
  @{ Source = "templates/jules-core.md"; Target = ".github/jules-core.md" },
  @{ Source = "templates/jules-task.yml"; Target = ".github/ISSUE_TEMPLATE/jules-task.yml" },
  @{ Source = "templates/julesops.yml"; Target = ".github/julesops.yml" },
  @{ Source = "workflows/jules-dispatch.yml"; Target = ".github/workflows/jules-dispatch.yml" },
  @{ Source = "workflows/jules-state-sync.yml"; Target = ".github/workflows/jules-state-sync.yml" },
  @{ Source = "workflows/jules-watchdog.yml"; Target = ".github/workflows/jules-watchdog.yml" }
)

foreach ($file in $files) {
  $source = Join-Path $kitRoot $file.Source
  $target = Join-Path $targetRoot $file.Target
  $targetDir = Split-Path -Parent $target

  if (-not (Test-Path -LiteralPath $source)) {
    throw "Missing kit file: $source"
  }

  if ((Test-Path -LiteralPath $target) -and -not $Force) {
    throw "Target file already exists: $target. Re-run with -Force to overwrite JulesOps-managed files."
  }

  New-Item -ItemType Directory -Force -Path $targetDir | Out-Null
  Copy-Item -LiteralPath $source -Destination $target -Force:$Force
}

$configPath = Join-Path $targetRoot ".github/julesops.yml"
$config = Get-Content -LiteralPath $configPath -Raw
$config = $config -replace "base_branch: main", "base_branch: $BaseBranch"
$config = $config -replace "queue_label: jules-queue", "queue_label: $QueueLabel"
Set-Content -LiteralPath $configPath -Value $config -NoNewline

$repoInstructionsPath = Join-Path $targetRoot ".github/jules-repo.md"
if (-not (Test-Path -LiteralPath $repoInstructionsPath)) {
  @"
# Repository-specific Jules instructions

Describe the repository-specific rules Jules should follow here.

Include:
- verification commands
- branch or release policies
- schema, migration, or deployment rules
- sensitive areas Jules should avoid unless the issue explicitly asks for changes
"@ | Set-Content -LiteralPath $repoInstructionsPath -NoNewline
}

Write-Host "Installed JulesOps into $targetRoot"
Write-Host "Next steps:"
Write-Host "  1. Edit .github/jules-repo.md with repository-specific guidance."
Write-Host "  2. Create the labels from .github/julesops.yml."
Write-Host "  3. Add the JULES_API_KEY repository secret."
Write-Host "  4. Run scripts/validate-kit.ps1 -TargetRepo `"$targetRoot`" from the JulesOps repo."