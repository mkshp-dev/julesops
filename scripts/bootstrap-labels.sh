#!/usr/bin/env bash
# Create the GitHub labels a JulesOps install needs, based on its .github/julesops.yml.
#
# Usage: scripts/bootstrap-labels.sh [--dry-run] [TARGET_REPO]
set -euo pipefail

# shellcheck source=lib/common.sh
source "$(dirname "${BASH_SOURCE[0]}")/lib/common.sh"

dry_run=false
target_repo="."

while [ $# -gt 0 ]; do
  case "$1" in
    --dry-run) dry_run=true; shift ;;
    -h | --help) echo "Usage: bootstrap-labels.sh [--dry-run] [TARGET_REPO]"; exit 0 ;;
    -*) die "Unknown option: $1" ;;
    *) target_repo="$1"; shift ;;
  esac
done

target_root="$(abs_path "$target_repo")"
config_path="$target_root/$JULESOPS_CONFIG_FILE"
[ -f "$config_path" ] || die "Config file not found at: $config_path. Please run the installer first."

dump="$(config_dump "$config_path")" || die "Unable to parse $config_path"
trap 'rm -f "$dump"' EXIT

# name|color|description, one label per line.
labels=""
add_label() {
  [ -n "$1" ] || return 0
  labels="${labels}$1|$2|$3"$'\n'
}

add_label "$(config_get "$dump" julesops.queue.queue_label)" 7057FF "JulesOps: Issue queue eligibility marker"
add_label "$(config_get "$dump" julesops.states.todo)" D876E3 "JulesOps: Queued and ready for dispatch"
add_label "$(config_get "$dump" julesops.states.in_progress)" FCD34D "JulesOps: Work is active/in-progress"
add_label "$(config_get "$dump" julesops.states.review)" 3B82F6 "JulesOps: Pull request opened, awaiting review"
add_label "$(config_get "$dump" julesops.states.blocked)" EF4444 "JulesOps: Blocked, awaiting maintainer action"
add_label "$(config_get "$dump" julesops.states.failed)" B91C1C "JulesOps: Dispatch or execution step failed"
add_label "$(config_get "$dump" julesops.states.done)" 10B981 "JulesOps: Completed and merged successfully"

print_checklist() {
  echo "--- GitHub Label Creation Checklist ---"
  echo "$1"
  if [ -n "${2:-}" ]; then echo "Repository: $2"; fi
  echo
  printf '%s' "$labels" | while IFS='|' read -r name color description; do
    echo "- Label Name:  $name"
    echo "  Color:       #$color"
    echo "  Description: $description"
    echo
  done
}

repo_name="$(github_repo_name "$target_root")"

if $dry_run; then
  print_checklist "Dry run: no labels were created." "$repo_name"
  exit 0
fi

if [ -z "$repo_name" ]; then
  print_checklist "GitHub remote was not detected. Create these labels manually."
  exit 0
fi

if ! gh_authenticated; then
  print_checklist "GitHub CLI is not authenticated. Create these labels manually or run 'gh auth login'." "$repo_name"
  exit 0
fi

echo "Checking existing remote GitHub labels for repository '$repo_name'..."
existing="$(gh label list --repo "$repo_name" --limit 1000 --json name --jq '.[].name')"

printf '%s' "$labels" | while IFS='|' read -r name color description; do
  if printf '%s\n' "$existing" | grep -xF -- "$name" > /dev/null; then
    echo "  Label '$name' already exists."
    continue
  fi
  echo "  Creating label '$name' (Color: #$color, Description: '$description')..."
  gh label create "$name" --repo "$repo_name" --color "$color" --description "$description" > /dev/null
  echo "    Label successfully created."
done

echo "Label bootstrapping completed successfully."
