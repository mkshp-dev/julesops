#!/usr/bin/env bash
# JulesOps workflow logic integration tests.
#
# Covers config resolver output, custom labels, resolver defaults, the installed
# comment parser, duplicate-install detection, and uninstall behavior. Does not call
# Jules or require JULES_API_KEY, so it is safe to run in CI on public repositories.
#
# Usage: scripts/test-workflow-logic.sh [FIXTURE_PATH]
set -euo pipefail

# shellcheck source=lib/common.sh
source "$(dirname "${BASH_SOURCE[0]}")/lib/common.sh"

fixture_root="$JULESOPS_KIT_ROOT/${1:-examples/fixture-basic/repo}"
scripts="$JULESOPS_SCRIPTS_DIR"
work_dir="$(mktemp -d)"
trap 'rm -rf "$work_dir"' EXIT

passed=0
failed=0

pass() {
  echo "  [PASS] $1"
  passed=$((passed + 1))
}

fail() {
  echo "  [FAIL] $1"
  echo "         $2"
  failed=$((failed + 1))
}

# Usage: expect NAME EXPECTED ACTUAL
expect() {
  if [ "$3" = "$2" ]; then
    pass "$1 = '$2'"
  else
    fail "$1" "Expected '$2', got '$3'"
  fi
}

# Create a committed copy of the fixture on BRANCH and install the kit into it.
new_test_repo() {
  local branch="${1:-main}" target
  target="$(mktemp -d "$work_dir/repo.XXXXXX")"
  cp -R "$fixture_root/." "$target"
  git -C "$target" init -q -b "$branch"
  git -C "$target" add .
  git -C "$target" -c user.email=test@example.com -c user.name=WFTest commit -qm init
  "$scripts/install-julesops.sh" --base-branch "$branch" --skip-labels "$target" > /dev/null
  printf '%s\n' "$target"
}

# Print the resolver's value for KEY in REPO, reading REPO's .github/julesops.yml the way
# the action does. GITHUB_OUTPUT is cleared because the resolver writes there instead of
# stdout when it is set (as it is on Actions runners).
resolved() {
  (cd "$1" && GITHUB_OUTPUT="" python3 "$JULESOPS_KIT_ROOT/templates/resolve-config.py" 2>/dev/null) | awk -v k="$2" 'index($0, k "=") == 1 { print substr($0, length(k) + 2); exit }'
}

echo
echo "Suite 1: Config resolver output"
repo1="$(new_test_repo)"
while IFS='=' read -r key expected; do
  expect "resolver: $key" "$expected" "$(resolved "$repo1" "$key")"
done <<'EOF'
enabled=true
base_branch=main
queue_label=jules-queue
status_todo=status:todo
status_in_progress=status:in-progress
status_review=status:review
status_blocked=status:blocked
status_failed=status:failed
status_done=status:done
core_instructions=.github/jules-core.md
repo_instructions=.github/jules-repo.md
close_on_merge=true
jules_authors=google-labs-jules[bot]
EOF

# Installed workflows are thin wrappers around the action, pinned to this kit version.
for workflow in jules-dispatch jules-state-sync jules-watchdog; do
  expect "installed $workflow.yml action ref" "$JULESOPS_ACTION_REF" \
    "$(grep -oE 'mkshp-dev/julesops@[^[:space:]]+' "$repo1/.github/workflows/$workflow.yml" | sort -u)"
done
for legacy in "${JULESOPS_LEGACY_FILES[@]}"; do
  if [ -e "$repo1/$legacy" ]; then
    fail "fresh install: $legacy not installed" "File exists"
  else
    pass "fresh install: $legacy not installed"
  fi
done

echo
echo "Suite 2: Non-default base branch"
repo2="$(new_test_repo Dev)"
expect "resolver: non-main base_branch" Dev "$(resolved "$repo2" base_branch)"

echo
echo "Suite 3: Custom label names"
repo3="$(new_test_repo)"
config3="$repo3/$JULESOPS_CONFIG_FILE"
sed -e 's/status:todo/task:queued/' -e 's/status:in-progress/task:active/' -e 's/status:/task:/' \
  "$config3" > "$config3.tmp" && mv "$config3.tmp" "$config3"
while IFS='=' read -r key expected; do
  expect "custom label: $key" "$expected" "$(resolved "$repo3" "$key")"
done <<'EOF'
status_todo=task:queued
status_in_progress=task:active
status_review=task:review
status_blocked=task:blocked
status_failed=task:failed
status_done=task:done
EOF

