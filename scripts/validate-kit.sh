#!/usr/bin/env bash
# Validate the JulesOps kit source and, optionally, an installed target repository.
#
# Usage: scripts/validate-kit.sh [TARGET_REPO]
set -euo pipefail

# shellcheck source=lib/common.sh
source "$(dirname "${BASH_SOURCE[0]}")/lib/common.sh"

case "${1:-}" in
  -h | --help) echo "Usage: validate-kit.sh [TARGET_REPO]"; exit 0 ;;
esac
target_repo="${1:-}"

assert_file() {
  [ -f "$1" ] || die "$2"
}

is_bool() { [ "$1" = "true" ] || [ "$1" = "false" ]; }
is_positive_int() { printf '%s' "$1" | grep -E '^[0-9]+$' > /dev/null && [ "$1" -ge 1 ]; }

# Validate a julesops.yml. With a repo root, also check files, branch, labels, and secret.
validate_config() {
  local config_path="$1" repo_root="${2:-}" dump value
  assert_file "$config_path" "Config file not found at: $config_path"
  dump="$(config_dump "$config_path")" || die "Unable to parse $config_path"

  get() { config_get "$dump" "$1"; }

  value="$(get julesops.enabled)"
  is_bool "$value" || die "Invalid or missing 'julesops.enabled' in config: '$value'. Must be true or false."

  local base_branch
  base_branch="$(get julesops.repository.base_branch)"
  [ -n "$base_branch" ] || die "Missing or empty 'julesops.repository.base_branch' in config."
  [ -n "$(get julesops.queue.queue_label)" ] || die "Missing or empty 'julesops.queue.queue_label' in config."

  value="$(get julesops.queue.max_active_jobs)"
  is_positive_int "$value" || die "Invalid 'julesops.queue.max_active_jobs' in config: '$value'. Must be a positive integer."

  local state
  for state in todo in_progress review blocked failed "done"; do
    [ -n "$(get "julesops.states.$state")" ] || die "Missing or empty 'julesops.states.$state' label in config."
  done

  local core_instructions repo_instructions
  core_instructions="$(get julesops.instructions.core)"
  repo_instructions="$(get julesops.instructions.repo)"
  [ -n "$core_instructions" ] || die "Missing 'julesops.instructions.core' in config."
  [ -n "$repo_instructions" ] || die "Missing 'julesops.instructions.repo' in config."
  [ -n "$(get julesops.blocked_comment.marker)" ] || die "Missing 'julesops.blocked_comment.marker' in config."

  value="$(get julesops.issue_completion.close_on_merge)"
  is_bool "$value" || die "Invalid or missing 'julesops.issue_completion.close_on_merge' in config: '$value'. Must be true or false."

  local key
  for key in stale_in_progress_hours stale_review_hours; do
    value="$(get "julesops.watchdog.$key")"
    is_positive_int "$value" || die "Invalid 'julesops.watchdog.$key' in config: '$value'. Must be a positive integer."
  done

  for key in target_base_branch_only require_issue_link; do
    value="$(get "julesops.pull_request.$key")"
    [ -z "$value" ] || is_bool "$value" || die "Invalid 'julesops.pull_request.$key' in config: '$value'. Must be true or false."
  done

  if [ -n "$repo_root" ]; then
    assert_file "$repo_root/$core_instructions" "Instructions core file not found at: $repo_root/$core_instructions"
    assert_file "$repo_root/$repo_instructions" "Instructions repo file not found at: $repo_root/$repo_instructions"

    echo "Verifying base branch '$base_branch' in Git..."
    if git -C "$repo_root" rev-parse --git-dir > /dev/null 2>&1; then
      if git -C "$repo_root" show-ref --verify --quiet "refs/heads/$base_branch" ||
         [ -n "$(git -C "$repo_root" for-each-ref --format='%(refname)' "refs/remotes/*/$base_branch")" ]; then
        echo "  Base branch '$base_branch' verified."
      else
        die "Configured base branch '$base_branch' does not exist in target repository branches."
      fi
    else
      echo "  [WARNING] Unable to check Git branches. Ensure the directory is a Git repository."
    fi

    local repo_name
    repo_name="$(github_repo_name "$repo_root")"
    if [ -z "$repo_name" ]; then
      echo "  [WARNING] GitHub remote not detected. Skipping remote label checks."
    elif ! gh_authenticated; then
      echo "  [WARNING] Not authenticated with gh CLI. Skipping remote label checks."
    else
      echo "Verifying configuration state labels on GitHub for '$repo_name'..."
      local labels label
      if labels="$(gh label list --repo "$repo_name" --limit 1000 --json name --jq '.[].name' 2>/dev/null)"; then
        for state in todo in_progress review blocked failed "done"; do
          label="$(get "julesops.states.$state")"
          printf '%s\n' "$labels" | grep -xF -- "$label" > /dev/null ||
            die "Configured label '$label' (for state '$state') does not exist in remote GitHub repository '$repo_name'."
        done
        echo "  All configured labels verified on GitHub."
      else
        echo "  [WARNING] Unable to retrieve remote labels for verification."
      fi

      echo "Verifying JULES_API_KEY secret on GitHub for '$repo_name'..."
      local secrets
      if secrets="$(gh secret list --repo "$repo_name" --json name --jq '.[].name' 2>/dev/null)"; then
        if printf '%s\n' "$secrets" | grep -x JULES_API_KEY > /dev/null; then
          echo "  JULES_API_KEY secret is configured."
        else
          echo "  [WARNING] JULES_API_KEY secret is NOT set. Dispatch will fail without it."
          echo "  Set it at:    https://github.com/$repo_name/settings/secrets/actions"
          echo "  Get your key: https://jules.google.com/settings/api"
        fi
      else
        echo "  [WARNING] Unable to retrieve repository secrets (may require admin access)."
      fi
    fi
  fi

  rm -f "$dump"
}

# --- Kit source ---
kit_files=(
  action.yml
  src/lib.sh
  src/ensure-labels.sh
  src/dispatch-select.sh
  src/sync-pr.sh
  src/sync-comment.sh
  src/watchdog.py
  templates/resolve-config.py
  templates/comment-command.js
  scripts/bootstrap-labels.sh
  scripts/test-fixture.sh
  examples/aggregator/julesops.yml
  examples/aggregator/jules-repo.md
  examples/fixture-basic/README.md
  examples/fixture-basic/repo/README.md
  examples/fixture-basic/repo/src/app.txt
)
for entry in "${JULESOPS_MANAGED_FILES[@]}"; do
  kit_files+=("$(managed_source "$entry")")
done
for file in "${kit_files[@]}"; do
  assert_file "$JULESOPS_KIT_ROOT/$file" "Missing required kit file: $file"
done

validate_config "$JULESOPS_KIT_ROOT/templates/julesops.yml"

grep -qE 'jules-api-key:[[:space:]]*\$\{\{[[:space:]]*secrets\.JULES_API_KEY[[:space:]]*\}\}' "$JULESOPS_KIT_ROOT/workflows/jules-dispatch.yml" ||
  die "Dispatch workflow must pass the JULES_API_KEY secret to the action."
grep -q "JulesOps Watchdog" "$JULESOPS_KIT_ROOT/src/watchdog.py" ||
  die "Watchdog must include the watchdog comment marker."
if grep -qE 'import[[:space:]]+yaml|from[[:space:]]+yaml[[:space:]]+import' "$JULESOPS_KIT_ROOT/templates/resolve-config.py"; then
  die "Resolver must not depend on PyYAML or undeclared YAML packages."
fi

# Kit workflows are thin wrappers: each must call the action pinned to this kit version.
assert_action_ref() {
  local workflow="$1" refs
  refs="$(grep -oE 'uses:[[:space:]]*mkshp-dev/julesops@[^[:space:]]+' "$workflow" | sed -E 's/uses:[[:space:]]*//' | sort -u)"
  [ "$refs" = "$JULESOPS_ACTION_REF" ] ||
    die "$workflow must use $JULESOPS_ACTION_REF (found: ${refs:-none}). Re-run the installer with --upgrade, or bump the kit version with release-kit.sh."
}
for workflow in "$JULESOPS_KIT_ROOT"/workflows/*.yml "$JULESOPS_KIT_ROOT"/examples/julesops-workflow.yml; do
  assert_action_ref "$workflow"
done

# --- Installed target repository ---
if [ -n "$target_repo" ]; then
  [ -d "$target_repo" ] || die "Target repository does not exist: $target_repo"
  target_root="$(abs_path "$target_repo")"

  for entry in "${JULESOPS_MANAGED_FILES[@]}"; do
    file="$(managed_target "$entry")"
    assert_file "$target_root/$file" "Missing installed JulesOps file in target repo: $file"
    grep -q "JulesOps kit version" "$target_root/$file" ||
      die "Installed file '$file' is missing the JulesOps version marker comment."
  done
  assert_file "$target_root/$JULESOPS_REPO_INSTRUCTIONS" "Missing installed JulesOps file in target repo: $JULESOPS_REPO_INSTRUCTIONS"

  for entry in "${JULESOPS_MANAGED_FILES[@]}"; do
    file="$(managed_target "$entry")"
    case "$file" in
      .github/workflows/*) assert_action_ref "$target_root/$file" ;;
    esac
  done

  validate_config "$target_root/$JULESOPS_CONFIG_FILE" "$target_root"
fi

echo "JulesOps kit validation passed."
