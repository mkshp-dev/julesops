#!/usr/bin/env bash
# Tests for the action scripts in src/, run against a stubbed `gh` CLI.
#
# The stub serves fixture JSON for reads and records every call, so each test can
# assert which GitHub changes the action would make. No network or token needed.
#
# Usage: scripts/test-action.sh
set -euo pipefail

# shellcheck source=lib/common.sh
source "$(dirname "${BASH_SOURCE[0]}")/lib/common.sh"

src="$JULESOPS_KIT_ROOT/src"
work_dir="$(mktemp -d)"
trap 'rm -rf "$work_dir"' EXIT

passed=0
failed=0
pass() { echo "  [PASS] $1"; passed=$((passed + 1)); }
fail() { echo "  [FAIL] $1"; echo "         $2"; failed=$((failed + 1)); }

# --- gh stub ---
# Reads come from $FIXTURES/<key>.json, where <key> is the API path with / replaced by _
# (e.g. repos_o_r_issues_7_labels), or "<command>_<subcommand>" (e.g. issue_list).
# --jq is applied to the fixture. Every call is appended to $GH_LOG; PUT bodies are
# copied to $FIXTURES/../put-<key>.json.
mkdir -p "$work_dir/bin"
cat > "$work_dir/bin/gh" <<'STUB'
#!/usr/bin/env bash
set -euo pipefail
printf 'gh %s\n' "$*" >> "$GH_LOG"
jq_expr="" input="" method="GET" key=""
args=("$@")
if [ "${args[0]}" = "api" ]; then
  i=1
  while [ "$i" -lt "${#args[@]}" ]; do
    case "${args[$i]}" in
      -X) method="${args[$((i + 1))]}"; i=$((i + 2)) ;;
      --jq) jq_expr="${args[$((i + 1))]}"; i=$((i + 2)) ;;
      --input) input="${args[$((i + 1))]}"; i=$((i + 2)) ;;
      --paginate) i=$((i + 1)) ;;
      *) key="${args[$i]//\//_}"; i=$((i + 1)) ;;
    esac
  done
