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

function Assert-NotContains {
  param([string]$Path, [string]$Pattern, [string]$Message)
  $content = Get-Content -LiteralPath $Path -Raw
  if ($content -match $Pattern) {
    throw $Message
  }
}

function Parse-YamlValue {
  param([string]$RawVal)
  if ($null -eq $RawVal) { return $null }
  $trimmed = $RawVal.Trim()
  
  # 1. Match quoted values with optional trailing comments
  if ($trimmed -match '^"(.*)"\s*(#.*)?$') {
    return $Matches[1]
  }
  if ($trimmed -match "^'(.*)'\s*(#.*)?$") {
    return $Matches[1]
  }
  
  # 2. Otherwise, if it's unquoted, strip trailing comment
  if ($trimmed -match '^(.*?)\s+#.*$') {
    $trimmed = $Matches[1].Trim()
  }
  
  # Strip matching outer quotes if they exist without comments
  $trimmed = $trimmed -replace '^"|"\s*$' -replace "^'|'\s*$"
  
  return $trimmed
}

function Get-YamlValue {
  param(
    [string]$Path,
    [string]$KeyPath
  )
  if (-not (Test-Path -LiteralPath $Path -PathType Leaf)) {
    return $null
  }
  $lines = Get-Content -LiteralPath $Path
  $targetKeys = $KeyPath -split "\."
  $state = @()
  
  foreach ($line in $lines) {
    if ($line -match "^\s*$" -or $line -match "^\s*#") { continue }
    
    if ($line -match "^(\s*)([^#:]+)\s*:\s*(.*)$") {
      $indent = $Matches[1].Length
      $key = $Matches[2].Trim()
      $val = $Matches[3].Trim()
      
      # Pop states that have indentation >= current line's indentation
      while ($state.Length -gt 0 -and $state[-1].Indent -ge $indent) {
        $state = $state[0..($state.Length - 2)]
      }
      
      $nextTargetIndex = $state.Length
      if ($nextTargetIndex -lt $targetKeys.Length -and $key -eq $targetKeys[$nextTargetIndex]) {
        $state += @{ Key = $key; Indent = $indent; Value = $val }
        
        if ($state.Length -eq $targetKeys.Length) {
          return Parse-YamlValue $val
        }
      }
    }
  }
  return $null
}

