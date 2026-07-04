param(
  [Parameter(Mandatory = $true)]
  [string]$Version,

  [Parameter(Mandatory = $true)]
  [string]$Date,

  [string]$ChangelogSummary,

  [switch]$DryRun
)

$ErrorActionPreference = 'Stop'

$scriptRoot = Split-Path -Parent $MyInvocation.MyCommand.Path
$kitRoot = Split-Path -Parent $scriptRoot
$versionFile = Join-Path $scriptRoot 'kit-version.txt'
$changelogPath = Join-Path $kitRoot 'CHANGELOG.md'

if ($Version -notmatch '^v\d+\.\d+\.\d+$') {
  throw "Version must look like v1.2.3. Received: $Version"
}

if ($Date -notmatch '^\d{4}-\d{2}-\d{2}$') {
  throw "Date must look like YYYY-MM-DD. Received: $Date"
}

foreach ($path in @($versionFile, $changelogPath)) {
  if (-not (Test-Path -LiteralPath $path -PathType Leaf)) {
    throw "Required file not found at: $path"
  }
}

$changelog = Get-Content -LiteralPath $changelogPath -Raw
$versionTag = $Version.TrimStart('v')
$versionLine = "## [$versionTag] - $Date"

if ($changelog -match [regex]::Escape($versionLine)) {
  throw "Changelog already contains an entry for $Version on $Date"
}

if ($ChangelogSummary) {
  $summary = $ChangelogSummary.TrimEnd()
} else {
  $summary = @"
### Added
- Describe the release highlights here.
"@
}

if ($DryRun) {
  Write-Host "[DryRun] Would update $versionFile to $Version"
  Write-Host "[DryRun] Would prepend a new changelog section to $changelogPath"
  Write-Host "[DryRun] Changelog section preview:`n$versionLine`n`n$summary"
  exit 0
}

Set-Content -LiteralPath $versionFile -Value ($Version + "`n")

$prefix = @"
# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).
"@
$existingBody = $changelog
$existingBody = $existingBody -replace '(?s)^# Changelog\r?\n\r?\nAll notable changes to this project will be documented in this file\.\r?\n\r?\nThe format is based on \[Keep a Changelog\]\(https://keepachangelog\.com/en/1\.0\.0/\),\r?\nand this project adheres to \[Semantic Versioning\]\(https://semver\.org/spec/v2\.0\.0\.html\)\.\r?\n\r?\n', ''
$updatedChangelog = "$prefix`r`n`r`n$versionLine`r`n`r`n$summary`r`n`r`n$existingBody"
Set-Content -LiteralPath $changelogPath -Value $updatedChangelog -NoNewline

Write-Host "Updated kit version to $Version and prepended a changelog entry for $Date."