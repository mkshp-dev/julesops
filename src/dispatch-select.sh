#!/usr/bin/env bash
# Pick the next queued Jules issue and build its prompt.
#
# Step outputs: has_active, active_issue, has_todo, issue_number, issue_url, prompt.
set -euo pipefail
# shellcheck source=lib.sh
source "$(dirname "${BASH_SOURCE[0]}")/lib.sh"

output() { echo "$1=$2" >> "$GITHUB_OUTPUT"; }

open_jules_issues="$(gh issue list --repo "$REPO" --state open --label "$JULESOPS_QUEUE_LABEL" \
  --limit 1000 --json number,createdAt,labels)"
statuses_json="$(status_labels | jq -R . | jq -s .)"

# Only one Jules issue is worked at a time. In-progress and review hold the queue: Jules is
# working, or its PR is open and could conflict with the next task. Blocked means Jules has
# stopped and is waiting on a human, so it only holds the queue with blocked_holds_queue: true.
holding="$(jq -n --arg a "$JULESOPS_STATUS_IN_PROGRESS" --arg b "$JULESOPS_STATUS_REVIEW" '[$a, $b]')"
if [ "${JULESOPS_BLOCKED_HOLDS_QUEUE:-false}" = "true" ]; then
  holding="$(echo "$holding" | jq --arg c "$JULESOPS_STATUS_BLOCKED" '. + [$c]')"
fi
active_issue="$(echo "$open_jules_issues" | jq -r --argjson holding "$holding" \
  '[.[] | select(any(.labels[]; .name as $n | $holding | any(. == $n)))] | sort_by(.number) | .[0].number // empty')"
if [ -n "$active_issue" ]; then
  echo "Issue #$active_issue is already active; not dispatching another."
  output has_active true
  output active_issue "$active_issue"
  exit 0
fi
output has_active false

# Queued = the todo label, or the queue label with no status label yet (a freshly labeled issue).
issue_number="$(echo "$open_jules_issues" | jq -r --arg todo "$JULESOPS_STATUS_TODO" --argjson statuses "$statuses_json" \
  '[.[] | select(any(.labels[]; .name == $todo) or all(.labels[]; .name as $n | ($statuses | any(. == $n)) | not))]
   | sort_by(.createdAt) | .[0].number // empty')"
if [ -z "$issue_number" ]; then
  echo "No queued Jules issue found."
  output has_todo false
  exit 0
fi
output has_todo true
output issue_number "$issue_number"
echo "Selected issue #$issue_number."

core_path="$JULESOPS_CORE_INSTRUCTIONS"
if [ ! -f "$core_path" ]; then
  echo "No core instructions at $core_path; using the instructions bundled with JulesOps."
  core_path="$JULESOPS_ACTION_PATH/templates/jules-core.md"
fi
if [ -f "$JULESOPS_REPO_INSTRUCTIONS" ]; then
  repo_instructions="$(cat "$JULESOPS_REPO_INSTRUCTIONS")"
else
  repo_instructions="No repo-specific Jules instructions were provided for this repository."
fi

issue_json="$(gh issue view "$issue_number" --repo "$REPO" --json title,body,url)"
issue_url="$(echo "$issue_json" | jq -r .url)"
output issue_url "$issue_url"

prompt="Work GitHub issue #$issue_number in the repository \`$REPO\`.

The configured base branch for this repository is \`$JULESOPS_BASE_BRANCH\`.

Follow the JulesOps core instructions below exactly.

--- BEGIN JULESOPS CORE INSTRUCTIONS ---
$(cat "$core_path")
--- END JULESOPS CORE INSTRUCTIONS ---

Follow the repository-specific instructions below when they are relevant to the implementation.

--- BEGIN REPO-SPECIFIC JULES INSTRUCTIONS ---
$repo_instructions
--- END REPO-SPECIFIC JULES INSTRUCTIONS ---

Issue title:
$(echo "$issue_json" | jq -r .title)

Issue URL:
$issue_url

Issue body:
$(echo "$issue_json" | jq -r '.body // ""')"

delimiter="JULESOPS_$(openssl rand -hex 16)"
{
  echo "prompt<<$delimiter"
  printf '%s\n' "$prompt"
  echo "$delimiter"
} >> "$GITHUB_OUTPUT"

if [ "$DRY_RUN" = "true" ]; then
  echo "[dry-run] Prompt for issue #$issue_number (${#prompt} characters):"
  printf '%s\n' "$prompt" | head -n 5
fi