function Validate-JulesOpsConfig {
  param(
    [string]$ConfigPath,
    [string]$RepoRoot
  )
  Assert-File $ConfigPath "Config file not found at: $ConfigPath"
  
  # 1. Enabled
  $enabled = Get-YamlValue $ConfigPath "julesops.enabled"
  if ($null -eq $enabled -or ($enabled -ne "true" -and $enabled -ne "false")) {
    throw "Invalid or missing 'julesops.enabled' in config: '$enabled'. Must be true or false."
  }
  
  # 2. repository.base_branch
  $baseBranch = Get-YamlValue $ConfigPath "julesops.repository.base_branch"
  if (-not $baseBranch) {
    throw "Missing or empty 'julesops.repository.base_branch' in config."
  }
  
  # 3. queue.queue_label
  $queueLabel = Get-YamlValue $ConfigPath "julesops.queue.queue_label"
  if (-not $queueLabel) {
    throw "Missing or empty 'julesops.queue.queue_label' in config."
  }
  
  # 4. queue.max_active_jobs
  $maxJobs = Get-YamlValue $ConfigPath "julesops.queue.max_active_jobs"
  if ($null -eq $maxJobs -or $maxJobs -notmatch '^\d+$' -or [int]$maxJobs -lt 1) {
    throw "Invalid 'julesops.queue.max_active_jobs' in config: '$maxJobs'. Must be a positive integer."
  }
  
  # 5. states
  $states = @("todo", "in_progress", "review", "blocked", "failed", "done")
  foreach ($state in $states) {
    $lbl = Get-YamlValue $ConfigPath "julesops.states.$state"
    if (-not $lbl) {
      throw "Missing or empty 'julesops.states.$state' label in config."
    }
  }
  
  # 6. instructions
  $coreInst = Get-YamlValue $ConfigPath "julesops.instructions.core"
  $repoInst = Get-YamlValue $ConfigPath "julesops.instructions.repo"
  if (-not $coreInst) {
    throw "Missing 'julesops.instructions.core' in config."
  }
  if (-not $repoInst) {
    throw "Missing 'julesops.instructions.repo' in config."
  }
  
  # 7. blocked_comment.marker
  $marker = Get-YamlValue $ConfigPath "julesops.blocked_comment.marker"
  if (-not $marker) {
    throw "Missing 'julesops.blocked_comment.marker' in config."
  }
  
  # 8. issue_completion.close_on_merge
  $closeOnMerge = Get-YamlValue $ConfigPath "julesops.issue_completion.close_on_merge"
  if ($null -eq $closeOnMerge -or ($closeOnMerge -ne "true" -and $closeOnMerge -ne "false")) {
    throw "Invalid or missing 'julesops.issue_completion.close_on_merge' in config: '$closeOnMerge'. Must be true or false."
  }
  
  # 9. watchdog thresholds
  $staleInProgress = Get-YamlValue $ConfigPath "julesops.watchdog.stale_in_progress_hours"
  $staleReview = Get-YamlValue $ConfigPath "julesops.watchdog.stale_review_hours"
  if ($null -eq $staleInProgress -or $staleInProgress -notmatch '^\d+$' -or [int]$staleInProgress -lt 1) {
    throw "Invalid 'julesops.watchdog.stale_in_progress_hours' in config: '$staleInProgress'. Must be a positive integer."
  }
  if ($null -eq $staleReview -or $staleReview -notmatch '^\d+$' -or [int]$staleReview -lt 1) {
    throw "Invalid 'julesops.watchdog.stale_review_hours' in config: '$staleReview'. Must be a positive integer."
  }

  # 10. pull_request policy
  $targetBaseBranchOnly = Get-YamlValue $ConfigPath "julesops.pull_request.target_base_branch_only"
  if ($null -ne $targetBaseBranchOnly -and $targetBaseBranchOnly -ne "true" -and $targetBaseBranchOnly -ne "false") {
    throw "Invalid 'julesops.pull_request.target_base_branch_only' in config: '$targetBaseBranchOnly'. Must be true or false."
  }
  $requireIssueLink = Get-YamlValue $ConfigPath "julesops.pull_request.require_issue_link"
  if ($null -ne $requireIssueLink -and $requireIssueLink -ne "true" -and $requireIssueLink -ne "false") {
    throw "Invalid 'julesops.pull_request.require_issue_link' in config: '$requireIssueLink'. Must be true or false."
  }
  
  # Environment validation checks if targeting a repo
  if ($RepoRoot) {
    # Verify instruction files exist
    $corePath = Join-Path $RepoRoot $coreInst
    $repoPath = Join-Path $RepoRoot $repoInst
    Assert-File $corePath "Instructions core file not found at: $corePath"
    Assert-File $repoPath "Instructions repo file not found at: $repoPath"
    
    # Check configured base branch in local/remote tracking
    Write-Host "Verifying base branch '$baseBranch' in Git..."
    $branches = (git -C $RepoRoot branch -a 2>$null)
    if ($branches) {
      $branchMatch = $branches -match "\b$baseBranch\b"
      if (-not $branchMatch) {
        throw "Configured base branch '$baseBranch' does not exist in target repository branches."
      }
      Write-Host "  Base branch '$baseBranch' verified."
    } else {
      Write-Host "  [WARNING] Unable to check Git branches. Ensure the directory is a Git repository."
    }
    
    # Check GitHub labels if gh CLI is available & authenticated
    $remoteUrl = $null
    try {
      $oldEAP = $ErrorActionPreference
      $ErrorActionPreference = 'Continue'
      $remoteUrl = git -C $RepoRoot remote get-url origin 2>$null
    } catch {} finally {
      $ErrorActionPreference = $oldEAP
    }
    if ($remoteUrl -and ($remoteUrl -match 'github\.com[:/]([^/]+/[^/]+?)(?:\.git)?\s*$')) {
      $repoName = $Matches[1]
      $authCheck = $false
      try {
        # Check if GITHUB_TOKEN environment is the dummy one, temporarily clear it for auth check
        $oldToken = $env:GITHUB_TOKEN
        if ($env:GITHUB_TOKEN -eq "github_pat_antigravitydummytoken") {
          $env:GITHUB_TOKEN = $null
        }
        $authStatus = gh auth status 2>&1
        $authCheck = ($authStatus -match "Logged in to github.com")
        $env:GITHUB_TOKEN = $oldToken
      } catch {
        # Ignore errors
      }
      
      if ($authCheck) {
        Write-Host "Verifying configuration state labels on GitHub for '$repoName'..."
        $oldToken = $env:GITHUB_TOKEN
        if ($env:GITHUB_TOKEN -eq "github_pat_antigravitydummytoken") {
          $env:GITHUB_TOKEN = $null
        }
        $labelsJson = gh label list --repo $repoName --limit 100 --json name 2>$null
        $env:GITHUB_TOKEN = $oldToken
        
        if ($labelsJson) {
          $existingLabels = ($labelsJson | ConvertFrom-Json).name
          foreach ($state in $states) {
            $lbl = Get-YamlValue $ConfigPath "julesops.states.$state"
            if ($existingLabels -notcontains $lbl) {
              throw "Configured label '$lbl' (for state '$state') does not exist in remote GitHub repository '$repoName'."
            }
          }
          Write-Host "  All configured labels verified on GitHub."
        } else {
          Write-Host "  [WARNING] Unable to retrieve remote labels for verification."
        }

        # Check JULES_API_KEY secret exists
        Write-Host "Verifying JULES_API_KEY secret on GitHub for '$repoName'..."
        $oldToken2 = $env:GITHUB_TOKEN
        if ($env:GITHUB_TOKEN -eq "github_pat_antigravitydummytoken") {
          $env:GITHUB_TOKEN = $null
        }
        $secretsJson = gh secret list --repo $repoName --json name 2>$null
        $env:GITHUB_TOKEN = $oldToken2

        if ($secretsJson) {
          $existingSecrets = ($secretsJson | ConvertFrom-Json).name
          if ($existingSecrets -contains "JULES_API_KEY") {
            Write-Host "  JULES_API_KEY secret is configured."
          } else {
            Write-Host "  [WARNING] JULES_API_KEY secret is NOT set. Dispatch will fail without it."
            Write-Host "  Set it at:    https://github.com/$repoName/settings/secrets/actions"
            Write-Host "  Get your key: https://jules.google.com/settings/api"
          }
        } else {
          Write-Host "  [WARNING] Unable to retrieve repository secrets (may require admin access)."
        }
      } else {
        Write-Host "  [WARNING] Not authenticated with gh CLI. Skipping remote label checks."
      }
    } else {
      Write-Host "  [WARNING] GitHub remote not detected. Skipping remote label checks."
    }
  }
}

