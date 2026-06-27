param(
  [string]$TargetRepo = ".",
  [switch]$DryRun
)

$ErrorActionPreference = "Stop"

$targetRoot = [System.IO.Path]::GetFullPath($TargetRepo)
$configPath = Join-Path $targetRoot ".github/julesops.yml"

if (-not (Test-Path -LiteralPath $configPath -PathType Leaf)) {
  throw "Config file not found at: $configPath. Please run the installer first."
}

function Parse-YamlValue {
  param([string]$RawVal)
  if ($null -eq $RawVal) { return $null }
  $trimmed = $RawVal.Trim()
  if ($trimmed -match '^"(.*)"\s*(#.*)?$') { return $Matches[1] }
  if ($trimmed -match "^'(.*)'\s*(#.*)?$") { return $Matches[1] }
  if ($trimmed -match '^(.*?)\s+#.*$') { $trimmed = $Matches[1].Trim() }
  return $trimmed -replace '^"|"\s*$' -replace "^'|'\s*$"
}

function Get-YamlValue {
  param([string]$Path, [string]$KeyPath)
  if (-not (Test-Path -LiteralPath $Path -PathType Leaf)) { return $null }
  $lines = Get-Content -LiteralPath $Path
  $targetKeys = $KeyPath -split "\."
  $state = @()

  foreach ($line in $lines) {
    if ($line -match "^\s*$" -or $line -match "^\s*#") { continue }
    if ($line -match "^(\s*)([^#:]+)\s*:\s*(.*)$") {
      $indent = $Matches[1].Length
      $key = $Matches[2].Trim()
      $val = $Matches[3].Trim()

      while ($state.Length -gt 0 -and $state[-1].Indent -ge $indent) {
        $state = $state[0..($state.Length - 2)]
      }

      $nextTargetIndex = $state.Length
      if ($nextTargetIndex -lt $targetKeys.Length -and $key -eq $targetKeys[$nextTargetIndex]) {
        $state += @{ Key = $key; Indent = $indent; Value = $val }
        if ($state.Length -eq $targetKeys.Length) { return Parse-YamlValue $val }
      }
    }
  }
  return $null
}

$states = @(
  @{ key = "todo"; color = "D876E3"; desc = "JulesOps: Queued and ready for dispatch" }
  @{ key = "in_progress"; color = "FCD34D"; desc = "JulesOps: Work is active/in-progress" }
  @{ key = "review"; color = "3B82F6"; desc = "JulesOps: Pull request opened, awaiting review" }
  @{ key = "blocked"; color = "EF4444"; desc = "JulesOps: Blocked, awaiting maintainer action" }
  @{ key = "failed"; color = "B91C1C"; desc = "JulesOps: Dispatch or execution step failed" }
  @{ key = "done"; color = "10B981"; desc = "JulesOps: Completed and merged successfully" }
)

$labelMap = [ordered]@{}
$queueLabel = Get-YamlValue $configPath "julesops.queue.queue_label"
if ($queueLabel) {
  $labelMap[$queueLabel] = @{ color = "7057FF"; desc = "JulesOps: Issue queue eligibility marker" }
}

foreach ($state in $states) {
  $label = Get-YamlValue $configPath "julesops.states.$($state.key)"
  if ($label) {
    $labelMap[$label] = @{ color = $state.color; desc = $state.desc }
  }
}

function Write-Checklist {
  param([string]$Reason, [string]$RepositoryName)
  Write-Host "--- GitHub Label Creation Checklist ---"
  Write-Host $Reason
  if ($RepositoryName) {
    Write-Host "Repository: $RepositoryName"
  }
  Write-Host ""
  foreach ($label in $labelMap.Keys) {
    Write-Host "- Label Name:  $label"
    Write-Host "  Color:       #$($labelMap[$label].color)"
    Write-Host "  Description: $($labelMap[$label].desc)"
    Write-Host ""
  }
}

$remoteUrl = (git -C $targetRoot remote get-url origin 2>$null)
$repoName = $null
if ($remoteUrl -and ($remoteUrl -match 'github\.com[:/]([^/]+/[^/]+?)(?:\.git)?\s*$')) {
  $repoName = $Matches[1]
}

if ($DryRun) {
  Write-Checklist "Dry run: no labels were created." $repoName
  exit 0
}

$authCheck = $false
try {
  $oldToken = $env:GITHUB_TOKEN
  if ($env:GITHUB_TOKEN -eq "github_pat_antigravitydummytoken") {
    $env:GITHUB_TOKEN = $null
  }
  $authStatus = gh auth status 2>&1
  $authCheck = ($authStatus -match "Logged in to github.com")
  $env:GITHUB_TOKEN = $oldToken
} catch {
  $authCheck = $false
}

if (-not $repoName) {
  Write-Checklist "GitHub remote was not detected. Create these labels manually." $null
  exit 0
}

if (-not $authCheck) {
  Write-Checklist "GitHub CLI is not authenticated. Create these labels manually or run 'gh auth login'." $repoName
  exit 0
}

Write-Host "Checking existing remote GitHub labels for repository '$repoName'..."

$oldToken = $env:GITHUB_TOKEN
if ($env:GITHUB_TOKEN -eq "github_pat_antigravitydummytoken") {
  $env:GITHUB_TOKEN = $null
}
$labelsJson = gh label list --repo $repoName --limit 100 --json name 2>$null
$env:GITHUB_TOKEN = $oldToken

$existingLabels = @()
if ($labelsJson) {
  $existingLabels = ($labelsJson | ConvertFrom-Json).name
}

foreach ($label in $labelMap.Keys) {
  if ($existingLabels -contains $label) {
    Write-Host "  Label '$label' already exists."
    continue
  }

  Write-Host "  Creating label '$label' (Color: #$($labelMap[$label].color), Description: '$($labelMap[$label].desc)')..."
  $oldToken = $env:GITHUB_TOKEN
  if ($env:GITHUB_TOKEN -eq "github_pat_antigravitydummytoken") {
    $env:GITHUB_TOKEN = $null
  }
  gh label create $label --repo $repoName --color $labelMap[$label].color --description $labelMap[$label].desc | Out-Null
  $env:GITHUB_TOKEN = $oldToken
  Write-Host "    Label successfully created."
}

Write-Host "Label bootstrapping completed successfully."