else
  key="${args[0]}_${args[1]}"
  for ((i = 0; i < ${#args[@]}; i++)); do
    if [ "${args[$i]}" = "--jq" ]; then jq_expr="${args[$((i + 1))]}"; fi
  done
fi
if [ "$method" != "GET" ]; then
  cp "$input" "$FIXTURES/../put-$key.json"
  exit 0
fi
case "$key" in
  issue_comment | pr_comment | issue_close | workflow_run | label_create | issue_edit) exit 0 ;;
esac
fixture="$FIXTURES/$key.json"
[ -f "$fixture" ] || fixture=/dev/null
if [ -n "$jq_expr" ]; then
  jq -r "$jq_expr" "$fixture"
else
  cat "$fixture"
fi
STUB
chmod +x "$work_dir/bin/gh"
export PATH="$work_dir/bin:$PATH"

# Export the default config as JULESOPS_* variables, like the action's setup step does.
env_file="$work_dir/julesops.env"
: > "$env_file"
(cd "$work_dir" && GITHUB_OUTPUT="" GITHUB_ENV="$env_file" JULESOPS_EXPORT_ENV=true \
  python3 "$JULESOPS_KIT_ROOT/templates/resolve-config.py" > /dev/null 2>&1)
while IFS='=' read -r name value; do export "$name=$value"; done < "$env_file"
export JULESOPS_ACTION_PATH="$JULESOPS_KIT_ROOT"
export JULESOPS_REQUIRE_ISSUE_LINK=true
export GITHUB_REPOSITORY=o/r

# Start a fresh scenario: empty fixtures, log, and outputs.
case_dir=""
new_case() {
  case_dir="$(mktemp -d "$work_dir/case.XXXXXX")"
  mkdir -p "$case_dir/fixtures"
  export FIXTURES="$case_dir/fixtures" GH_LOG="$case_dir/gh.log" RUNNER_TEMP="$case_dir"
  export GITHUB_OUTPUT="$case_dir/output" GITHUB_EVENT_PATH="$case_dir/event.json"
  export JULESOPS_DRY_RUN=false JULESOPS_DISPATCH_WORKFLOW=""
  export GITHUB_WORKFLOW_REF="o/r/.github/workflows/julesops.yml@refs/heads/main"
  : > "$GH_LOG"
  : > "$GITHUB_OUTPUT"
}
fixture() { cat > "$FIXTURES/$1.json"; }
labels_fixture() {  # labels_fixture ISSUE LABEL...
  local issue="$1"; shift
  printf '%s\n' "$@" | jq -R '{name: .}' | jq -s . > "$FIXTURES/repos_o_r_issues_${issue}_labels.json"
}
run() { (cd "$case_dir" && bash "$src/$1") > "$case_dir/stdout" 2>&1; }
output_of() { sed -n "s/^$1=//p" "$GITHUB_OUTPUT" | tail -n1; }
logged() { grep -qF -- "$1" "$GH_LOG"; }
put_labels() { jq -r '.labels | join(",")' "$case_dir/put-repos_o_r_issues_$1_labels.json" 2>/dev/null; }

expect_eq() {  # expect_eq NAME EXPECTED ACTUAL
  if [ "$3" = "$2" ]; then pass "$1"; else fail "$1" "Expected '$2', got '$3'"; fi
}
expect_logged() {
  if logged "$2"; then pass "$1"; else fail "$1" "No gh call containing: $2"; fi
}
expect_not_logged() {
  if logged "$2"; then fail "$1" "Unexpected gh call containing: $2"; else pass "$1"; fi
}

echo
echo "dispatch-select.sh"

new_case
fixture issue_list <<'EOF'
[{"number": 5, "createdAt": "2026-01-03T00:00:00Z", "labels": [{"name": "jules-queue"}, {"name": "status:todo"}]},
 {"number": 3, "createdAt": "2026-01-02T00:00:00Z", "labels": [{"name": "jules-queue"}, {"name": "bug"}]},
 {"number": 2, "createdAt": "2026-01-01T00:00:00Z", "labels": [{"name": "jules-queue"}, {"name": "status:failed"}]}]
EOF
fixture issue_view <<'EOF'
{"title": "Add a greeting", "body": "Print hello.", "url": "https://github.com/o/r/issues/3"}
EOF
run dispatch-select.sh
expect_eq "picks the oldest queued issue, skipping failed ones" 3 "$(output_of issue_number)"
expect_eq "an issue with only the queue label counts as queued" true "$(output_of has_todo)"
if grep -q "Print hello." "$GITHUB_OUTPUT" && grep -q "JulesOps core instructions" "$GITHUB_OUTPUT"; then
  pass "prompt includes the issue body and the bundled core instructions"
else
  fail "prompt includes the issue body and the bundled core instructions" "$(head -c 300 "$GITHUB_OUTPUT")"
fi

new_case
fixture issue_list <<'EOF'
[{"number": 9, "createdAt": "2026-01-01T00:00:00Z", "labels": [{"name": "jules-queue"}, {"name": "status:review"}]},
 {"number": 10, "createdAt": "2026-01-02T00:00:00Z", "labels": [{"name": "jules-queue"}, {"name": "status:todo"}]}]
EOF
run dispatch-select.sh
expect_eq "an active issue holds the queue" "true:9" "$(output_of has_active):$(output_of active_issue)"
expect_eq "no issue selected while one is active" "" "$(output_of issue_number)"

new_case
fixture issue_list <<< '[]'
run dispatch-select.sh
expect_eq "empty queue selects nothing" false "$(output_of has_todo)"

echo
echo "lib.sh set_status"

new_case
labels_fixture 7 jules-queue status:in-progress bug
# shellcheck source=../src/lib.sh
(cd "$case_dir" && source "$src/lib.sh" && set_status 7 status:review) > /dev/null
expect_eq "replaces the status label and keeps other labels" "jules-queue,bug,status:review" "$(put_labels 7)"

echo
echo "sync-pr.sh"

pr_event() {  # pr_event ACTION BODY [MERGED] [BASE]
  jq -n --arg action "$1" --arg body "$2" --argjson merged "${3:-false}" --arg base "${4:-main}" \
    '{action: $action, pull_request: {number: 42, body: $body, user: {login: "maintainer"},
      base: {ref: $base}, merged: $merged}}' > "$GITHUB_EVENT_PATH"
}

new_case
pr_event opened "Did the thing"
fixture repos_o_r_pulls_42_commits <<< '[{"author": {"login": "google-labs-jules[bot]"}}]'
run sync-pr.sh
expect_logged "warns when a Jules PR (by commit author) has no issue link" "pr comment 42"

new_case
pr_event opened $'Did the thing\n\n*PR created automatically by Jules for task [1](https://jules.google.com/task/1)*'
fixture repos_o_r_pulls_42_commits <<< '[{"author": {"login": "maintainer"}}]'
run sync-pr.sh
expect_logged "warns when a Jules PR (by task link) has no issue link" "pr comment 42"