$kitFiles = @(
  "templates/jules-core.md",
  "templates/jules-task.yml",
  "templates/julesops.yml",
  "templates/resolve-config.py",
  "workflows/jules-dispatch.yml",
  "workflows/jules-state-sync.yml",
  "workflows/jules-watchdog.yml",
  "examples/aggregator/julesops.yml",
  "examples/aggregator/jules-repo.md",
  "scripts/bootstrap-labels.ps1",
  "scripts/test-fixture.ps1",
  "examples/fixture-basic/README.md",
  "examples/fixture-basic/repo/README.md",
  "examples/fixture-basic/repo/src/app.txt"
)

foreach ($file in $kitFiles) {
  Assert-File (Join-Path $kitRoot $file) "Missing required kit file: $file"
}

# Validate the template julesops.yml
Validate-JulesOpsConfig (Join-Path $kitRoot "templates/julesops.yml") $null

Assert-Contains (Join-Path $kitRoot "workflows/jules-dispatch.yml") "jules_api_key:\s*\$\{\{\s*secrets\.JULES_API_KEY\s*\}\}" "Dispatch workflow must pass the JULES_API_KEY secret to Jules."
Assert-Contains (Join-Path $kitRoot "workflows/jules-watchdog.yml") "JulesOps Watchdog" "Watchdog workflow must include the watchdog comment marker."
Assert-NotContains (Join-Path $kitRoot "templates/resolve-config.py") "import\s+yaml|from\s+yaml\s+import" "Resolver must not depend on PyYAML or undeclared YAML packages."

if ($TargetRepo) {
  $targetRoot = (Resolve-Path -LiteralPath $TargetRepo).Path
  $installedFiles = @(
    ".github/jules-core.md",
    ".github/jules-repo.md",
    ".github/julesops.yml",
    ".github/resolve-config.py",
    ".github/ISSUE_TEMPLATE/jules-task.yml",
    ".github/workflows/jules-dispatch.yml",
    ".github/workflows/jules-state-sync.yml",
    ".github/workflows/jules-watchdog.yml"
  )

  foreach ($file in $installedFiles) {
    Assert-File (Join-Path $targetRoot $file) "Missing installed JulesOps file in target repo: $file"
  }

  Validate-JulesOpsConfig (Join-Path $targetRoot ".github/julesops.yml") $targetRoot

  # Verify version markers exist in all fully kit-managed installed files
  $versionCheckedFiles = @(
    ".github/jules-core.md",
    ".github/julesops.yml",
    ".github/resolve-config.py",
    ".github/ISSUE_TEMPLATE/jules-task.yml",
    ".github/workflows/jules-dispatch.yml",
    ".github/workflows/jules-state-sync.yml",
    ".github/workflows/jules-watchdog.yml"
  )

  foreach ($file in $versionCheckedFiles) {
    Assert-Contains (Join-Path $targetRoot $file) "JulesOps kit version" "Installed file '$file' is missing the JulesOps version marker comment."
  }
}

Write-Host "JulesOps kit validation passed."