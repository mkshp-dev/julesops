param(
  [string]$TargetRepo
)

$ErrorActionPreference = "Stop"

$scriptRoot = Split-Path -Parent $MyInvocation.MyCommand.Path
$kitRoot = Split-Path -Parent $scriptRoot

function Assert-File {
  param([string]$Path, [string]$Message)
  if (-not (Test-Path -LiteralPath $Path -PathType Leaf)) {
    throw $Message
  }
}

function Assert-Contains {
  param([string]$Path, [string]$Pattern, [string]$Message)
  $content = Get-Content -LiteralPath $Path -Raw
  if ($content -notmatch $Pattern) {
    throw $Message
  }
}

$kitFiles = @(
  "templates/jules-core.md",
  "templates/jules-task.yml",
  "templates/julesops.yml",
  "workflows/jules-dispatch.yml",
  "workflows/jules-state-sync.yml",
  "workflows/jules-watchdog.yml",
  "examples/aggregator/julesops.yml",
  "examples/aggregator/jules-repo.md"
)

foreach ($file in $kitFiles) {
  Assert-File (Join-Path $kitRoot $file) "Missing required kit file: $file"
}

Assert-Contains (Join-Path $kitRoot "templates/julesops.yml") "watchdog:\s*\r?\n\s+stale_in_progress_hours:" "templates/julesops.yml must include watchdog defaults."
Assert-Contains (Join-Path $kitRoot "workflows/jules-dispatch.yml") "jules_api_key:\s*\$\{\{\s*secrets\.JULES_API_KEY\s*\}\}" "Dispatch workflow must pass the JULES_API_KEY secret to Jules."
Assert-Contains (Join-Path $kitRoot "workflows/jules-watchdog.yml") "JulesOps Watchdog" "Watchdog workflow must include the watchdog comment marker."

if ($TargetRepo) {
  $targetRoot = (Resolve-Path -LiteralPath $TargetRepo).Path
  $installedFiles = @(
    ".github/jules-core.md",
    ".github/jules-repo.md",
    ".github/julesops.yml",
    ".github/ISSUE_TEMPLATE/jules-task.yml",
    ".github/workflows/jules-dispatch.yml",
    ".github/workflows/jules-state-sync.yml",
    ".github/workflows/jules-watchdog.yml"
  )

  foreach ($file in $installedFiles) {
    Assert-File (Join-Path $targetRoot $file) "Missing installed JulesOps file in target repo: $file"
  }

  Assert-Contains (Join-Path $targetRoot ".github/julesops.yml") "base_branch:\s*\S+" "Installed config must declare repository.base_branch."
  Assert-Contains (Join-Path $targetRoot ".github/julesops.yml") "queue_label:\s*\S+" "Installed config must declare queue.queue_label."
}

Write-Host "JulesOps kit validation passed."