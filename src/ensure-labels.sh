#!/usr/bin/env bash
# Create any JulesOps labels the repository does not have yet. Existing labels are left untouched.
set -euo pipefail
# shellcheck source=lib.sh
source "$(dirname "${BASH_SOURCE[0]}")/lib.sh"

existing="$(gh label list --repo "$REPO" --limit 1000 --json name --jq '.[].name')"

while IFS='|' read -r name color description; do
  if printf '%s\n' "$existing" | grep -xF -- "$name" > /dev/null; then
    continue
  fi
  echo "Creating missing label '$name'."
  gh_write label create "$name" --repo "$REPO" --color "$color" --description "$description" > /dev/null
done <<EOF
$JULESOPS_QUEUE_LABEL|7057FF|JulesOps: Issue queue eligibility marker
$JULESOPS_STATUS_TODO|D876E3|JulesOps: Queued and ready for dispatch
$JULESOPS_STATUS_IN_PROGRESS|FCD34D|JulesOps: Work is active/in-progress
$JULESOPS_STATUS_REVIEW|3B82F6|JulesOps: Pull request opened, awaiting review
$JULESOPS_STATUS_BLOCKED|EF4444|JulesOps: Blocked, awaiting maintainer action
$JULESOPS_STATUS_FAILED|B91C1C|JulesOps: Dispatch or execution step failed
$JULESOPS_STATUS_DONE|10B981|JulesOps: Completed and merged successfully
EOF
