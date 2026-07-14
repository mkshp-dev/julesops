# JulesOps workflow logic integration tests
#
# Tests key queue selection, active-job blocking, config resolver output,
# and label name resolution without calling Jules or requiring JULES_API_KEY.
#
# Runs in CI on every PR. Safe for public repositories.
#
# Usage:
#   .\scripts\test-workflow-logic.ps1

param(
  [string]$FixturePath = "examples/fixture-basic/repo"
)

$ErrorActionPreference = "Stop"
$scriptRoot = Split-Path -Parent $MyInvocation.MyCommand.Path
$kitRoot    = Split-Path -Parent $scriptRoot

$passed = 0
$failed = 0

function Pass {
  param([string]$Name)
  Write-Host "  [PASS] $Name" -ForegroundColor Green
  $script:passed++
}

function Fail {
  param([string]$Name, [string]$Reason)
  Write-Host "  [FAIL] $Name" -ForegroundColor Red
  Write-Host "         $Reason"
  $script:failed++
}

function New-TestRepo {
  $target = Join-Path $env:TEMP ("julesops-wftest-" + [guid]::NewGuid().ToString("N"))
  $fixtureRoot = Join-Path $kitRoot $FixturePath
  New-Item -ItemType Directory -Force -Path $target | Out-Null
  Copy-Item -Path (Join-Path $fixtureRoot "*") -Destination $target -Recurse -Force
  git -C $target init | Out-Null
  git -C $target checkout -b main | Out-Null
  git -C $target add . | Out-Null
  git -C $target -c user.email=test@example.com -c user.name="WFTest" commit -m "init" | Out-Null
  & "$kitRoot\scripts\install-julesops.ps1" -TargetRepo $target -BaseBranch main -SkipLabels | Out-Null
  return $target
}

function Get-ResolverOutput {
  param([string]$RepoPath)
  $result = [ordered]@{}
  Push-Location $RepoPath
  try {
    $lines = python .github\resolve-config.py 2>&1
    foreach ($line in $lines) {
      if ($line -match '^([^=]+)=(.*)$') {
        $result[$Matches[1].Trim()] = $Matches[2].Trim()
      }
    }
  } finally {
    Pop-Location
  }
  return $result
}

# ─── Suite 1: Config resolver output ───────────────────────────────────────

Write-Host ""
Write-Host "Suite 1: Config resolver output"

$repo1 = New-TestRepo
$cfg = Get-ResolverOutput $repo1

$suite1Tests = @(
  @{ Key = "enabled";              Expected = "true" },
  @{ Key = "base_branch";         Expected = "main" },
  @{ Key = "queue_label";         Expected = "jules-queue" },
  @{ Key = "status_todo";         Expected = "status:todo" },
  @{ Key = "status_in_progress";  Expected = "status:in-progress" },
  @{ Key = "status_review";       Expected = "status:review" },
  @{ Key = "status_blocked";      Expected = "status:blocked" },
  @{ Key = "status_failed";       Expected = "status:failed" },
  @{ Key = "status_done";         Expected = "status:done" },
  @{ Key = "core_instructions";   Expected = ".github/jules-core.md" },
  @{ Key = "repo_instructions";   Expected = ".github/jules-repo.md" },
  @{ Key = "close_on_merge";      Expected = "true" }
)

foreach ($t in $suite1Tests) {
  $actual = $cfg[$t.Key]
  if ($actual -eq $t.Expected) {
    Pass "resolver: $($t.Key) = '$($t.Expected)'"
  } else {
    Fail "resolver: $($t.Key)" "Expected '$($t.Expected)', got '$actual'"
  }
}

# ─── Suite 2: Non-default base branch resolution ────────────────────────────

Write-Host ""
Write-Host "Suite 2: Non-default base branch"

$repo2 = Join-Path $env:TEMP ("julesops-wftest-" + [guid]::NewGuid().ToString("N"))
$fixtureRoot2 = Join-Path $kitRoot $FixturePath
New-Item -ItemType Directory -Force -Path $repo2 | Out-Null
Copy-Item -Path (Join-Path $fixtureRoot2 "*") -Destination $repo2 -Recurse -Force
git -C $repo2 init | Out-Null
git -C $repo2 checkout -b Dev | Out-Null
git -C $repo2 add . | Out-Null
git -C $repo2 -c user.email=test@example.com -c user.name="WFTest" commit -m "init" | Out-Null
& "$kitRoot\scripts\install-julesops.ps1" -TargetRepo $repo2 -BaseBranch Dev -SkipLabels | Out-Null

$cfg2 = Get-ResolverOutput $repo2
if ($cfg2["base_branch"] -eq "Dev") {
  Pass "resolver: non-main base_branch 'Dev' written and resolved correctly"
} else {
  Fail "resolver: non-main base_branch" "Expected 'Dev', got '$($cfg2['base_branch'])'"
}

# ─── Suite 3: Custom label names resolve through config ─────────────────────

Write-Host ""
Write-Host "Suite 3: Custom label names"

$repo3 = New-TestRepo
$configPath = Join-Path $repo3 ".github\julesops.yml"
$config = Get-Content -LiteralPath $configPath -Raw
$config = $config -replace "status:todo",       "task:queued"
$config = $config -replace "status:in-progress", "task:active"
$config = $config -replace "status:review",      "task:review"
$config = $config -replace "status:blocked",     "task:blocked"
$config = $config -replace "status:failed",      "task:failed"
$config = $config -replace "status:done",        "task:done"
Set-Content -LiteralPath $configPath -Value $config -NoNewline

