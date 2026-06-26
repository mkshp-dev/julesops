param(
  [Parameter(Mandatory = $true)]
  [string]$TargetRepo
)

$ErrorActionPreference = "Stop"

$scriptRoot = Split-Path -Parent $MyInvocation.MyCommand.Path
$kitRoot = Split-Path -Parent $scriptRoot
$targetRoot = [System.IO.Path]::GetFullPath($TargetRepo)
$configPath = Join-Path $targetRoot ".github/julesops.yml"

if (-not (Test-Path -LiteralPath $configPath -PathType Leaf)) {
  throw "Config file not found at: $configPath. Please run the installer first."
}

# Embedded parser helpers
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

# Define state label definitions
$states = @(
  @{ key = "todo"; color = "D876E3"; desc = "JulesOps: Queued and ready for dispatch" }
  @{ key = "in_progress"; color = "FCD34D"; desc = "JulesOps: Work is active/in-progress" }
  @{ key = "review"; color = "3B82F6"; desc = "JulesOps: Pull request opened, awaiting review" }
  @{ key = "blocked"; color = "EF4444"; desc = "JulesOps: Blocked, awaiting maintainer action" }
  @{ key = "failed"; color = "B91C1C"; desc = "JulesOps: Dispatch or execution step failed" }
  @{ key = "done"; color = "10B981"; desc = "JulesOps: Completed and merged successfully" }
)

$labelMap = @{}
foreach ($s in $states) {
  $lbl = Get-YamlValue $configPath "julesops.states.$($s.key)"
  if ($lbl) {
    $labelMap[$lbl] = @{ color = $s.color; desc = $s.desc }
  }
}

$queueLabel = Get-YamlValue $configPath "julesops.queue.queue_label"
if ($queueLabel) {
  $labelMap[$queueLabel] = @{ color = "7057FF"; desc = "JulesOps: Issue queue eligibility marker" }
}

# Determine GitHub repository details
$remoteUrl = (git -C $targetRoot remote get-url origin 2>$null)
$repoName = $null
if ($remoteUrl -and ($remoteUrl -match 'github\.com[:/]([^/]+/[^/]+?)(?:\.git)?\s*$')) {
  $repoName = $Matches[1]
}

# Check gh CLI authentication status
$authCheck = $false
try {
  $oldToken = $env:GITHUB_TOKEN
  if ($env:GITHUB_TOKEN -eq "github_pat_antigravitydummytoken") {
    $env:GITHUB_TOKEN = $null
  }
  $authStatus = gh auth status 2>&1
  $authCheck = ($authStatus -match "Logged in to github.com")
  $env:GITHUB_TOKEN = $oldToken
} catch {}

if ($repoName -and $authCheck) {
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
  
  foreach ($lbl in $labelMap.Keys) {
    if ($existingLabels -contains $lbl) {
      Write-Host "  Label '$lbl' already exists."
    } else {
      Write-Host "  Creating label '$lbl' (Color: #$($labelMap[$lbl].color), Description: '$($labelMap[$lbl].desc)')..."
      
      $oldToken = $env:GITHUB_TOKEN
      if ($env:GITHUB_TOKEN -eq "github_pat_antigravitydummytoken") {
        $env:GITHUB_TOKEN = $null
      }
      gh label create $lbl --repo $repoName --color $labelMap[$lbl].color --description $labelMap[$lbl].desc | Out-Null
      $env:GITHUB_TOKEN = $oldToken
      
      Write-Host "    Label successfully created."
    }
  }
  Write-Host "Label bootstrapping completed successfully."
} else {
  Write-Host "--- GitHub Label Creation Checklist ---"
  Write-Host "Could not query GitHub automatically. Please create these labels manually in repo '$repoName':"
  Write-Host ""
  foreach ($lbl in $labelMap.Keys) {
    Write-Host "- Label Name:  $lbl"
    Write-Host "  Color:       #$($labelMap[$lbl].color)"
    Write-Host "  Description: $($labelMap[$lbl].desc)"
    Write-Host ""
  }
}
