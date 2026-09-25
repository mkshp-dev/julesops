#!/usr/bin/env bash
# Remove JulesOps-managed files from a target repository.
#
# .github/julesops.yml and .github/jules-repo.md hold user-customized content and
# are preserved unless --include-config is given.
#
# Usage: scripts/uninstall-julesops.sh [--include-config] [--dry-run] TARGET_REPO
set -euo pipefail

# shellcheck source=lib/common.sh
source "$(dirname "${BASH_SOURCE[0]}")/lib/common.sh"

include_config=false
dry_run=false
target_repo=""

while [ $# -gt 0 ]; do
  case "$1" in
    --include-config) include_config=true; shift ;;
    --dry-run) dry_run=true; shift ;;
    -h | --help) echo "Usage: uninstall-julesops.sh [--include-config] [--dry-run] TARGET_REPO"; exit 0 ;;
    -*) die "Unknown option: $1" ;;
    *) target_repo="$1"; shift ;;
  esac
done

[ -n "$target_repo" ] || die "Usage: uninstall-julesops.sh [--include-config] [--dry-run] TARGET_REPO"
[ -d "$target_repo" ] || die "Target repository does not exist: $target_repo"
target_root="$(abs_path "$target_repo")"

if $dry_run; then
  echo "[DryRun] --- JulesOps Uninstall Preview ---"
  echo "[DryRun] Target: $target_root"
  if $include_config; then
    echo "[DryRun] Mode: Full removal including config and repo instructions"
  else
    echo "[DryRun] Mode: Managed files only (julesops.yml + jules-repo.md preserved)"
  fi
  echo
fi

to_remove=()
for entry in "${JULESOPS_MANAGED_FILES[@]}"; do
  relative="$(managed_target "$entry")"
  if [ "$relative" != "$JULESOPS_CONFIG_FILE" ] || $include_config; then
    to_remove+=("$relative")
  fi
done
if $include_config; then
  to_remove+=("$JULESOPS_REPO_INSTRUCTIONS")
fi

removed=0
skipped=0
for relative in "${to_remove[@]}"; do
  path="$target_root/$relative"
  if [ -e "$path" ]; then
    if $dry_run; then
      echo "[DryRun] Would remove: $path"
    else
      rm -f "$path"
      echo "Removed: $path"
    fi
    removed=$((removed + 1))
  else
    if $dry_run; then echo "[DryRun] Not present (skip): $path"; fi
    skipped=$((skipped + 1))
  fi
done

if ! $include_config; then
  echo
  echo "Preserved (user config): $JULESOPS_CONFIG_FILE"
  echo "Preserved (user config): $JULESOPS_REPO_INSTRUCTIONS"
  echo
  echo "To remove these as well, re-run with --include-config."
fi

for dir in .github/ISSUE_TEMPLATE .github/workflows; do
  full_dir="$target_root/$dir"
  if [ -d "$full_dir" ] && [ -z "$(ls -A "$full_dir")" ]; then
    if $dry_run; then
      echo "[DryRun] Would remove empty directory: $full_dir"
    else
      rmdir "$full_dir"
      echo "Removed empty directory: $full_dir"
    fi
  fi
done

echo
if $dry_run; then
  echo "[DryRun] --- End of Preview (No files were modified) ---"
  exit 0
fi

repo_name="$(github_repo_name "$target_root")"
cat <<EOF
JulesOps uninstall complete.
  Files removed: $removed
  Not present:   $skipped

Remember to:
  - Remove the JULES_API_KEY secret if no longer needed:
    https://github.com/${repo_name:-OWNER/REPO}/settings/secrets/actions
  - Delete any open Jules task issues if desired.
  - Remove JulesOps labels if desired (jules-queue, status:*).
EOF