new_case
pr_event opened "A human change"
fixture repos_o_r_pulls_42_commits <<< '[{"author": {"login": "maintainer"}}]'
run sync-pr.sh
expect_not_logged "does not warn on human PRs" "pr comment"

new_case
pr_event opened "Closes #7"
labels_fixture 7 jules-queue status:in-progress
fixture repos_o_r_pulls_42_commits <<< '[{"author": {"login": "google-labs-jules[bot]"}}]'
run sync-pr.sh
expect_eq "linked Jules PR opened moves the issue to review" "jules-queue,status:review" "$(put_labels 7)"

new_case
pr_event opened "Fixes #7" false develop
labels_fixture 7 jules-queue status:in-progress
export JULESOPS_TARGET_BASE_BRANCH_ONLY=true
run sync-pr.sh
export JULESOPS_TARGET_BASE_BRANCH_ONLY=false
expect_eq "PR against the wrong base branch blocks the issue" "jules-queue,status:blocked" "$(put_labels 7)"

new_case
pr_event closed "Resolves #7" true
labels_fixture 7 jules-queue status:review
run sync-pr.sh
expect_eq "merged PR marks the issue done" "jules-queue,status:done" "$(put_labels 7)"
expect_logged "merged PR closes the issue" "issue close 7"

new_case
pr_event closed "Closes #7" false
labels_fixture 7 jules-queue status:review
run sync-pr.sh
expect_eq "PR closed without merge blocks the issue" "jules-queue,status:blocked" "$(put_labels 7)"

new_case
pr_event closed "Closes #8" true
labels_fixture 8 bug
run sync-pr.sh
expect_not_logged "ignores PRs linked to non-Jules issues" "issue close"

echo
echo "sync-comment.sh"

comment_event() {  # comment_event BODY LOGIN TYPE ASSOCIATION STATUS_LABEL
  jq -n --arg body "$1" --arg login "$2" --arg type "$3" --arg assoc "$4" --arg status "$5" \
    '{action: "created", issue: {number: 7, labels: [{name: "jules-queue"}, {name: $status}]},
      comment: {body: $body, user: {login: $login, type: $type}, author_association: $assoc}}' > "$GITHUB_EVENT_PATH"
}

new_case
comment_event $'## Blocked\n\nNeed credentials.' "google-labs-jules[bot]" Bot NONE status:in-progress
labels_fixture 7 jules-queue status:in-progress
run sync-comment.sh
expect_eq "blocked marker from Jules blocks the issue" "jules-queue,status:blocked" "$(put_labels 7)"

new_case
comment_event "## Blocked" "drive-by" User NONE status:in-progress
labels_fixture 7 jules-queue status:in-progress
run sync-comment.sh
expect_eq "blocked marker from an outside user is ignored" "" "$(put_labels 7)"

new_case
comment_event "/jules retry" "maintainer" User OWNER status:failed
labels_fixture 7 jules-queue status:failed
run sync-comment.sh
expect_eq "/jules retry by a maintainer requeues the issue" "jules-queue,status:todo" "$(put_labels 7)"
expect_logged "/jules retry starts the calling workflow" "workflow run julesops.yml"

new_case
comment_event "/jules retry" "maintainer" User MEMBER status:blocked
labels_fixture 7 jules-queue status:blocked
export JULESOPS_DISPATCH_WORKFLOW=jules-dispatch.yml
run sync-comment.sh
expect_logged "/jules retry starts dispatch-workflow when set" "workflow run jules-dispatch.yml"

new_case
comment_event "/jules retry" "drive-by" User NONE status:failed
run sync-comment.sh
expect_eq "/jules retry by a non-maintainer changes nothing" "" "$(put_labels 7)"
expect_logged "/jules retry by a non-maintainer is told why" "Permission denied"

new_case
comment_event "please /jules retry this" "maintainer" User OWNER status:failed
run sync-comment.sh
expect_not_logged "comments that are not exact commands are ignored" "workflow run"

echo
echo "dry run"

new_case
comment_event "/jules retry" "maintainer" User OWNER status:failed
labels_fixture 7 jules-queue status:failed
export JULESOPS_DRY_RUN=true
run sync-comment.sh
export JULESOPS_DRY_RUN=false
expect_eq "dry run sends no label changes" "" "$(put_labels 7)"
expect_not_logged "dry run sends no comments or workflow runs" "workflow run"

echo
echo "────────────────────────────────────────────"
echo "  Results: $passed passed, $failed failed"
echo "────────────────────────────────────────────"
if [ "$failed" -gt 0 ]; then
  echo "FAIL: $failed test(s) failed."
  exit 1
fi
echo "PASS: All $passed action tests passed."
