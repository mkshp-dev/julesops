#!/usr/bin/env bash
# Sync a Jules issue's status from an issue_comment event: the blocked marker and
# the /jules retry | /jules requeue maintainer commands.
set -euo pipefail
# shellcheck source=lib.sh
source "$(dirname "${BASH_SOURCE[0]}")/lib.sh"

if [ "$(event .action)" != "created" ]; then
  echo "Ignoring issue_comment action '$(event .action)'."
  exit 0
fi
if [ -n "$(event .issue.pull_request.url)" ]; then
  echo "Ignoring comment on a pull request."
  exit 0
fi

issue_number="$(event .issue.number)"
body="$(event .comment.body)"
commenter="$(event .comment.user.login)"
commenter_type="$(event .comment.user.type)"
association="$(event .comment.author_association)"
labels="$(jq -r '.issue.labels[].name' "$GITHUB_EVENT_PATH")"

if ! printf '%s\n' "$labels" | grep -xF -- "$JULESOPS_QUEUE_LABEL" > /dev/null; then
  echo "Issue #$issue_number is not a Jules issue."
  exit 0
fi

# --- Blocked marker ---
if printf '%s\n' "$labels" | grep -xF -- "$JULESOPS_STATUS_IN_PROGRESS" > /dev/null &&
   [[ "$body" == *"$JULESOPS_BLOCKED_MARKER"* ]]; then
  # Only Jules (a bot account) or a maintainer may move an issue to blocked;
  # otherwise any commenter could stall the queue by posting the marker.
  if [ "$commenter_type" = "Bot" ] || is_maintainer "$association" || echo "$commenter" | any_jules_author; then
    set_status "$issue_number" "$JULESOPS_STATUS_BLOCKED"
    comment_issue "$issue_number" "Jules reported a blocked state. Marking this issue as \`$JULESOPS_STATUS_BLOCKED\` for maintainer review."
  else
    echo "Ignoring blocked marker from @$commenter (association: $association, type: $commenter_type)."
  fi
  exit 0
fi

# --- /jules retry | /jules requeue ---
command="$(printf '%s' "$body" | node "$JULESOPS_ACTION_PATH/templates/comment-command.js" || true)"
if [ -z "$command" ]; then
  echo "Not a JulesOps command."
  exit 0
fi

if ! is_maintainer "$association"; then
  echo "Unauthorized user @$commenter attempted /jules $command."
  comment_issue "$issue_number" "Permission denied: Only repository maintainers can requeue/retry issues."
  exit 0
fi

set_status "$issue_number" "$JULESOPS_STATUS_TODO"
comment_issue "$issue_number" "Issue requeued by @$commenter. Triggering Jules Dispatch..."

# Start dispatch now instead of waiting for the next scheduled run. By default this is
# the calling workflow itself (GITHUB_WORKFLOW_REF = owner/repo/.github/workflows/<file>@<ref>).
workflow="${JULESOPS_DISPATCH_WORKFLOW:-}"
if [ -z "$workflow" ]; then
  workflow="$(basename "${GITHUB_WORKFLOW_REF%%@*}")"
fi
if ! gh_write workflow run "$workflow" --repo "$REPO"; then
  echo "::warning::Could not start workflow '$workflow' (it needs a workflow_dispatch trigger and actions: write). The issue will be dispatched on the next scheduled run."
fi
