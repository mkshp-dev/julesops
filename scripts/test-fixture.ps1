param(
  [string]$FixturePath = "examples/fixture-basic/repo"
)

$ErrorActionPreference = "Stop"

$scriptRoot = Split-Path -Parent $MyInvocation.MyCommand.Path
$kitRoot = Split-Path -Parent $scriptRoot
$fixtureRoot = Join-Path $kitRoot $FixturePath

function Assert-PathMissing {
  param([string]$Path, [string]$Message)
  if (Test-Path -LiteralPath $Path) {
    throw $Message
  }
}

function Assert-ContainsText {
  param([string]$Path, [string]$Text, [string]$Message)
  $content = Get-Content -LiteralPath $Path -Raw
  if ($content -notmatch [regex]::Escape($Text)) {
    throw $Message
  }
}

function New-FixtureCopy {
  $target = Join-Path $env:TEMP ("julesops-fixture-" + [guid]::NewGuid().ToString("N"))
  New-Item -ItemType Directory -Force -Path $target | Out-Null
  Copy-Item -Path (Join-Path $fixtureRoot "*") -Destination $target -Recurse -Force
  git -C $target init | Out-Null
  git -C $target checkout -b main | Out-Null
  git -C $target add . | Out-Null
  git -C $target -c user.email=fixture@example.com -c user.name="JulesOps Fixture" commit -m "fixture init" | Out-Null
  return $target
}

if (-not (Test-Path -LiteralPath $fixtureRoot -PathType Container)) {
  throw "Fixture repo not found at: $fixtureRoot"
}

Push-Location $kitRoot
try {
  Write-Host "Running JulesOps fixture smoke test..."

  $dryRunTarget = New-FixtureCopy
  .\scripts\install-julesops.ps1 -TargetRepo $dryRunTarget -BaseBranch main -DryRun | Out-Host
  Assert-PathMissing (Join-Path $dryRunTarget ".github") "Dry-run install should not create .github files."
  Write-Host "  Dry-run install did not write files."

  $target = New-FixtureCopy
  .\scripts\install-julesops.ps1 -TargetRepo $target -BaseBranch main | Out-Host
  .\scripts\validate-kit.ps1 -TargetRepo $target | Out-Host

  Push-Location $target
  try {
    python .github\resolve-config.py | Out-Host
  }
  finally {
    Pop-Location
  }

  .\scripts\bootstrap-labels.ps1 -TargetRepo $target -DryRun | Out-Host

  $configPath = Join-Path $target ".github/julesops.yml"
  Add-Content -LiteralPath $configPath -Value "`n# fixture-preserve-marker"
  .\scripts\install-julesops.ps1 -TargetRepo $target -BaseBranch main -Upgrade | Out-Host
  Assert-ContainsText $configPath "fixture-preserve-marker" "Upgrade should preserve existing .github/julesops.yml."
  Write-Host "  Upgrade preserved config."

  .\scripts\install-julesops.ps1 -TargetRepo $target -BaseBranch main -Force | Out-Host
  $configAfterForce = Get-Content -LiteralPath $configPath -Raw
  if ($configAfterForce -match "fixture-preserve-marker") {
    throw "Force install should overwrite generated config."
  }
  Write-Host "  Force install overwrote generated config."

  $missingBranchTarget = New-FixtureCopy
  .\scripts\install-julesops.ps1 -TargetRepo $missingBranchTarget -BaseBranch does-not-exist | Out-Host
  $failedAsExpected = $false
  try {
    .\scripts\validate-kit.ps1 -TargetRepo $missingBranchTarget | Out-Host
  }
  catch {
    if ($_.Exception.Message -match "does not exist") {
      $failedAsExpected = $true
      Write-Host "  Missing branch validation failed as expected."
    } else {
      throw
    }
  }

  if (-not $failedAsExpected) {
    throw "Validation should fail when configured base branch is missing."
  }

  Write-Host "JulesOps fixture smoke test passed."
}
finally {
  Pop-Location
}