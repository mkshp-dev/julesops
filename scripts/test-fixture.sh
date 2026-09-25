#!/usr/bin/env bash
# End-to-end smoke test: install the kit into copies of the fixture repo and validate them.
#
# Usage: scripts/test-fixture.sh [FIXTURE_PATH]
set -euo pipefail

# shellcheck source=lib/common.sh
source "$(dirname "${BASH_SOURCE[0]}")/lib/common.sh"

fixture_root="$JULESOPS_KIT_ROOT/${1:-examples/fixture-basic/repo}"
[ -d "$fixture_root" ] || die "Fixture repo not found at: $fixture_root"

work_dir="$(mktemp -d)"
trap 'rm -rf "$work_dir"' EXIT

new_fixture_copy() {
  local target
  target="$(mktemp -d "$work_dir/fixture.XXXXXX")"
  cp -R "$fixture_root/." "$target"
  git -C "$target" init -q -b main
  git -C "$target" add .
  git -C "$target" -c user.email=fixture@example.com -c user.name="JulesOps Fixture" commit -qm "fixture init"
  printf '%s\n' "$target"
}

scripts="$JULESOPS_SCRIPTS_DIR"
echo "Running JulesOps fixture smoke test..."

target="$(new_fixture_copy)"
"$scripts/install-julesops.sh" --dry-run "$target"
[ ! -e "$target/.github" ] || die "Dry-run install should not create .github files."
echo "  Dry-run install did not write files."

"$scripts/install-julesops.sh" --base-branch main "$target"
"$scripts/validate-kit.sh" "$target"
(cd "$target" && GITHUB_OUTPUT="" python3 .github/resolve-config.py)  # print to stdout, not the job output
"$scripts/bootstrap-labels.sh" --dry-run "$target"

config_path="$target/$JULESOPS_CONFIG_FILE"
printf '\n# fixture-preserve-marker\n' >> "$config_path"
"$scripts/install-julesops.sh" --upgrade "$target"
grep -q fixture-preserve-marker "$config_path" || die "Upgrade should preserve existing $JULESOPS_CONFIG_FILE."
echo "  Upgrade preserved config."

"$scripts/install-julesops.sh" --force "$target"
if grep -q fixture-preserve-marker "$config_path"; then
  die "Force install should overwrite generated config."
fi
echo "  Force install overwrote generated config."

missing_branch_target="$(new_fixture_copy)"
"$scripts/install-julesops.sh" --base-branch does-not-exist "$missing_branch_target"
if output="$("$scripts/validate-kit.sh" "$missing_branch_target" 2>&1)"; then
  die "Validation should fail when configured base branch is missing."
fi
printf '%s\n' "$output" | grep -q "does not exist" || die "Unexpected validation failure: $output"
echo "  Missing branch validation failed as expected."

echo "JulesOps fixture smoke test passed."
