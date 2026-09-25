# shellcheck shell=bash
# Shared helpers for the JulesOps action scripts. Source this file; do not execute it.
#
# Expects the JULESOPS_* variables exported by resolve-config.py (JULESOPS_EXPORT_ENV=true),
# GITHUB_REPOSITORY, and GH_TOKEN. With JULESOPS_DRY_RUN=true, every write is logged
# instead of sent to GitHub.

set -euo pipefail

: "${GITHUB_REPOSITORY:?GITHUB_REPOSITORY must be set}"
REPO="$GITHUB_REPOSITORY"
DRY_RUN="${JULESOPS_DRY_RUN:-false}"

# The six status labels, one per line.
status_labels() {
  printf '%s\n' "$JULESOPS_STATUS_TODO" "$JULESOPS_STATUS_IN_PROGRESS" "$JULESOPS_STATUS_REVIEW" \
    "$JULESOPS_STATUS_BLOCKED" "$JULESOPS_STATUS_FAILED" "$JULESOPS_STATUS_DONE"
}

# Run a gh command that changes GitHub state, or log it in dry-run mode.
gh_write() {
  if [ "$DRY_RUN" = "true" ]; then
    echo "[dry-run] gh $*"
  else
    gh "$@"
  fi
}

# Print the label names on an issue, one per line.
issue_labels() {
  gh api "repos/$REPO/issues/$1/labels" --paginate --jq '.[].name'
}

# Succeed if the issue has the given label.
issue_has_label() {
  issue_labels "$1" | grep -xF -- "$2" > /dev/null
}

# Move an issue to one status: drop every other status label and add TARGET,
# keeping all non-status labels. One API call, so the change is never half-applied.
set_status() {
  local issue="$1" target="$2" current keep
  current="$(issue_labels "$issue")"
  keep="$(printf '%s\n' "$current" | grep -vxF -f <(status_labels) || true)"
  printf '%s\n%s\n' "$keep" "$target" | sed '/^$/d' |
    jq -R . | jq -s '{labels: .}' > "$RUNNER_TEMP/julesops-labels.json"
  if [ "$DRY_RUN" = "true" ]; then
    echo "[dry-run] set #$issue status to '$target'"
  else
    gh api -X PUT "repos/$REPO/issues/$issue/labels" --input "$RUNNER_TEMP/julesops-labels.json" > /dev/null
  fi
  echo "Issue #$issue -> $target"
}

comment_issue() {
  gh_write issue comment "$1" --repo "$REPO" --body "$2"
}

comment_pr() {
  gh_write pr comment "$1" --repo "$REPO" --body "$2"
}

is_maintainer() {
  case "$1" in
    OWNER | MEMBER | COLLABORATOR) return 0 ;;
    *) return 1 ;;
  esac
}

# Succeed if any login read from stdin (one per line) is in JULESOPS_JULES_AUTHORS.
any_jules_author() {
  local logins author
  logins="$(tr '[:upper:]' '[:lower:]')"
  IFS=',' read -ra authors <<< "$JULESOPS_JULES_AUTHORS"
  for author in "${authors[@]}"; do
    author="$(echo "$author" | xargs | tr '[:upper:]' '[:lower:]')"
    if [ -n "$author" ] && printf '%s\n' "$logins" | grep -xF -- "$author" > /dev/null; then
      return 0
    fi
  done
  return 1
}

# Read a field from the triggering event payload.
event() {
  jq -r "$1 // empty" "$GITHUB_EVENT_PATH"
}