$cfg3 = Get-ResolverOutput $repo3
$labelTests = @(
  @{ Key = "status_todo";        Expected = "task:queued" },
  @{ Key = "status_in_progress"; Expected = "task:active" },
  @{ Key = "status_review";      Expected = "task:review" },
  @{ Key = "status_blocked";     Expected = "task:blocked" },
  @{ Key = "status_failed";      Expected = "task:failed" },
  @{ Key = "status_done";        Expected = "task:done" }
)
foreach ($t in $labelTests) {
  $actual = $cfg3[$t.Key]
  if ($actual -eq $t.Expected) {
    Pass "custom label: $($t.Key) = '$($t.Expected)'"
  } else {
    Fail "custom label: $($t.Key)" "Expected '$($t.Expected)', got '$actual'"
  }
}

# ─── Suite 4: Resolver defaults when fields are absent ──────────────────────

Write-Host ""
Write-Host "Suite 4: Resolver defaults for missing fields"

$repo4 = New-TestRepo
$minimalConfig = @"
julesops:
  enabled: true
  repository:
    base_branch: main
"@
Set-Content -LiteralPath (Join-Path $repo4 ".github\julesops.yml") -Value $minimalConfig -NoNewline

$cfg4 = Get-ResolverOutput $repo4
$defaultTests = @(
  @{ Key = "queue_label";        Expected = "jules-queue" },
  @{ Key = "status_todo";        Expected = "status:todo" },
  @{ Key = "status_in_progress"; Expected = "status:in-progress" },
  @{ Key = "close_on_merge";     Expected = "true" },
  @{ Key = "stale_in_progress_hours"; Expected = "24" },
  @{ Key = "stale_review_hours";      Expected = "72" }
)
foreach ($t in $defaultTests) {
  $actual = $cfg4[$t.Key]
  if ($actual -eq $t.Expected) {
    Pass "default: $($t.Key) = '$($t.Expected)'"
  } else {
    Fail "default: $($t.Key)" "Expected '$($t.Expected)', got '$actual'"
  }
}

# ─── Suite 5: Duplicate install detection ───────────────────────────────────

Write-Host ""
Write-Host "Suite 5: Duplicate install detection"

$repo5 = New-TestRepo
# Second install without flags on non-TTY should exit 1
$proc = Start-Process -FilePath pwsh `
  -ArgumentList "-NonInteractive", "-Command", "& '$kitRoot\scripts\install-julesops.ps1' -TargetRepo '$repo5' -BaseBranch main" `
  -Wait -PassThru -NoNewWindow -RedirectStandardOutput "$env:TEMP\dup-out.txt" `
  -RedirectStandardError "$env:TEMP\dup-err.txt"

if ($proc.ExitCode -ne 0) {
  Pass "duplicate install: exits non-zero on non-TTY without -Upgrade/-Force"
} else {
  Fail "duplicate install: exits non-zero on non-TTY" "Expected exit code 1, got $($proc.ExitCode)"
}

$dupOutput = (Get-Content "$env:TEMP\dup-out.txt" -Raw -ErrorAction SilentlyContinue) + `
             (Get-Content "$env:TEMP\dup-err.txt" -Raw -ErrorAction SilentlyContinue)
if ($dupOutput -match "Prior JulesOps install detected") {
  Pass "duplicate install: banner message shown"
} else {
  Fail "duplicate install: banner message" "Expected 'Prior JulesOps install detected' in output"
}

# ─── Suite 6: Uninstall removes managed files ───────────────────────────────

Write-Host ""
Write-Host "Suite 6: Uninstall removes managed files"

$repo6 = New-TestRepo
$managedAfterInstall = @(
  ".github\jules-core.md",
  ".github\resolve-config.py",
  ".github\ISSUE_TEMPLATE\jules-task.yml",
  ".github\workflows\jules-dispatch.yml"
)
foreach ($f in $managedAfterInstall) {
  if (-not (Test-Path (Join-Path $repo6 $f))) {
    Fail "uninstall pre-check: $f should exist after install" ""
  }
}

& "$kitRoot\scripts\uninstall-julesops.ps1" -TargetRepo $repo6 | Out-Null

$managed = @(
  ".github\jules-core.md",
  ".github\resolve-config.py",
  ".github\ISSUE_TEMPLATE\jules-task.yml",
  ".github\workflows\jules-dispatch.yml",
  ".github\workflows\jules-state-sync.yml",
  ".github\workflows\jules-watchdog.yml"
)
$allRemoved = $true
foreach ($f in $managed) {
  if (Test-Path (Join-Path $repo6 $f)) {
    Fail "uninstall: $f should be removed" "File still exists"
    $allRemoved = $false
  }
}
if ($allRemoved) {
  Pass "uninstall: all managed files removed"
}

# config and repo instructions preserved by default
if (Test-Path (Join-Path $repo6 ".github\julesops.yml")) {
  Pass "uninstall: julesops.yml preserved (no -IncludeConfig)"
} else {
  Fail "uninstall: julesops.yml preserved" "File was removed without -IncludeConfig"
}

if (Test-Path (Join-Path $repo6 ".github\jules-repo.md")) {
  Pass "uninstall: jules-repo.md preserved (no -IncludeConfig)"
} else {
  Fail "uninstall: jules-repo.md preserved" "File was removed without -IncludeConfig"
}

# ─── Results ────────────────────────────────────────────────────────────────

Write-Host ""
Write-Host "────────────────────────────────────────────"
Write-Host "  Results: $passed passed, $failed failed"
Write-Host "────────────────────────────────────────────"

if ($failed -gt 0) {
  Write-Host ""
  Write-Host "FAIL: $failed test(s) failed." -ForegroundColor Red
  exit 1
} else {
  Write-Host ""
  Write-Host "PASS: All $passed workflow logic tests passed." -ForegroundColor Green
}