echo
echo "Suite 4: Resolver defaults for missing fields"
repo4="$(new_test_repo)"
printf 'julesops:\n  enabled: true\n  repository:\n    base_branch: main\n' > "$repo4/$JULESOPS_CONFIG_FILE"
while IFS='=' read -r key expected; do
  expect "default: $key" "$expected" "$(resolved "$repo4" "$key")"
done <<'EOF'
queue_label=jules-queue
status_todo=status:todo
status_in_progress=status:in-progress
close_on_merge=true
stale_in_progress_hours=24
stale_review_hours=72
jules_authors=google-labs-jules[bot]
blocked_holds_queue=false
max_attempts=3
fail_in_progress_hours=72
EOF

echo
echo "Suite 4b: Config file is optional"
repo4b="$(new_test_repo)"
rm "$repo4b/$JULESOPS_CONFIG_FILE"
expect "no config: enabled" true "$(resolved "$repo4b" enabled)"
expect "no config: queue_label" jules-queue "$(resolved "$repo4b" queue_label)"
expect "no config: base_branch" main "$(resolved "$repo4b" base_branch)"

echo
echo "Suite 4c: Upgrade removes files older kits installed"
repo4c="$(new_test_repo)"
for legacy in "${JULESOPS_LEGACY_FILES[@]}"; do
  printf '# JulesOps kit version: v0.4.0\n' > "$repo4c/$legacy"
done
printf 'keep me\n' > "$repo4c/.github/unrelated.py"
"$scripts/install-julesops.sh" --upgrade --skip-labels "$repo4c" > /dev/null
for legacy in "${JULESOPS_LEGACY_FILES[@]}"; do
  if [ -e "$repo4c/$legacy" ]; then
    fail "upgrade: removes $legacy" "File still exists"
  else
    pass "upgrade: removes $legacy"
  fi
done
if [ -f "$repo4c/.github/unrelated.py" ]; then
  pass "upgrade: leaves unrelated .github files alone"
else
  fail "upgrade: leaves unrelated .github files alone" "File was removed"
fi

echo
echo "Suite 5: Duplicate install detection"
repo5="$(new_test_repo)"
if dup_output="$("$scripts/install-julesops.sh" "$repo5" < /dev/null 2>&1)"; then
  fail "duplicate install: exits non-zero on non-TTY without --upgrade/--force" "Expected a non-zero exit code"
else
  pass "duplicate install: exits non-zero on non-TTY without --upgrade/--force"
fi
if printf '%s' "$dup_output" | grep "Prior JulesOps install detected" > /dev/null; then
  pass "duplicate install: banner message shown"
else
  fail "duplicate install: banner message" "Expected 'Prior JulesOps install detected' in output"
fi

echo
echo "Suite 6: Uninstall removes managed files"
repo6="$(new_test_repo)"
"$scripts/uninstall-julesops.sh" "$repo6" > /dev/null
all_removed=true
for entry in "${JULESOPS_MANAGED_FILES[@]}"; do
  file="$(managed_target "$entry")"
  if [ "$file" != "$JULESOPS_CONFIG_FILE" ] && [ -e "$repo6/$file" ]; then
    fail "uninstall: $file should be removed" "File still exists"
    all_removed=false
  fi
done
if $all_removed; then pass "uninstall: all managed files removed"; fi
for file in "$JULESOPS_CONFIG_FILE" "$JULESOPS_REPO_INSTRUCTIONS"; do
  if [ -f "$repo6/$file" ]; then
    pass "uninstall: $file preserved (no --include-config)"
  else
    fail "uninstall: $file preserved" "File was removed without --include-config"
  fi
done

"$scripts/uninstall-julesops.sh" --include-config "$repo6" > /dev/null
if [ ! -e "$repo6/$JULESOPS_CONFIG_FILE" ] && [ ! -e "$repo6/$JULESOPS_REPO_INSTRUCTIONS" ]; then
  pass "uninstall --include-config: config and repo instructions removed"
else
  fail "uninstall --include-config" "Config or repo instructions still present"
fi

echo
echo "────────────────────────────────────────────"
echo "  Results: $passed passed, $failed failed"
echo "────────────────────────────────────────────"

if [ "$failed" -gt 0 ]; then
  echo "FAIL: $failed test(s) failed."
  exit 1
fi
echo "PASS: All $passed workflow logic tests passed."
