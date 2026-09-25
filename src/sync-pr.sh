#!/usr/bin/env bash
# Sync a Jules issue's status from a pull_request event (opened, reopened, closed).
set -euo pipefail
# shellcheck source=lib.sh
source "$(dirname "${BASH_SOURCE[0]}")/lib.sh"

action="$(event .action)"
case "$action" in
  opened | reopened | closed) ;;
  *) echo "Ignoring pull_request action '$action'."; exit 0 ;;
esac

pr_number="$(event .pull_request.number)"
pr_body="$(event .pull_request.body)"
pr_author="$(event .pull_request.user.login)"
pr_base="$(event .pull_request.base.ref)"
merged="$(event .pull_request.merged)"

# First GitHub closing keyword in the body links the PR to its issue.
issue_number="$(printf '%s\n' "$pr_body" |
  grep -Eio '\b(close[sd]?|fix(e[sd])?|resolve[sd]?) #[0-9]+' | head -n1 | grep -Eo '[0-9]+' || true)"

is_jules_issue=false
if [ -n "$issue_number" ] && issue_has_label "$issue_number" "$JULESOPS_QUEUE_LABEL" 2>/dev/null; then
  is_jules_issue=true
fi
echo "PR #$pr_number: linked issue '${issue_number:-none}', Jules issue: $is_jules_issue"

if [ "$action" = "opened" ] || [ "$action" = "reopened" ]; then
  # Jules opens PRs under the account of the user who started the task, so the PR author
  # is a human. Its commits are authored by the Jules bot, and the body links the task.
  is_jules_pr=false
  if { echo "$pr_author"; gh api "repos/$REPO/pulls/$pr_number/commits" --paginate --jq '.[].author.login // empty' || true; } | any_jules_author; then
    is_jules_pr=true
  elif printf '%s' "$pr_body" | grep 'jules\.google\.com/task/' > /dev/null; then
    is_jules_pr=true
  fi

  if [ "$JULESOPS_REQUIRE_ISSUE_LINK" = "true" ] && [ "$is_jules_pr" = "true" ] && [ "$is_jules_issue" != "true" ]; then
    echo "Jules PR #$pr_number does not reference a tracked Jules issue."
    comment_pr "$pr_number" "⚠️ **JulesOps Validation Warning**: This pull request must link to a tracked Jules task issue (e.g. \`Closes #123\` or \`Fixes #123\`). Please update the pull request description with a valid issue link."
    exit 0
  fi

  [ "$is_jules_issue" = "true" ] || exit 0

  if [ "$JULESOPS_TARGET_BASE_BRANCH_ONLY" = "true" ] && [ "$pr_base" != "$JULESOPS_BASE_BRANCH" ]; then
    echo "PR #$pr_number targets '$pr_base', expected '$JULESOPS_BASE_BRANCH'."
    comment_pr "$pr_number" "⚠️ **JulesOps Validation Warning**: This pull request targets branch \`$pr_base\`, but the repository's configured base branch is \`$JULESOPS_BASE_BRANCH\`. Please retarget this PR to \`$JULESOPS_BASE_BRANCH\` to proceed."
    comment_issue "$issue_number" "⚠️ **JulesOps Validation Warning**: Linked PR #$pr_number targets \`$pr_base\`, which differs from the configured base branch \`$JULESOPS_BASE_BRANCH\`. Moving this issue to blocked status."
    set_status "$issue_number" "$JULESOPS_STATUS_BLOCKED"
    exit 0
  fi

  set_status "$issue_number" "$JULESOPS_STATUS_REVIEW"
  exit 0
fi

# closed
[ "$is_jules_issue" = "true" ] || exit 0

if [ "$merged" = "true" ]; then
  set_status "$issue_number" "$JULESOPS_STATUS_DONE"
  comment_issue "$issue_number" "The linked Jules PR was merged. Transitioning status to \`$JULESOPS_STATUS_DONE\`."
  if [ "$JULESOPS_CLOSE_ON_MERGE" = "true" ]; then
    gh_write issue close "$issue_number" --repo "$REPO" --comment "Closing automatically because the linked Jules PR was merged."
  fi
else
  set_status "$issue_number" "$JULESOPS_STATUS_BLOCKED"
  comment_issue "$issue_number" "The linked Jules PR was closed without merge. Marking this issue as \`$JULESOPS_STATUS_BLOCKED\` for maintainer review."
fi
